const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const Booking = require('../models/Booking');
const Train = require('../models/Train');
const { Coupon, inMemoryCoupons } = require('../models/Coupon');
const { AdminAdjustment, inMemoryAdjustments } = require('../models/AdminAdjustment');
const { getIsFallback } = require('../config/db');
const { sendTicketEmail } = require('../services/mailService');
const {
  calculateFare,
  generateFareLock,
  verifyAndConsumeFareLock,
  isMealTimeEligible,
  getMealPrice,
  recordBookingActivity
} = require('../services/fareService');
const seatInventoryService = require('../services/seatInventoryService');
const { authenticateToken, optionalAuth } = require('../middleware/authMiddleware');
const eventBroker = require('../services/eventBroker');

const JWT_SECRET = process.env.JWT_SECRET || 'railvoy_super_secret_jwt_key_2026';
const TRAINS_JSON_PATH = path.join(__dirname, '../../dataset/trains.json');

// In-Memory store for bookings fallback
const inMemoryBookings = [];

// Helper to load trains from JSON
const loadTrainsFromJSON = () => {
  try {
    if (fs.existsSync(TRAINS_JSON_PATH)) {
      return JSON.parse(fs.readFileSync(TRAINS_JSON_PATH, 'utf8'));
    }
  } catch (e) {}
  return [];
};

const getTrainByNumber = async (trainNo) => {
  const normalized = String(trainNo || '').trim();
  if (!normalized) return null;
  if (!getIsFallback()) {
    const databaseTrain = await Train.findOne({ trainNo: normalized });
    if (databaseTrain) return databaseTrain;
  }
  return loadTrainsFromJSON().find(train => String(train.trainNo) === normalized) || null;
};

const getRouteSegment = (train, fromStation, toStation) => {
  const stops = train?.stops || [];
  const fromIndex = stops.findIndex(stop => stop.stationCode === String(fromStation || '').toUpperCase());
  const toIndex = stops.findIndex(stop => stop.stationCode === String(toStation || '').toUpperCase());
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= toIndex) return null;
  return {
    fromIndex,
    toIndex,
    distanceKm: Math.max(1, (stops[toIndex].distanceFromOriginKm || 0) - (stops[fromIndex].distanceFromOriginKm || 0)),
    departureTime: stops[fromIndex].departure,
    arrivalTime: stops[toIndex].arrival
  };
};

// Helper: Check train pantry availability
const getTrainPantryStatus = async (trainNo) => {
  try {
    if (!getIsFallback()) {
      const train = await Train.findOne({ trainNo });
      if (train) return train.pantryAvailable !== false;
    }
  } catch (e) {}
  const allTrains = loadTrainsFromJSON();
  const found = allTrains.find(t => t.trainNo === String(trainNo));
  return found ? (found.pantryAvailable !== false) : true;
};

// Helper to generate 10-digit PNR and 4-digit Passcode
const generatePNR = () => 'PNR' + Math.floor(10000000 + Math.random() * 90000000).toString();
const generatePasscode = () => Math.floor(1000 + Math.random() * 9000).toString();

/**
 * Coach prefix according to Indian Railway conventions
 */
const getCoachPosition = (travelClass, coachNo = 1) => {
  const cls = (travelClass || '3A').toUpperCase().trim();
  switch (cls) {
    case '1A':  return `H${coachNo}`;
    case '2A':  return `A${coachNo}`;
    case '3A':
    case '3E':  return `B${coachNo}`;
    case 'SL':  return `S${coachNo}`;
    case 'CC':  return `C${coachNo}`;
    case 'EC':  return `E${coachNo}`;
    case 'GS':  return 'GS';
    case 'HA1': return 'HA1';
    case 'AB1': return 'AB1';
    default:    return `B${coachNo}`;
  }
};

const getBerthType = (seatNumber, travelClass) => {
  const cls = (travelClass || '3A').toUpperCase().trim();
  const num = parseInt(seatNumber, 10);
  if (isNaN(num) || num <= 0) return 'Berth';

  if (cls === 'GS') return 'General (No Reservation)';

  if (cls === '1A') {
    return num % 2 === 1 ? 'Lower' : 'Upper';
  }

  if (cls === '2A' || cls === 'HA1') {
    const mod = num % 6;
    if (mod === 1 || mod === 3) return 'Lower';
    if (mod === 2 || mod === 4) return 'Upper';
    if (mod === 5) return 'Side Lower';
    return 'Side Upper';
  }

  if (cls === '3A' || cls === '3E' || cls === 'SL' || cls === 'AB1') {
    const mod = num % 8;
    if (mod === 1 || mod === 4) return 'Lower';
    if (mod === 2 || mod === 5) return 'Middle';
    if (mod === 3 || mod === 6) return 'Upper';
    if (mod === 7) return 'Side Lower';
    return 'Side Upper';
  }

  if (cls === 'CC') {
    const mod = num % 5;
    if (mod === 1 || mod === 0) return 'Window';
    if (mod === 3) return 'Aisle';
    return 'Middle';
  }

  if (cls === 'EC') {
    const mod = num % 4;
    if (mod === 1 || mod === 0) return 'Window';
    return 'Aisle';
  }

  return 'Berth';
};

const allocateSeats = (passengers, travelClass, isWaitlist, coachNo = 1) => {
  const cls = (travelClass || '3A').toUpperCase().trim();
  const coach = getCoachPosition(travelClass, coachNo);
  const usedSeats = new Set();

  const maxSeat = {
    '1A': 24, '2A': 52, '3A': 72, '3E': 72,
    'SL': 72, 'CC': 78, 'EC': 52, 'GS': 0,
    'HA1': 40, 'AB1': 72
  }[cls] || 72;

  const startSeat = ['1A','CC','EC','GS'].includes(cls) ? 1 : 9;

  return passengers.map((p, idx) => {
    if (isWaitlist || cls === 'GS') {
      return {
        ...p,
        berthType: cls === 'GS' ? 'General (No Reservation)' : 'Waitlisted',
        seatNo: cls === 'GS' ? `GS-${idx + 1}` : `WL-${idx + 1}`
      };
    }

    const pref = (p.berthPreference || '').trim();
    let chosenSeat = null;

    if (pref && pref !== 'No Preference') {
      for (let s = startSeat; s <= maxSeat; s++) {
        if (!usedSeats.has(s) && getBerthType(s, travelClass).toLowerCase() === pref.toLowerCase()) {
          chosenSeat = s;
          break;
        }
      }
    }

    if (!chosenSeat) {
      for (let s = startSeat; s <= maxSeat; s++) {
        if (!usedSeats.has(s)) {
          chosenSeat = s;
          break;
        }
      }
    }

    if (!chosenSeat) chosenSeat = startSeat + idx;
    usedSeats.add(chosenSeat);

    const berthType = getBerthType(chosenSeat, travelClass);
    return {
      ...p,
      berthType,
      seatNo: `${coach}-${chosenSeat}`
    };
  });
};

// Dynamic coupon validator
const validateCoupon = async (couponCode, travelClass, mealCategory, fareAmount) => {
  if (!couponCode || travelClass === 'GS') {
    return { valid: false, discountAmount: 0, message: travelClass === 'GS' ? 'Coupons not applicable on General class tickets.' : 'No coupon code provided.' };
  }
  const cleanCode = couponCode.toUpperCase().trim();
  let coupon = null;
  try {
    if (!getIsFallback()) {
      coupon = await Coupon.findOne({ code: cleanCode, isActive: true, validUntil: { $gte: new Date() } });
    }
    if (!coupon) {
      coupon = inMemoryCoupons.find(c => c.code === cleanCode && c.isActive && new Date(c.validUntil) >= new Date());
    }
  } catch (e) {
    coupon = inMemoryCoupons.find(c => c.code === cleanCode && c.isActive);
  }

  if (!coupon) return { valid: false, discountAmount: 0, message: 'Invalid or expired coupon code.' };
  if (fareAmount < (coupon.minFare || 0)) return { valid: false, discountAmount: 0, message: `Minimum fare ₹${coupon.minFare} required for this coupon.` };
  if (coupon.couponType === 'food' && mealCategory === 'No Meal') return { valid: false, discountAmount: 0, message: 'This coupon is valid only with a meal selection.' };

  let discount = 0;
  if (coupon.discountType === 'flat') {
    discount = Math.min(coupon.discountValue, coupon.maxDiscount || coupon.discountValue);
  } else {
    discount = Math.min(Math.round(fareAmount * coupon.discountValue / 100), coupon.maxDiscount || 9999);
  }
  return { valid: true, discountAmount: discount, message: `Coupon ${cleanCode} applied! ₹${discount} discount.`, coupon };
};

// POST /api/bookings/quote - Fare calculation & atomic fare lock token generation
router.post('/quote', async (req, res) => {
  try {
    const {
      trainNo, trainType = 'Superfast', trainName = '', travelClass = '3A',
      distanceKm = 450, travelDate, mealCategory = 'No Meal',
      couponCode = '', passengerCount = 1, departureTime = '08:00', arrivalTime = '18:00', quota = 'GENERAL'
    } = req.body;

    const travelDateStr = travelDate || new Date().toISOString().split('T')[0];

    // Check pantry availability on train
    const pantryAvailable = await getTrainPantryStatus(trainNo);
    const trainRecord = await getTrainByNumber(trainNo);
    const mealHours = trainRecord?.mealServiceHours || trainRecord?.cateringServices;
    const mealTimeCheck = isMealTimeEligible(departureTime, arrivalTime, mealHours);

    // If no pantry car OR journey outside meal hours, meal cannot be charged
    const mealEligible = pantryAvailable && mealTimeCheck.eligible;
    const effectiveMeal = (travelClass === 'GS' || !mealEligible) ? 'No Meal' : mealCategory;

    const occupancyRate = seatInventoryService.getOccupancyRate(trainNo, travelClass, travelDateStr);
    const seatStats = seatInventoryService.getSeatStats(trainNo, travelClass, travelDateStr);
    const count = Math.max(1, parseInt(passengerCount) || 1);

    const fareRes = await calculateFare({
      trainNo,
      trainType,
      trainName,
      travelClass,
      distanceKm: Number(distanceKm) || 450,
      travelDate: travelDateStr,
      occupancyRate,
      departureTime,
      arrivalTime,
      mealCategory: effectiveMeal,
      pantryAvailable,
      quota
    });

    // Record booking interest for real-time velocity surge tracking
    recordBookingActivity(trainNo, count);
    const subtotal = fareRes.finalFare * count;

    const couponResult = await validateCoupon(couponCode, travelClass, effectiveMeal, subtotal);
    const discountAmount = couponResult.discountAmount || 0;
    const totalFinalFare = Math.max(20, subtotal - discountAmount);

    // Generate atomic 5-minute Fare Lock
    const fareLock = await generateFareLock({
      trainNo: String(trainNo || ''),
      travelClass,
      travelDate: travelDateStr,
      passengerCount: count,
      lockedFare: totalFinalFare,
      mealCategory: effectiveMeal
    });

    // Optimistic hold AFTER fare lock is generated
    await seatInventoryService.reserveSeat(trainNo, travelClass, travelDateStr, count, fareLock.lockToken);

    res.json({
      perPassenger: fareRes,
      passengerCount: count,
      mealCategory: effectiveMeal,
      mealPricePerPassenger: fareRes.mealPrice,
      mealEligible,
      pantryAvailable,
      mealNote: !pantryAvailable ? 'No pantry car on this train — meal service unavailable' : mealTimeCheck.reason,
      quota,
      couponCode,
      couponValid: couponResult.valid,
      discountAmount,
      couponMessage: couponResult.message || '',
      totalFinalFare,
      trainType,
      lockToken: fareLock.lockToken,
      lockedFare: fareLock.lockedFare,
      fareLockExpiresAt: fareLock.expiresAt,
      explanation: fareRes.explanation,
      occupancyRate: seatStats.occupancyRate,
      seatsAvailable: seatStats.available,
      seatsTotal: seatStats.total,
      waitlistCount: seatStats.waitlisted,
      seatInventorySnapshot: seatStats
    });
  } catch (err) {
    console.error('Quote Error:', err);
    res.status(500).json({ error: 'Quote calculation failed' });
  }
});

// POST /api/bookings/confirm-fare - Verify lockToken is still active before taking payment
router.post('/confirm-fare', async (req, res) => {
  try {
    const { lockToken } = req.body;
    if (!lockToken) return res.status(400).json({ valid: false, error: 'Fare lock token required' });

    const { FareLock, inMemoryFareLocks } = require('../models/FareLock');
    let lock = null;
    if (!getIsFallback()) {
      try {
        lock = await FareLock.findOne({ lockToken, used: false });
      } catch(e) {}
    }
    if (!lock) lock = inMemoryFareLocks.get(lockToken);

    if (!lock || lock.used || new Date() > new Date(lock.expiresAt)) {
      return res.status(410).json({ valid: false, error: 'Fare quote expired (5 min TTL). Please re-calculate fare.' });
    }

    res.json({ valid: true, lockedFare: lock.lockedFare, expiresAt: lock.expiresAt });
  } catch (e) {
    res.status(500).json({ valid: false, error: 'Fare confirmation failed' });
  }
});

// POST /api/bookings/create - Process Booking with strict Fare-Lock verification
router.post('/create', optionalAuth, async (req, res) => {
  try {
    const {
      trainNo, trainName, fromStation, toStation, travelDate, travelClass = '3A',
      passengers, foodSelection, couponCode, paymentGateway = 'RailVoy Direct Bank Pay', userEmail,
      contactEmail, departureTime = '08:00', arrivalTime = '18:00', distanceKm,
      lockToken, expectedFare, bankName, quota = 'GENERAL'
    } = req.body;

    const bookingOwnerEmail = (req.user?.email || userEmail || contactEmail || 'passenger@railvoy.com').toLowerCase().trim();
    const deliveryEmail = (contactEmail || userEmail || bookingOwnerEmail).toLowerCase().trim();

    if (!trainNo || !passengers || passengers.length === 0) {
      return res.status(400).json({ error: 'Missing required booking details (train number and passengers required)' });
    }

    const pantryAvailable = await getTrainPantryStatus(trainNo);
    const trainRecord = await getTrainByNumber(trainNo);
    const mealTimeCheck = isMealTimeEligible(departureTime, arrivalTime, trainRecord?.mealServiceHours);
    const mealEligible = pantryAvailable && mealTimeCheck.eligible;
    const requestedMeal = travelClass === 'GS' ? 'No Meal' : (foodSelection?.mealCategory || 'No Meal');
    const effectiveMealCategory = mealEligible ? requestedMeal : 'No Meal';
    const mealChargesApplied = effectiveMealCategory !== 'No Meal';

    // Fare Resolution Pipeline — Single Source of Truth:
    let finalFare = null;
    let baseFare = null;
    let dynamicFare = null;
    let discountAmount = 0;
    let fareQuote = null;

    if (lockToken) {
      const lockVerification = await verifyAndConsumeFareLock(lockToken, expectedFare || req.body.finalFare || req.body.grandTotal);
      if (lockVerification.valid && lockVerification.lock) {
        finalFare = Math.round(lockVerification.lock.lockedFare);
        baseFare = Math.round(finalFare * 0.75);
        dynamicFare = Math.max(0, finalFare - baseFare);
      }
    }

    // Fallback: If no lockToken or verification failed, compute strictly on backend
    if (!finalFare) {
      fareQuote = await calculateFare({
        trainNo,
        trainType: req.body.trainType || 'Superfast',
        trainName: req.body.trainName || trainName || '',
        travelClass,
        distanceKm: Number(distanceKm) || 450,
        travelDate,
        departureTime,
        arrivalTime,
        mealCategory: effectiveMealCategory,
        pantryAvailable,
        quota
      });

      const couponResult = await validateCoupon(couponCode, travelClass, effectiveMealCategory, fareQuote.finalFare * passengers.length);
      discountAmount = couponResult.discountAmount || 0;
      finalFare = Math.max(20, (fareQuote.finalFare * passengers.length) - discountAmount);
      baseFare = Math.round(fareQuote.baseFare * passengers.length);
      dynamicFare = Math.max(0, finalFare - baseFare);
    }

    const travelDateStr = travelDate || new Date().toISOString().split('T')[0];

    // Email ↔ Accounts association check (non-blocking in dev)
    try {
      const axios = require('axios');
      await axios.get(`http://localhost:4002/api/accounts/verify-id?email=${encodeURIComponent(bookingOwnerEmail)}`, { timeout: 2000 });
    } catch (accErr) {
      // Service may be down — log only, do not block booking in development
      console.warn('[Booking] Accounts verification skipped:', accErr.code || accErr.message);
    }

    // Phase 1: Initiate payment hold (200-400ms)
    await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
    // Phase 2: Reserve seats (atomic operation)
    const seatReservation = await seatInventoryService.reserveSeat(trainNo, travelClass, travelDateStr, passengers.length, lockToken);
    if (!seatReservation.success) {
      return res.status(409).json({ error: 'All seats just got filled by another passenger. Please search again for available trains.' });
    }
    // Phase 3: Bank debit simulation (100-300ms processing)
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));

    const pnr = generatePNR();
    const plainPasscode = generatePasscode();
    const passcodeHash = await bcrypt.hash(plainPasscode, 10);

    const transactionId = 'TXN_' + paymentGateway.replace(/\s+/g, '_').toUpperCase() + '_' + Date.now();
    
    const seatStats = seatInventoryService.getSeatStats(trainNo, travelClass, travelDateStr);
    const bookingStatus = seatReservation.allocationStatus || 'Confirmed';
    const isWaitlist = bookingStatus === 'Waitlisted';
    const waitlistPosition = seatReservation.waitlistPosition || 0;
    const probability = bookingStatus === 'Confirmed' ? 100 : bookingStatus === 'RAC' ? 72 : 42;
    const coachPosition = getCoachPosition(travelClass);
    const allocatedPassengers = bookingStatus === 'RAC'
      ? passengers.map((passenger, index) => ({ ...passenger, berthType: 'RAC', seatNo: `RAC-${index + 1}` }))
      : allocateSeats(passengers, travelClass, isWaitlist);

    const newBooking = {
      pnr,
      userEmail: bookingOwnerEmail,
      contactEmail: deliveryEmail,
      userId: req.user?._id || req.user?.id || null,
      passcodeHash,
      trainNo: String(trainNo),
      trainName: trainName || 'Express Train',
      fromStation: fromStation || 'Source Station',
      toStation: toStation || 'Destination Station',
      travelDate: travelDateStr,
      travelClass: travelClass || '3A',
      quota: String(quota).toUpperCase(),
      coachPosition,
      passengers: allocatedPassengers,
      foodSelection: {
        mealCategory: effectiveMealCategory,
        mealType: foodSelection?.mealType || 'Standard',
        mealPrice: mealChargesApplied ? (fareQuote ? fareQuote.mealPrice : 150) : 0
      },
      mealEligible,
      mealChargesApplied,
      fareLockToken: lockToken || '',
      lockedFare: finalFare,
      baseFare,
      dynamicFare,
      finalFare,
      couponCode: couponCode || '',
      discountAmount,
      paymentDetails: {
        gateway: paymentGateway,
        bankName: bankName || 'State Bank of India',
        transactionId,
        status: 'SUCCESS',
        paidAt: new Date()
      },
      status: bookingStatus,
      waitlistPosition,
      confirmationProbability: probability,
      explanationReason: fareQuote?.explanation || 'Standard fare pricing applied with verified fare-lock.',
      createdAt: new Date()
    };

    // Simulate realistic DB write latency
    await new Promise(r => setTimeout(r, 180 + Math.random() * 120));

    let savedBooking = newBooking;
    let bookingId = null;
    try {
      if (!getIsFallback()) {
        const doc = new Booking({ ...newBooking, status: 'PENDING' });
        const pendingDoc = await doc.save();
        bookingId = pendingDoc._id;
        // Phase commit: update to real status
        pendingDoc.status = bookingStatus;
        pendingDoc.passcodeHash = passcodeHash;
        await pendingDoc.save();
        savedBooking = pendingDoc;
      } else {
        const tempId = 'bk_' + Date.now();
        inMemoryBookings.push({ ...newBooking, _id: tempId });
        savedBooking = inMemoryBookings[inMemoryBookings.length - 1];
      }
    } catch (dbErr) {
      console.warn('[Booking] DB save failed, releasing seats:', dbErr.message);
      // ACID rollback: release reserved seats
      try { await seatInventoryService.releaseBookedSeat(trainNo, travelClass, travelDateStr, passengers.length); } catch(e) {}
      return res.status(500).json({ error: 'We could not save your booking. Your payment has not been deducted. Please try again.' });
    }

    // Phase 4: Atomic seat confirmation commit
    try {
      if (bookingStatus === 'Confirmed') {
        await seatInventoryService.confirmReservation(lockToken || seatReservation.reservationId);
      }
    } catch(commitErr) {
      console.warn('[Booking] Seat commit warning:', commitErr.message);
      // Non-fatal: booking already saved, seat is reserved
    }
    recordBookingActivity(trainNo, passengers.length);

    // Ticket console receipt — ONLY show final fare, no breakdown
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║         RailVoy — BOOKING CONFIRMATION        ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  PNR         : ${pnr.padEnd(31)}║`);
    console.log(`║  Passcode    : ${plainPasscode.padEnd(31)}║`);
    console.log(`║  Email       : ${userEmail.substring(0, 31).padEnd(31)}║`);
    console.log(`║  Route       : ${(fromStation + ' → ' + toStation).substring(0, 31).padEnd(31)}║`);
    console.log(`║  Status      : ${bookingStatus.padEnd(31)}║`);
    console.log(`║  Coach       : ${coachPosition.padEnd(31)}║`);
    console.log(`║  Fare Paid   : ₹${String(finalFare).padEnd(30)}║`);
    console.log(`║  Bank        : ${(bankName || 'State Bank of India').substring(0, 31).padEnd(31)}║`);
    console.log('╚══════════════════════════════════════════════╝\n');

    // Enterprise Event-Driven Architecture: Publish to RabbitMQ / Event Broker
    try {
      await eventBroker.publishEvent('booking.confirmed', {
        userEmail,
        booking: newBooking,
        plainPasscode
      });
    } catch (e) {
      console.warn('[EventBroker] Asynchronous publish note:', e.message);
    }

    // Direct fallback email send if event broker is purely asynchronous
    try {
      await sendTicketEmail(userEmail, newBooking, plainPasscode);
    } catch (e) {
      console.warn('[Mail] Direct email send skipped:', e.message);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('seat_update', { trainNo, pnr, status: bookingStatus });
    }

    res.json({
      message: 'Booking successful! Ticket access passkey generated and sent to email.',
      pnr,
      securityPasscode: plainPasscode,
      passcode: plainPasscode,
      booking: {
        pnr,
        trainNo,
        trainName: newBooking.trainName,
        fromStation,
        toStation,
        travelDate,
        travelClass,
        coachPosition,
        passengers: newBooking.passengers,
        foodSelection: newBooking.foodSelection,
        status: bookingStatus,
        waitlistPosition,
        confirmationProbability: probability,
        finalFare,
        bankName: newBooking.paymentDetails.bankName,
        transactionId,
        userEmail,
        createdAt: new Date()
      }
    });
  } catch (err) {
    console.error('[Booking] Creation Error:', err.message);
    res.status(500).json({ error: 'We could not complete your booking. Please try again or contact support.' });
  }
});

const findBookingByPnr = async (pnr) => {
  if (!getIsFallback()) {
    const booking = await Booking.findOne({ pnr });
    if (booking) return booking;
  }
  return inMemoryBookings.find(booking => booking.pnr === pnr);
};

const saveBooking = async (booking) => {
  if (!getIsFallback() && booking.save) return booking.save();
  return booking;
};

const promoteNextPassenger = async (trainNo, travelClass, travelDate) => {
  const query = { trainNo: String(trainNo), travelClass, travelDate, status: 'Waitlisted' };
  const waitlisted = !getIsFallback()
    ? await Booking.find(query).sort({ createdAt: 1 }).limit(1)
    : inMemoryBookings.filter(booking => booking.trainNo === String(trainNo) && booking.travelClass === travelClass && booking.travelDate === travelDate && booking.status === 'Waitlisted').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(0, 1);
  const next = waitlisted[0];
  if (!next) return null;

  const promotionReservation = await seatInventoryService.reserveSeat(
    trainNo,
    travelClass,
    travelDate,
    next.passengers.length,
    `promotion_${next.pnr}`
  );
  if (!promotionReservation.success || promotionReservation.allocationStatus === 'Waitlisted') return null;
  await seatInventoryService.confirmReservation(promotionReservation.reservationId);

  next.status = 'Confirmed';
  next.waitlistPosition = 0;
  next.confirmationProbability = 100;
  next.passengers = allocateSeats(next.passengers, travelClass, false);
  next.explanationReason = 'A seat was released and the earliest eligible waitlisted passenger was promoted automatically.';
  await saveBooking(next);
  return next;
};

// POST /api/bookings/cancel - Cancel a booking and promote the next eligible passenger.
router.post('/cancel', authenticateToken, async (req, res) => {
  try {
    const { pnr, passcode, email } = req.body;
    if (!pnr || !passcode || !email) return res.status(400).json({ error: 'PNR, email, and passcode are required' });
    if (req.user.email.toLowerCase() !== String(email).trim().toLowerCase()) return res.status(403).json({ error: 'You may only cancel your own booking.' });
    const booking = await findBookingByPnr(String(pnr).trim());
    if (!booking || booking.userEmail.toLowerCase() !== String(email).trim().toLowerCase()) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (booking.status === 'Cancelled') return res.status(409).json({ error: 'Booking is already cancelled' });
    const previousStatus = booking.status;
    const validPasscode = await bcrypt.compare(String(passcode), booking.passcodeHash || '');
    if (!validPasscode) return res.status(403).json({ error: 'Invalid booking passcode' });

    booking.status = 'Cancelled';
    booking.cancelledAt = new Date();
    await saveBooking(booking);

    if (previousStatus === 'Confirmed') {
      await seatInventoryService.releaseBookedSeat(booking.trainNo, booking.travelClass, booking.travelDate, booking.passengers.length);
    } else if (previousStatus === 'RAC') {
      await seatInventoryService.releaseRacSeat(booking.trainNo, booking.travelClass, booking.travelDate, booking.passengers.length);
    }

    const promoted = await promoteNextPassenger(booking.trainNo, booking.travelClass, booking.travelDate);
    const io = req.app.get('io');
    if (io) io.emit('booking_update', { pnr: booking.pnr, status: 'Cancelled', promotedPnr: promoted?.pnr || null });
    res.json({ message: 'Booking cancelled successfully', booking, promotedBooking: promoted || null });
  } catch (err) {
    console.error('[Booking] Cancellation Error:', err.message);
    res.status(500).json({ error: 'Cancellation could not be processed. Please try again.' });
  }
});

// GET /api/bookings/my-bookings - Fetch user's bookings
router.get('/my-bookings', optionalAuth, async (req, res) => {
  try {
    const targetEmail = (req.user?.email || req.query.email || '').toLowerCase().trim();
    if (!targetEmail) return res.status(400).json({ error: 'Email parameter required' });

    let bookings = [];
    if (!getIsFallback()) {
      bookings = await Booking.find({
        $or: [{ userEmail: targetEmail }, { contactEmail: targetEmail }]
      }).sort({ createdAt: -1 });
    } else {
      bookings = inMemoryBookings.filter(b => 
        (b.userEmail || '').toLowerCase() === targetEmail || 
        (b.contactEmail || '').toLowerCase() === targetEmail
      );
    }

    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: 'Fetch bookings failed' });
  }
});

// POST /api/bookings/transfer - Transfer delay-threatened ticket & record fare adjustment
router.post('/transfer', authenticateToken, async (req, res) => {
  try {
    const { pnr, newTrainNo, transferPaymentId } = req.body;
    let booking = null;

    if (!getIsFallback()) {
      booking = await Booking.findOne({ pnr });
    } else {
      booking = inMemoryBookings.find(b => b.pnr === pnr);
    }

    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.userEmail.toLowerCase() !== req.user.email.toLowerCase()) return res.status(403).json({ error: 'You may only transfer your own booking.' });

    const oldTrainNo = booking.trainNo;
    const oldTrainName = booking.trainName;
    const oldFare = booking.finalFare || 500;
    const oldTrain = await getTrainByNumber(oldTrainNo);
    const newTrain = await getTrainByNumber(newTrainNo);
    const bookedSegment = getRouteSegment(oldTrain, booking.fromStation, booking.toStation);
    const alternateSegment = getRouteSegment(newTrain, booking.fromStation, booking.toStation);

    if (!oldTrain || !newTrain || !bookedSegment || !alternateSegment) {
      return res.status(409).json({ error: 'Transfer is available only between trains serving the same booked route.' });
    }
    if (Number(oldTrain.currentDelayMinutes || 0) <= 0 && oldTrain.status !== 'Delayed') {
      return res.status(409).json({ error: 'This ticket is not currently marked as delayed, so transfer is unavailable.' });
    }

    // Compute the alternate train fare from its dataset record and the booked route segment.
    const newFareCalc = await calculateFare({
      trainNo: newTrainNo,
      trainName: newTrain.trainName,
      trainType: newTrain.trainType,
      travelClass: booking.travelClass || '3A',
      distanceKm: alternateSegment.distanceKm,
      travelDate: booking.travelDate,
      departureTime: alternateSegment.departureTime,
      arrivalTime: alternateSegment.arrivalTime,
      trainMealHours: newTrain.mealServiceHours,
      pantryAvailable: newTrain.pantryAvailable !== false,
      mealCategory: booking.foodSelection?.mealCategory || 'No Meal',
      passengerCount: booking.passengers?.length || 1,
      quota: booking.quota || 'GENERAL'
    });

    const newFare = newFareCalc.finalFare || oldFare;
    const fareDiff = newFare - oldFare; // > 0: passenger transferred to higher fare train
    const direction = fareDiff > 0 ? 'charge' : (fareDiff < 0 ? 'refund' : 'even');

    if (direction === 'charge' && !transferPaymentId) {
      return res.status(402).json({ error: `Transfer requires payment of ₹${fareDiff} before confirmation.`, requiredAmount: fareDiff, direction });
    }

    const transferReservation = await seatInventoryService.reserveSeat(
      newTrainNo,
      booking.travelClass || '3A',
      booking.travelDate,
      booking.passengers?.length || 1,
      `transfer_${pnr}_${newTrainNo}`
    );
    if (!transferReservation.success || transferReservation.allocationStatus !== 'Confirmed') {
      return res.status(409).json({ error: 'The alternate train has no confirmed seats available.' });
    }

    // Create AdminAdjustment record
    const adjRecord = {
      bookingPnr: pnr,
      userEmail: booking.userEmail,
      oldTrainNo,
      oldTrainName,
      newTrainNo,
      newTrainName: newTrain.trainName,
      oldFare,
      newFare,
      fareDiff: Math.abs(fareDiff),
      direction,
      status: 'pending',
      note: fareDiff !== 0
        ? `Delay transfer: ${fareDiff > 0 ? 'Passenger payment required: ₹' + fareDiff : 'Passenger refund due: ₹' + Math.abs(fareDiff)}`
        : 'Even fare transfer',
      createdAt: new Date()
    };

    if (!getIsFallback()) {
      try {
        const adj = new AdminAdjustment(adjRecord);
        await adj.save();
      } catch (e) {
        inMemoryAdjustments.push({ ...adjRecord, _id: 'adj_' + Date.now() });
      }
    } else {
      inMemoryAdjustments.push({ ...adjRecord, _id: 'adj_' + Date.now() });
    }

    // Update booking
    booking.transferredFromPnr = booking.pnr;
    booking.trainNo = newTrainNo;
    booking.trainName = newTrain.trainName;
    booking.transferFareDiff = fareDiff;
    if (fareDiff < 0) booking.adminRefundPending = Math.abs(fareDiff);
    booking.status = 'Confirmed';
    booking.explanationReason = `Transferred from delayed train #${oldTrainNo} to same-route train #${newTrainNo}. Confirmed seat re-allocated. Fare difference: ₹${fareDiff}.`;

    if (!getIsFallback() && booking.save) {
      await booking.save();
    }

    await seatInventoryService.confirmReservation(transferReservation.reservationId);
    if (oldTrainNo !== String(newTrainNo)) {
      await seatInventoryService.releaseBookedSeat(oldTrainNo, booking.travelClass, booking.travelDate, booking.passengers?.length || 1);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('ticket_transferred', { pnr, newTrainNo, newTrainName: newTrain.trainName, recycledOldTrain: oldTrainNo });
      io.emit('seat_update', { trainNo: newTrainNo, pnr, status: 'Confirmed' });
    }

    res.json({
      message: 'Ticket successfully transferred to a same-route train. Fare adjustment logged.',
      updatedBooking: booking,
      fareAdjustment: adjRecord
    });
  } catch (err) {
    console.error('Transfer error:', err);
    res.status(500).json({ error: 'Ticket transfer could not be completed. Please try again.' });
  }
});

// POST /api/bookings/replan-journey - Replan journey on same or different route with partial cancellation & penalty rules
router.post('/replan-journey', authenticateToken, async (req, res) => {
  try {
    const { pnr, intermediateStation, newDestination, newTrainNo, newTravelClass = '3A', transferPaymentId } = req.body;
    if (!pnr || !newTrainNo) {
      return res.status(400).json({ error: 'PNR and new train number are required for journey replanning.' });
    }

    let booking = await findBookingByPnr(String(pnr).trim());
    if (!booking) return res.status(404).json({ error: 'Booking record not found' });
    if (booking.userEmail.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(403).json({ error: 'You are only authorized to replan your own bookings.' });
    }

    const oldTrainNo = booking.trainNo;
    const oldTrain = await getTrainByNumber(oldTrainNo);
    const newTrain = await getTrainByNumber(newTrainNo);

    if (!newTrain) {
      return res.status(404).json({ error: 'Selected alternative train was not found.' });
    }

    const origin = intermediateStation || booking.fromStation;
    const targetDest = newDestination || booking.toStation;
    const isDifferentRoute = targetDest.toUpperCase() !== booking.toStation.toUpperCase();

    // Find route segment on new train
    const newSegment = getRouteSegment(newTrain, origin, targetDest);
    if (!newSegment) {
      return res.status(400).json({ error: `Selected train #${newTrainNo} does not connect ${origin} to ${targetDest}.` });
    }

    // Dynamic pricing for the new train and specific coach class
    const passengerCount = booking.passengers?.length || 1;
    const newFareCalc = await calculateFare({
      trainNo: newTrainNo,
      trainName: newTrain.trainName,
      trainType: newTrain.trainType || 'Superfast',
      travelClass: newTravelClass,
      distanceKm: newSegment.distanceKm,
      travelDate: booking.travelDate,
      departureTime: newSegment.departureTime,
      arrivalTime: newSegment.arrivalTime,
      trainMealHours: newTrain.mealServiceHours,
      pantryAvailable: newTrain.pantryAvailable !== false,
      mealCategory: booking.foodSelection?.mealCategory || 'No Meal',
      passengerCount,
      quota: booking.quota || 'GENERAL'
    });

    const newTicketFare = newFareCalc.finalFare || Math.round(newSegment.distanceKm * 0.8 * passengerCount);
    const oldFare = booking.finalFare || 500;

    let routePenalty = 0;
    let netPayable = 0;
    let refundAmount = 0;

    if (isDifferentRoute) {
      // 1. Different Route: Charge statutory route alteration fee (₹60 per passenger)
      routePenalty = 60 * passengerCount;

      // 2. Cancellation value: value of the cancelled portion
      const grossNewCost = newTicketFare + routePenalty;
      
      // 3. User requirement: "In this case, no money should be returned even if the new partial ticket price is less than of what the ticket was cancelled."
      if (grossNewCost > oldFare) {
        netPayable = grossNewCost - oldFare;
      } else {
        netPayable = 0;
      }
      refundAmount = 0; // Strict: No money returned if new price is less!
    } else {
      // Same Route: No penalty charged
      routePenalty = 0;
      if (newTicketFare > oldFare) {
        netPayable = newTicketFare - oldFare;
        refundAmount = 0;
      } else {
        netPayable = 0;
        refundAmount = oldFare - newTicketFare;
      }
    }

    if (netPayable > 0 && !transferPaymentId) {
      return res.status(402).json({
        error: `Journey replanning requires payment of ₹${netPayable} (including ₹${routePenalty} route alteration fee).`,
        requiredAmount: netPayable,
        routePenalty,
        newTicketFare,
        isDifferentRoute,
        direction: 'charge'
      });
    }

    // Reserve seat on new train for new travel class
    const reservation = await seatInventoryService.reserveSeat(
      newTrainNo,
      newTravelClass,
      booking.travelDate,
      passengerCount,
      `replan_${pnr}_${newTrainNo}`
    );

    if (!reservation.success || reservation.allocationStatus !== 'Confirmed') {
      return res.status(409).json({ error: 'The selected train has no confirmed seats available in this coach class.' });
    }

    // Allocate seats in new coach
    const updatedPassengers = allocateSeats(booking.passengers, newTravelClass, false);

    // Release old seats
    if (oldTrainNo !== String(newTrainNo)) {
      await seatInventoryService.releaseBookedSeat(oldTrainNo, booking.travelClass, booking.travelDate, passengerCount);
    }

    // Record adjustment
    const adjRecord = {
      bookingPnr: pnr,
      userEmail: booking.userEmail,
      oldTrainNo,
      oldTrainName: booking.trainName,
      newTrainNo,
      newTrainName: newTrain.trainName,
      oldFare,
      newFare: newTicketFare,
      routePenalty,
      replanType: isDifferentRoute ? 'DIFFERENT_ROUTE_DIVERSION' : 'SAME_ROUTE_TRANSFER',
      netPayable,
      refundAmount,
      status: 'confirmed',
      note: isDifferentRoute
        ? `Route altered at ${origin} towards ${targetDest}. Fee ₹${routePenalty} applied. Zero refund issued per policy.`
        : `Same-route transfer from train #${oldTrainNo} to #${newTrainNo} without penalty.`,
      createdAt: new Date()
    };

    if (!getIsFallback()) {
      try {
        const adj = new AdminAdjustment(adjRecord);
        await adj.save();
      } catch (e) {
        inMemoryAdjustments.push({ ...adjRecord, _id: 'adj_' + Date.now() });
      }
    } else {
      inMemoryAdjustments.push({ ...adjRecord, _id: 'adj_' + Date.now() });
    }

    // Update booking state
    booking.transferredFromPnr = booking.pnr;
    booking.trainNo = newTrainNo;
    booking.trainName = newTrain.trainName;
    booking.travelClass = newTravelClass;
    booking.fromStation = origin;
    booking.toStation = targetDest;
    booking.coachPosition = getCoachPosition(newTravelClass);
    booking.passengers = updatedPassengers;
    booking.routePenalty = routePenalty;
    booking.finalFare = Math.max(oldFare, newTicketFare + routePenalty);
    booking.status = 'Confirmed';
    booking.explanationReason = isDifferentRoute
      ? `Journey replanned at ${origin} towards ${targetDest} on Train #${newTrainNo} (${newTravelClass}). Statutory fee: ₹${routePenalty}.`
      : `Transferred to same-route Train #${newTrainNo} (${newTravelClass}) with zero penalty.`;

    await saveBooking(booking);
    await seatInventoryService.confirmReservation(reservation.reservationId);

    const io = req.app.get('io');
    if (io) {
      io.emit('ticket_transferred', { pnr, newTrainNo, newTrainName: newTrain.trainName, recycledOldTrain: oldTrainNo });
      io.emit('seat_update', { trainNo: newTrainNo, pnr, status: 'Confirmed' });
    }

    res.json({
      success: true,
      message: isDifferentRoute
        ? `Journey successfully replanned to ${targetDest}! Seat confirmed on Train #${newTrainNo}.`
        : `Ticket transferred to Train #${newTrainNo} on the same route!`,
      booking,
      adjustment: adjRecord
    });
  } catch (err) {
    console.error('[Booking] Replan Error:', err);
    res.status(500).json({ error: 'Journey replanning could not be completed. Please try again.' });
  }
});

// GET /api/bookings/seat-stats/:trainNo/:travelClass/:travelDate - Fetch real-time seat inventory
router.get('/seat-stats/:trainNo/:travelClass/:travelDate', (req, res) => {
  try {
    const { trainNo, travelClass, travelDate } = req.params;
    const stats = seatInventoryService.getSeatStats(trainNo, travelClass, travelDate);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Seat information could not be loaded right now.' });
  }
});

module.exports = { router, inMemoryBookings, getCoachPosition, getBerthType };
