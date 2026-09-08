const express = require('express');
const router = express.Router();
const { getIsFallback } = require('../config/db');
const Station = require('../models/Station');
const Train = require('../models/Train');
const { predictWaitlist, calculateDynamicFare, getDelayReplanning } = require('../services/aiProxyService');

// Seed cache store for dataset fallback
let stationsCache = [];
let trainsCache = [];

const setSeedCache = (stations, trains) => {
  stationsCache = stations;
  trainsCache = trains;
};

// GET /api/trains - All trains
router.get('/', async (req, res) => {
  try {
    let allTrains = [];
    if (!getIsFallback()) {
      allTrains = await Train.find({}, 'trainNo trainName trainType source destination currentDelayMinutes status');
      if (allTrains.length === 0) allTrains = trainsCache;
    } else {
      allTrains = trainsCache;
    }
    res.json(allTrains.map(t => ({
      trainNo: t.trainNo,
      trainName: t.trainName,
      trainType: t.trainType,
      source: t.source,
      destination: t.destination,
      currentDelayMinutes: t.currentDelayMinutes || 0,
      status: t.status || 'On Time'
    })));
  } catch (err) {
    res.json(trainsCache.map(t => ({
      trainNo: t.trainNo,
      trainName: t.trainName,
      trainType: t.trainType,
      source: t.source,
      destination: t.destination,
      currentDelayMinutes: t.currentDelayMinutes || 0,
      status: t.status || 'On Time'
    })));
  }
});

// GET /api/trains/stations - All railway stations
router.get('/stations', async (req, res) => {
  try {
    if (!getIsFallback()) {
      const stations = await Station.find().sort({ stationName: 1 });
      if (stations.length > 0) return res.json(stations);
    }
    return res.json(stationsCache);
  } catch (err) {
    res.json(stationsCache);
  }
});

// GET /api/trains/search - Search trains between source & destination
router.get('/search', async (req, res) => {
  try {
    const { from, to, date, travelClass = '3A' } = req.query;
    const normalizedFrom = (from || '').trim().toUpperCase();
    const normalizedTo = (to || '').trim().toUpperCase();
    const normalizedClass = (travelClass || '3A').toUpperCase();
    const validClasses = new Set(['1A', '2A', '3A', '3E', 'SL', 'CC', 'EC', 'GS']);

    if (!normalizedFrom || !normalizedTo) {
      return res.status(400).json({ error: 'Source (from) and Destination (to) required' });
    }

    if (normalizedFrom === normalizedTo) {
      return res.status(400).json({ error: 'Source and destination stations must be different.' });
    }

    if (!validClasses.has(normalizedClass)) {
      return res.status(400).json({ error: 'Invalid travel class selected.' });
    }

    if (date) {
      const inputDate = new Date(`${date}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (Number.isNaN(inputDate.getTime()) || inputDate < today) {
        return res.status(400).json({ error: 'Travel date must be today or a future date.' });
      }
    }

    let allTrains = [];
    if (!getIsFallback()) {
      allTrains = await Train.find();
      if (allTrains.length === 0) allTrains = trainsCache;
    } else {
      allTrains = trainsCache;
    }

    // Filter trains that stop at both source and destination in order
    const matchingTrains = [];
    for (const train of allTrains) {
      const stops = train.stops || [];
      const fromStopIndex = stops.findIndex(s => s.stationCode === normalizedFrom);
      const toStopIndex = stops.findIndex(s => s.stationCode === normalizedTo);

      if (fromStopIndex !== -1 && toStopIndex !== -1 && fromStopIndex < toStopIndex) {
        const fromStop = stops[fromStopIndex];
        const toStop = stops[toStopIndex];
        const distanceKm = Math.abs(toStop.distanceFromOriginKm - fromStop.distanceFromOriginKm) || 450;

        const totalSeatsForClass = train.totalSeats?.[normalizedClass] || 60;
        const bookedSeatsForClass = train.bookedSeats?.[normalizedClass] || 25;
        const availableCount = totalSeatsForClass - bookedSeatsForClass;

        let seatStatus = 'Available';
        let waitlistPosition = 0;

        if (availableCount <= 0 && availableCount > -10) {
          seatStatus = 'RAC';
          waitlistPosition = Math.abs(availableCount);
        } else if (availableCount <= -10) {
          seatStatus = 'Waitlist';
          waitlistPosition = Math.abs(availableCount) - 9;
        }

        // Call AI proxy for XGBoost waitlist probability if Waitlisted/RAC
        let aiWaitlist = { confirmationProbability: 100, explanation: 'High seat availability' };
        if (seatStatus !== 'Available') {
          aiWaitlist = await predictWaitlist(train.trainNo, normalizedClass, waitlistPosition, date || '2026-08-25');
        }

        // Call AI proxy for dynamic fare calculation
        const fareInfo = await calculateDynamicFare({
          trainNo: train.trainNo,
          trainType: train.trainType || 'Superfast',
          travelClass: normalizedClass,
          distanceKm,
          bookingCount: bookedSeatsForClass,
          occupancyRate: Math.min(1.0, bookedSeatsForClass / totalSeatsForClass),
          travelDate: date || '2026-08-25',
          mealCategory: 'No Meal'
        });

        matchingTrains.push({
          trainNo: train.trainNo,
          trainName: train.trainName,
          trainType: train.trainType,
          source: train.source,
          destination: train.destination,
          departureTime: fromStop.departure || '08:00',
          arrivalTime: toStop.arrival || '18:00',
          fromStation: normalizedFrom,
          toStation: normalizedTo,
          distanceKm,
          seatStatus,
          availableSeats: Math.max(0, availableCount),
          waitlistPosition,
          confirmationProbability: aiWaitlist.confirmationProbability,
          aiExplanation: aiWaitlist.explanation,
          travelClass: normalizedClass,
          travelDate: date || new Date().toISOString().split('T')[0],
          fare: fareInfo,
          currentDelayMinutes: train.currentDelayMinutes || 0,
          coachComposition: train.coachComposition || ['ENG', 'GS', 'S1', 'S2', 'B1', 'B2', 'B3', 'AB1', 'A1', 'HA1', 'H1', 'PC', 'GS'],
          cateringTier: train.cateringTier || 'standard'
        });
      }
    }

    res.json({
      searchQuery: { from: normalizedFrom, to: normalizedTo, date, travelClass: normalizedClass },
      count: matchingTrains.length,
      trains: matchingTrains
    });
  } catch (err) {
    console.error('Search Error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/trains/:trainNo/live-status - Where Is My Train / NTES status
router.get('/:trainNo/live-status', async (req, res) => {
  try {
    const { trainNo } = req.params;
    const normalizedTrainNo = String(trainNo || '').trim();

    if (!normalizedTrainNo || !/^\d{1,5}$/.test(normalizedTrainNo)) {
      return res.status(400).json({ error: 'A valid train number is required.' });
    }

    let train = trainsCache.find(t => t.trainNo === normalizedTrainNo);
    if (!train && !getIsFallback()) {
      train = await Train.findOne({ trainNo: normalizedTrainNo });
    }

    if (!train) return res.status(404).json({ error: 'Train not found' });

    const delayMinutes = train.currentDelayMinutes || 0;
    const stops = train.stops || [];
    
    // Position along stops
    const currentStopIndex = Math.min(stops.length - 1, Math.max(1, Math.floor(stops.length / 2)));
    const currentStop = stops[currentStopIndex];
    const nextStop = stops[Math.min(stops.length - 1, currentStopIndex + 1)];

    // Fetch Delay Replanning from AI service or dynamic route scanner
    let aiReplan = await getDelayReplanning(trainNo, delayMinutes, 'MAIN_LINE');

    // If train is delayed, enrich alternative trains with same-route trains from cache/DB
    if (delayMinutes >= 20) {
      const allTrains = trainsCache.length > 0 ? trainsCache : (!getIsFallback() ? await Train.find() : []);
      const routeAlternatives = allTrains
        .filter(t => t.trainNo !== trainNo && t.source === train.source && t.destination === train.destination && (t.currentDelayMinutes || 0) < delayMinutes)
        .map(t => ({
          trainNo: t.trainNo,
          trainName: t.trainName,
          departure: t.stops?.[0]?.departure || '16:30',
          arrival: t.stops?.[t.stops.length - 1]?.arrival || '08:30',
          availableSeats: (t.totalSeats?.['3A'] || 64) - (t.bookedSeats?.['3A'] || 28),
          timeSavedMinutes: Math.max(15, delayMinutes - (t.currentDelayMinutes || 0)),
          explanation: `Same route service operating on-time with ${Math.max(0, (t.totalSeats?.['3A'] || 64) - (t.bookedSeats?.['3A'] || 28))} guaranteed berths available.`
        }));

      if (routeAlternatives.length > 0) {
        aiReplan = {
          isDelayed: true,
          delayMinutes,
          recommendationAvailable: true,
          alternativeTrains: routeAlternatives
        };
      }
    }

    res.json({
      trainNo: train.trainNo,
      trainName: train.trainName,
      trainType: train.trainType,
      source: train.source,
      destination: train.destination,
      currentDelayMinutes: delayMinutes,
      status: delayMinutes === 0 ? 'Right Time (On Time)' : `Running Late by ${delayMinutes} mins`,
      currentStation: currentStop?.stationCode || 'GWL',
      nextStation: nextStop?.stationCode || 'VGLJ',
      currentSpeedKmH: delayMinutes > 0 ? 82 : 110,
      platformNo: 2,
      lastUpdated: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      signalStatus: delayMinutes > 0 ? 'Caution / Amber' : 'All Clear / Green',
      stops: stops.map((s, idx) => ({
        ...s,
        isCompleted: idx <= currentStopIndex,
        isCurrent: idx === currentStopIndex,
        actualArrival: s.arrival,
        actualDeparture: s.departure,
        platformNo: (idx % 4) + 1
      })),
      aiReplanning: aiReplan
    });
  } catch (err) {
    console.error('Live Status Error:', err);
    res.status(500).json({ error: 'Live status failed' });
  }
});

// GET /api/trains/station/:stationCode/live-board - NTES Live Station Board (Departures & Arrivals)
router.get('/station/:stationCode/live-board', async (req, res) => {
  try {
    const { stationCode } = req.params;
    const cleanCode = String(stationCode || '').trim().toUpperCase();

    if (!cleanCode || !/^[A-Z]{3,6}$/.test(cleanCode)) {
      return res.status(400).json({ error: 'A valid station code is required, e.g. NDLS or SBC.' });
    }

    let allTrains = trainsCache;
    if (allTrains.length === 0 && !getIsFallback()) {
      allTrains = await Train.find();
    }

    const stationTrains = [];
    for (const train of allTrains) {
      const stop = (train.stops || []).find(s => s.stationCode === cleanCode);
      if (stop) {
        const delay = train.currentDelayMinutes || 0;
        stationTrains.push({
          trainNo: train.trainNo,
          trainName: train.trainName,
          trainType: train.trainType,
          source: train.source,
          destination: train.destination,
          scheduledArrival: stop.arrival,
          scheduledDeparture: stop.departure,
          platformNo: (stop.sequence % 4) + 1,
          delayMinutes: delay,
          status: delay === 0 ? 'ON TIME' : `DELAYED ${delay}m`,
          expectedTime: stop.departure
        });
      }
    }

    res.json({
      stationCode: cleanCode,
      totalTrains: stationTrains.length,
      trains: stationTrains
    });
  } catch (err) {
    console.error('Station Live Board Error:', err);
    res.status(500).json({ error: 'Failed to fetch station live board' });
  }
});

const updateTrainDelayInMemory = (trainNo, delayMinutes, status) => {
  const train = trainsCache.find(t => t.trainNo === trainNo);
  if (train) {
    train.currentDelayMinutes = delayMinutes;
    train.status = status || (delayMinutes > 0 ? `Delayed by ${delayMinutes} mins` : 'On Time');
  }
};

module.exports = { router, setSeedCache, updateTrainDelayInMemory };

