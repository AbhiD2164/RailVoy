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
    const { from, to, trainNo, date, travelClass = '3A' } = req.query;
    const normalizedFrom = (from || '').trim().toUpperCase();
    const normalizedTo = (to || '').trim().toUpperCase();
    const normalizedTrainNo = String(trainNo || '').trim();
    const normalizedClass = (travelClass || '3A').toUpperCase();
    const validClasses = new Set(['1A', '2A', '3A', '3E', 'SL', 'CC', 'EC', 'GS']);

    if (!normalizedTrainNo && (!normalizedFrom || !normalizedTo)) {
      return res.status(400).json({ error: 'Source (from) and Destination (to) required' });
    }

    if (!normalizedTrainNo && normalizedFrom === normalizedTo) {
      return res.status(400).json({ error: 'Source and destination stations must be different.' });
    }

    if (normalizedTrainNo && !/^\d{1,5}$/.test(normalizedTrainNo)) {
      return res.status(400).json({ error: 'A valid train number is required.' });
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

    if (normalizedTrainNo) {
      allTrains = allTrains.filter(train => String(train.trainNo) === normalizedTrainNo);
    }

    // Filter trains that stop at both source and destination in order
    const matchingTrains = [];
    for (const train of allTrains) {
      const stops = train.stops || [];
      const fromStopIndex = normalizedTrainNo ? 0 : stops.findIndex(s => s.stationCode === normalizedFrom);
      const toStopIndex = normalizedTrainNo ? stops.length - 1 : stops.findIndex(s => s.stationCode === normalizedTo);

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

        // Keep operational scoring server-side; the client only receives booking-facing status.
        let aiWaitlist = { confirmationProbability: 100, explanation: 'High seat availability' };
        const currentOccupancy = Math.min(1.0, bookedSeatsForClass / totalSeatsForClass);
        if (seatStatus !== 'Available') {
          aiWaitlist = await predictWaitlist(train.trainNo, normalizedClass, waitlistPosition, date || '2026-08-25', currentOccupancy);
        }

        // Call AI proxy for dynamic fare calculation
        const fareInfo = await calculateDynamicFare({
          trainNo: train.trainNo,
          trainName: train.trainName,
          trainType: train.trainType || 'Superfast',
          travelClass: normalizedClass,
          distanceKm,
          bookingCount: bookedSeatsForClass,
          occupancyRate: currentOccupancy,
          travelDate: date || '2026-08-25',
          mealCategory: 'No Meal',
          departureTime: fromStop.departure || '08:00',
          arrivalTime: toStop.arrival || '18:00'
        });

        matchingTrains.push({
          trainNo: train.trainNo,
          trainName: train.trainName,
          trainType: train.trainType,
          source: train.source,
          destination: train.destination,
          departureTime: fromStop.departure || '08:00',
          arrivalTime: toStop.arrival || '18:00',
          fromStation: normalizedTrainNo ? fromStop.stationCode : normalizedFrom,
          toStation: normalizedTrainNo ? toStop.stationCode : normalizedTo,
          distanceKm,
          seatStatus,
          availableSeats: Math.max(0, availableCount),
          waitlistPosition,
          confirmationProbability: aiWaitlist.confirmationProbability,
          travelClass: normalizedClass,
          travelDate: date || new Date().toISOString().split('T')[0],
          fare: {
            finalFare: fareInfo.finalFare,
            mealPrice: fareInfo.mealPrice
          },
          currentDelayMinutes: train.currentDelayMinutes || 0,
          coachComposition: train.coachComposition || ['ENG', 'GS', 'S1', 'S2', 'B1', 'B2', 'B3', 'AB1', 'A1', 'HA1', 'H1', 'PC', 'GS'],
          cateringTier: train.cateringTier || 'standard',
          pantryAvailable: train.pantryAvailable !== false,
          hasPantrycar: train.hasPantrycar != null ? train.hasPantrycar : (train.pantryAvailable !== false),
          runDays: train.runDays || [0, 1, 2, 3, 4, 5, 6]
        });
      }
    }

    res.json({
      searchQuery: { from: normalizedFrom, to: normalizedTo, trainNo: normalizedTrainNo, date, travelClass: normalizedClass },
      count: matchingTrains.length,
      trains: matchingTrains
    });
  } catch (err) {
    console.error('Search Error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/trains/alternatives - Nearby-date and same-route alternatives from the simulated dataset
router.get('/alternatives', async (req, res) => {
  try {
    const { from, to, date, travelClass = '3A', days = 2 } = req.query;
    const normalizedFrom = String(from || '').trim().toUpperCase();
    const normalizedTo = String(to || '').trim().toUpperCase();
    const normalizedClass = String(travelClass || '3A').trim().toUpperCase();
    const requestedDate = new Date(`${date}T00:00:00`);
    const range = Math.min(3, Math.max(1, Number(days) || 2));

    if (!normalizedFrom || !normalizedTo || Number.isNaN(requestedDate.getTime())) {
      return res.status(400).json({ error: 'from, to, and a valid date are required' });
    }

    let allTrains = [];
    if (!getIsFallback()) {
      allTrains = await Train.find();
      if (allTrains.length === 0) allTrains = trainsCache;
    } else {
      allTrains = trainsCache;
    }

    const alternatives = [];
    for (let offset = -range; offset <= range; offset += 1) {
      const candidateDate = new Date(requestedDate);
      candidateDate.setDate(requestedDate.getDate() + offset);
      if (candidateDate < new Date(new Date().setHours(0, 0, 0, 0))) continue;
      const isoDate = candidateDate.toISOString().split('T')[0];
      const dayOfWeek = candidateDate.getDay();

      for (const train of allTrains) {
        if (Array.isArray(train.runDays) && !train.runDays.includes(dayOfWeek)) continue;
        const stops = train.stops || [];
        const fromIndex = stops.findIndex(stop => stop.stationCode === normalizedFrom);
        const toIndex = stops.findIndex(stop => stop.stationCode === normalizedTo);
        const sameRoute = train.source === normalizedFrom && train.destination === normalizedTo;
        if ((!sameRoute && (fromIndex < 0 || toIndex < 0 || fromIndex >= toIndex))) continue;

        const total = train.totalSeats?.[normalizedClass] || 60;
        const booked = train.bookedSeats?.[normalizedClass] || 25;
        alternatives.push({
          trainNo: train.trainNo,
          trainName: train.trainName,
          trainType: train.trainType,
          from,
          to,
          travelDate: isoDate,
          dateOffset: offset,
          departureTime: stops[fromIndex]?.departure || '08:00',
          arrivalTime: stops[toIndex]?.arrival || '18:00',
          availableSeats: Math.max(0, total - booked),
          seatStatus: total > booked ? 'Available' : 'Waitlist',
          explanation: offset === 0
            ? 'Same-route option on the requested date from the simulated timetable.'
            : `Same-route option found ${Math.abs(offset)} day${Math.abs(offset) === 1 ? '' : 's'} ${offset < 0 ? 'earlier' : 'later'}.`
        });
      }
    }

    alternatives.sort((a, b) => Math.abs(a.dateOffset) - Math.abs(b.dateOffset) || a.departureTime.localeCompare(b.departureTime));
    res.json({ requestedDate: date, count: alternatives.length, alternatives: alternatives.slice(0, 20) });
  } catch (err) {
    console.error('Alternative search error:', err);
    res.status(500).json({ error: 'Alternative search failed' });
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

    // If train is delayed >= 20min (or status is delayed), evaluate all feasible alternate trains
    if (delayMinutes >= 15 || train.status === 'Delayed') {
      const allTrains = trainsCache.length > 0 ? trainsCache : (!getIsFallback() ? await Train.find() : []);
      const scheduledDep = train.stops?.[0]?.departure || '08:00';
      const [sh, sm] = (scheduledDep.split(':').map(Number));
      const rescheduledMin = (sh * 60 + sm) + delayMinutes;

      // Find trains that share the route corridor or source/destination
      const routeAlternatives = allTrains
        .filter(t => {
          if (t.trainNo === trainNo) return false;
          const stops = t.stops || [];
          // Train shares source & destination OR stops at the same key stations
          const hasSource = t.source === train.source || stops.some(s => s.stationCode === train.source);
          const hasDest = t.destination === train.destination || stops.some(s => s.stationCode === train.destination);
          return hasSource && hasDest;
        })
        .map(t => {
          // Calculate vacant seats across all classes (3A, 2A, 1A, SL, CC)
          const classes = ['3A', '2A', 'SL', 'CC', '1A'];
          let vacantSum = 0;
          const classBreakdown = {};
          classes.forEach(c => {
            const tot = t.totalSeats?.[c] || 72;
            const bkd = t.bookedSeats?.[c] || 30;
            const avail = Math.max(0, tot - bkd);
            classBreakdown[c] = avail;
            vacantSum += avail;
          });

          return {
            trainNo: t.trainNo,
            trainName: t.trainName,
            trainType: t.trainType || 'Superfast',
            departure: t.stops?.[0]?.departure || '16:30',
            arrival: t.stops?.[t.stops.length - 1]?.arrival || '08:30',
            availableSeats: Math.max(1, vacantSum),
            classSeats: classBreakdown,
            timeSavedMinutes: Math.max(15, delayMinutes - (t.currentDelayMinutes || 0)),
            explanation: `Departs on-time along the corridor with verified vacant berths. Guaranteed seat reallocation.`
          };
        })
        .filter(t => t.availableSeats > 0);

      const N = routeAlternatives.length;
      const n = routeAlternatives.reduce((acc, t) => acc + t.availableSeats, 0);

      if (N > 0) {
        aiReplan = {
          isDelayed: true,
          delayMinutes,
          recommendationAvailable: true,
          alternateCount: N,
          totalVacantSeats: n,
          label: `${N} alternate trains available with ${n} vacant seats`,
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
      currentSpeedKmH: train.currentSpeedKmH ?? null,
      platformNo: currentStop?.platformNo ?? null,
      dataSource: process.env.RAILWAY_STATUS_API_URL ? 'configured railway status provider' : 'local operational simulation',
      lastUpdated: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      signalStatus: delayMinutes > 0 ? 'Caution / Amber' : 'All Clear / Green',
      stops: stops.map((s, idx) => ({
        ...s,
        isCompleted: idx <= currentStopIndex,
        isCurrent: idx === currentStopIndex,
        actualArrival: s.arrival,
        actualDeparture: s.departure,
        platformNo: s.platformNo ?? null
      })),
      aiReplan: aiReplan || {
        isDelayed: delayMinutes > 0,
        delayMinutes,
        recommendationAvailable: false,
        alternativeTrains: []
      }
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

// GET /api/trains/route-connectivity - Graph BFS connectivity between two stations
const { determineRouteConnectivity } = require('../services/routeGraphService');
router.get('/route-connectivity', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'Both from and to station codes are required.' });
    }
    const cleanFrom = String(from).trim().toUpperCase();
    const cleanTo = String(to).trim().toUpperCase();

    let allTrains = trainsCache;
    if (allTrains.length === 0 && !getIsFallback()) {
      allTrains = await Train.find();
    }
    let allStations = stationsCache;
    if (allStations.length === 0 && !getIsFallback()) {
      allStations = await Station.find();
    }

    const connectivity = determineRouteConnectivity(cleanFrom, cleanTo, allTrains, allStations);
    res.json(connectivity);
  } catch (err) {
    console.error('Route Connectivity Error:', err);
    res.status(500).json({ error: 'Route connectivity evaluation failed.' });
  }
});

// GET /api/trains/replan-options - Search connecting/alternative trains from intermediate station to new destination
router.get('/replan-options', async (req, res) => {
  try {
    const { from, to, date, travelClass = '3A' } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'Origin and destination station codes are required.' });
    }
    const cleanFrom = String(from).trim().toUpperCase();
    const cleanTo = String(to).trim().toUpperCase();

    let allTrains = trainsCache;
    if (allTrains.length === 0 && !getIsFallback()) {
      allTrains = await Train.find();
    }

    const options = [];
    for (const train of allTrains) {
      const stops = train.stops || [];
      const fromIdx = stops.findIndex(s => s.stationCode === cleanFrom);
      const toIdx = stops.findIndex(s => s.stationCode === cleanTo);
      if (fromIdx >= 0 && toIdx >= 0 && fromIdx < toIdx) {
        const fromStop = stops[fromIdx];
        const toStop = stops[toIdx];
        const distKm = Math.max(20, (toStop.distanceFromOriginKm || 0) - (fromStop.distanceFromOriginKm || 0));

        const classes = ['3A', '2A', 'SL', 'CC', '1A'];
        const classPricing = {};
        const availableSeatsByClass = {};
        let totalAvail = 0;

        for (const cls of classes) {
          const tot = train.totalSeats?.[cls] || 72;
          const bkd = train.bookedSeats?.[cls] || 28;
          const avail = Math.max(0, tot - bkd);
          availableSeatsByClass[cls] = avail;
          totalAvail += avail;

          const classMult = { '1A': 3.2, '2A': 2.1, '3A': 1.5, 'SL': 0.6, 'CC': 1.1 }[cls] || 1.0;
          const baseRate = train.baseFarePerKm || 0.8;
          const estFare = Math.round(distKm * baseRate * classMult);
          classPricing[cls] = Math.max(60, estFare);
        }

        options.push({
          trainNo: train.trainNo,
          trainName: train.trainName,
          trainType: train.trainType,
          fromStation: cleanFrom,
          toStation: cleanTo,
          departureTime: fromStop.departure,
          arrivalTime: toStop.arrival,
          distanceKm: distKm,
          availableSeats: totalAvail,
          availableSeatsByClass,
          classPricing,
          pantryAvailable: train.pantryAvailable !== false
        });
      }
    }

    res.json({
      fromStation: cleanFrom,
      toStation: cleanTo,
      count: options.length,
      options
    });
  } catch (err) {
    console.error('Replan Options Error:', err);
    res.status(500).json({ error: 'Failed to search replan options' });
  }
});

const updateTrainDelayInMemory = (trainNo, delayMinutes, status) => {
  const train = trainsCache.find(t => t.trainNo === trainNo);
  if (train) {
    train.currentDelayMinutes = delayMinutes;
    train.status = status || (delayMinutes > 0 ? `Delayed by ${delayMinutes} mins` : 'On Time');
  }
};

const getTrainsCache = () => trainsCache;

module.exports = { router, setSeedCache, updateTrainDelayInMemory, getTrainsCache };

