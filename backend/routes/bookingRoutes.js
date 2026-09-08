const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Booking = require('../models/Booking');
const { Coupon, inMemoryCoupons } = require('../models/Coupon');
const { getIsFallback } = require('../config/db');
const { sendTicketEmail } = require('../services/mailService');
const { calculateDynamicFare, predictWaitlist, isMealTimeEligible, getMealPrice } = require('../services/aiProxyService');

const JWT_SECRET = process.env.JWT_SECRET || 'railvoy_super_secret_jwt_key_2026';

// In-Memory store for bookings
const inMemoryBookings = [];

// Helper to generate 10-digit PNR and 4-digit Passcode
const generatePNR = () => 'PNR' + Math.floor(10000000 + Math.random() * 90000000).toString();
const generatePasscode = () => Math.floor(1000 + Math.random() * 9000).toString();

/**
 * Coach prefix according to Indian Railway conventions:
 * 1A  -> H<num> (e.g. H1)
 * 2A  -> A<num> (e.g. A1, A2)
 * 3A  -> B<num> (e.g. B1, B2, B3)
 * SL  -> S<num> (e.g. S1, S2)
 * CC  -> C<num> (e.g. C1)
 * EC  -> E<num> (e.g. E1)
 * GS  -> GS (General)
 * HA1 -> HA1 (Hybrid 1A-2A)
 * AB1 -> AB1 (Hybrid 2A-3A)
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

/**
 * Calculates official Indian Railways berth/seat type from seat number & class.
 *
 * 3A & SL — 3-3-2 layout, 8 berths per cabin (72 seats in 9 cabins):
 *   Within each bay of 8: positions 1,4 = Lower; 2,5 = Middle; 3,6 = Upper; 7 = Side Lower; 8/0 = Side Upper
 *
 * 2A — 2-2-2 layout, 6 berths per cabin (52 seats in 9 cabins; last cabin has 4 berths + 2 side):
 *   Within each bay of 6: positions 1,3 = Lower; 2,4 = Upper; 5 = Side Lower; 6/0 = Side Upper
 *
 * 1A — Coupes (2 berths) + Cabins (4 berths), sections A-H (22 or 24 seats):
 *   Odd seat numbers = Lower; Even seat numbers = Upper
 *
 * CC — Chair Car 3x2 layout (78 seats):
 *   In groups of 5: 1,5 = Window; 3 = Aisle; 2,4 = Middle
 *
 * EC — Executive Chair Car 2x2 (52 seats):
 *   In groups of 4: 1,4 = Window; 2,3 = Aisle
 *
 * GS — General (no seat reservation)
 */
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
    return 'Side Upper'; // mod === 0
  }

  if (cls === '3A' || cls === '3E' || cls === 'SL' || cls === 'AB1') {
    const mod = num % 8;
    if (mod === 1 || mod === 4) return 'Lower';
    if (mod === 2 || mod === 5) return 'Middle';
    if (mod === 3 || mod === 6) return 'Upper';
    if (mod === 7) return 'Side Lower';
    return 'Side Upper'; // mod === 0
  }

  if (cls === 'CC') {
    const mod = num % 5;
    if (mod === 1 || mod === 0) return 'Window';
    if (mod === 3) return 'Aisle';
    return 'Middle'; // mod 2 or 4
  }

  if (cls === 'EC') {
    const mod = num % 4;
    if (mod === 1 || mod === 0) return 'Window';
    return 'Aisle'; // mod 2 or 3
  }

  return 'Berth';
};

/**
 * Intelligent seat allocation matching passenger preference and Indian Railway rules.
 * Correctly handles 3A/SL (72 seats, 8-per-cabin), 2A (52 seats, 6-per-cabin),
 * 1A (22/24 seats), CC (78 seats), EC (52 seats), GS (no reservation).
 */
const allocateSeats = (passengers, travelClass, isWaitlist, coachNo = 1) => {
  const cls = (travelClass || '3A').toUpperCase().trim();
  const coach = getCoachPosition(travelClass, coachNo);
  const usedSeats = new Set();

  // Max seat numbers per class
  const maxSeat = {
    '1A': 24, '2A': 52, '3A': 72, '3E': 72,
    'SL': 72, 'CC': 78, 'EC': 52, 'GS': 0,
    'HA1': 40, 'AB1': 72
  }[cls] || 72;

  // Starting seat for allocation (skip first cabin in berth coaches)
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

    // Search for a berth matching preference
    if (pref && pref !== 'No Preference') {
      for (let s = startSeat; s <= maxSeat; s++) {
        if (!usedSeats.has(s) && getBerthType(s, travelClass).toLowerCase() === pref.toLowerCase()) {
          chosenSeat = s;
          break;
        }
      }
    }

    // Fallback: pick next available seat
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

// Dynamic coupon validator — looks up DB then in-memory coupons
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

// POST /api/bookings/quote - Fare calculation & dynamic coupon validation
router.post('/quote', async (req, res) => {
  try {
    const {
      trainNo, trainType = 'Superfast', travelClass = '3A',
      distanceKm = 450, travelDate, mealCategory = 'No Meal',
      couponCode = '', passengerCount = 1, departureTime = '08:00', arrivalTime = '18:00'
    } = req.body;

    // GS class: No food, no coupons
    const effectiveMeal = travelClass === 'GS' ? 'No Meal' : mealCategory;

    const fareRes = await calculateDynamicFare({
      trainNo, trainType, travelClass, distanceKm,
      bookingCount: 30, occupancyRate: 0.75, travelDate: travelDate || '2026-08-25',
      mealCategory: effectiveMeal
    });

    const mealEligibility = isMealTimeEligible(departureTime, arrivalTime);

    const couponResult = await validateCoupon(couponCode, travelClass, effectiveMeal, fareRes.finalFare * passengerCount);
    const discountAmount = couponResult.discountAmount || 0;
    const couponMessage = couponResult.message || '';

    const totalFinalFare = Math.max(20, (fareRes.finalFare * passengerCount) - discountAmount);

    res.json({
      perPassenger: fareRes,
      passengerCount,
      mealCategory: effectiveMeal,
      mealPricePerPassenger: fareRes.mealPrice,
      mealEligibility,
      couponCode,
      couponValid: couponResult.valid,
      discountAmount,
      couponMessage,
      totalFinalFare,
      trainType,
      explanation: fareRes.explanation
    });
  } catch (err) {
    console.error('Quote Error:', err);
    res.status(500).json({ error: 'Quote failed' });
  }
});

// POST /api/bookings/create - Process Booking & Payment Gateway
router.post('/create', async (req, res) => {
  try {
    const {
      trainNo, trainName, fromStation, toStation, travelDate, travelClass = '3A',
      passengers, foodSelection, couponCode, paymentGateway = 'RailVoy Direct Bank Pay', userEmail,
      departureTime = '08:00', arrivalTime = '18:00',
      grandTotal, finalFare: clientFinalFare, totalPaid, distanceKm,
      baseFare: clientBaseFare, dynamicFare: clientDynamicFare
    } = req.body;

    if (!trainNo || !passengers || passengers.length === 0 || !userEmail) {
      return res.status(400).json({ error: 'Missing required booking details' });
    }

    const pnr = generatePNR();
    const plainPasscode = generatePasscode();
    
    // Hash passcode with bcrypt to prevent digital ticket forgery
    const passcodeHash = await bcrypt.hash(plainPasscode, 10);

    // Dynamic fare calculation — use trainType from request body for accuracy
    const effectiveDistance = Number(distanceKm) || 450;
    const effectiveMealCategory = travelClass === 'GS' ? 'No Meal' : (foodSelection?.mealCategory || 'No Meal');
    const fareQuote = await calculateDynamicFare({
      trainNo,
      trainType: req.body.trainType || 'Superfast',
      travelClass, distanceKm: effectiveDistance,
      bookingCount: 30, occupancyRate: 0.7, travelDate,
      mealCategory: effectiveMealCategory
    });

    // Dynamic coupon validation
    const mealEligibility = isMealTimeEligible(departureTime, arrivalTime);
    const couponResult = await validateCoupon(couponCode, travelClass, effectiveMealCategory, fareQuote.finalFare * (passengers.length || 1));
    let discountAmount = couponResult.discountAmount || 0;

    // Exact debited amount assurance:
    // Assure that only the total amount paid per ticket is shown and stored.
    const passedAmount = grandTotal != null ? Number(grandTotal) : (clientFinalFare != null ? Number(clientFinalFare) : (totalPaid != null ? Number(totalPaid) : null));
    const finalFare = (passedAmount != null && !isNaN(passedAmount) && passedAmount > 0)
      ? Math.round(passedAmount)
      : Math.max(20, (fareQuote.finalFare * passengers.length) - discountAmount);

    const baseFare = (clientBaseFare != null && !isNaN(Number(clientBaseFare)))
      ? Math.round(Number(clientBaseFare))
      : Math.round(finalFare * 0.75);

    const dynamicFare = (clientDynamicFare != null && !isNaN(Number(clientDynamicFare)))
      ? Math.round(Number(clientDynamicFare))
      : Math.max(0, finalFare - baseFare);

    const transactionId = 'TXN_' + paymentGateway.replace(/\s+/g, '_').toUpperCase() + '_' + Date.now();

    // Determine seat status and coach / berth allocation compliant with Indian Railway rules
    const isWaitlist = Math.random() < 0.12;
    const bookingStatus = isWaitlist ? 'Waitlisted' : 'Confirmed';
    const waitlistPosition = isWaitlist ? 3 : 0;
    const probability = isWaitlist ? 84 : 100;
    const coachPosition = getCoachPosition(travelClass);
    const allocatedPassengers = allocateSeats(passengers, travelClass, isWaitlist);

    const newBooking = {
      pnr,
      userEmail,
      passcodeHash,
      trainNo,
      trainName: trainName || 'Express Train',
      fromStation: fromStation || 'Source Station',
      toStation: toStation || 'Destination Station',
      travelDate: travelDate || new Date().toISOString().split('T')[0],
      travelClass: travelClass || '3A',
      coachPosition,
      passengers: allocatedPassengers,
      foodSelection: foodSelection || { mealCategory: 'No Meal', mealType: 'None', mealPrice: 0 },
      couponCode: couponCode || '',
      discountAmount,
      baseFare,
      dynamicFare,
      finalFare,
      paymentDetails: {
        gateway: paymentGateway,
        transactionId,
        status: 'SUCCESS',
        paidAt: new Date()
      },
      status: bookingStatus,
      waitlistPosition,
      confirmationProbability: probability,
      explanationReason: fareQuote.explanation,
      createdAt: new Date()
    };

    let savedBooking = newBooking;
    if (!getIsFallback()) {
      try {
        const doc = new Booking(newBooking);
        savedBooking = await doc.save();
      } catch (dbErr) {
        console.warn('[Booking DB Save Warning - Falling back to in-memory]:', dbErr.message);
        inMemoryBookings.push({ ...newBooking, _id: 'bk_' + Date.now() });
        savedBooking = inMemoryBookings[inMemoryBookings.length - 1];
      }
    } else {
      inMemoryBookings.push({ ...newBooking, _id: 'bk_' + Date.now() });
      savedBooking = inMemoryBookings[inMemoryBookings.length - 1];
    }

    // Console log receipt
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
    console.log(`║  Transaction : ${transactionId.substring(0, 31).padEnd(31)}║`);
    console.log('╚══════════════════════════════════════════════╝\n');

    // Send ticket email
    try {
      await sendTicketEmail(userEmail, newBooking, plainPasscode);
    } catch (e) {
      console.warn('[Mail] Email send skipped:', e.message);
    }

    // Socket.IO real-time emission
    const io = req.app.get('io');
    if (io) {
      io.emit('seat_update', { trainNo, pnr, status: bookingStatus });
    }

    res.json({
      message: 'Booking successful! Ticket access passkey generated and sent to email.',
      pnr,
      securityPasscode: plainPasscode,
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
        baseFare,
        dynamicFare,
        discountAmount,
        couponCode: couponCode || '',
        transactionId,
        paymentGateway,
        userEmail,
        explanationReason: fareQuote.explanation,
        createdAt: new Date()
      }
    });
  } catch (err) {
    console.error('[Booking] Creation Error:', err.message, err.errors || err);
    res.status(500).json({ error: err.message || 'Booking creation failed. Funds will be refunded if debited.' });
  }
});

// GET /api/bookings/my-bookings - Fetch user's bookings
router.get('/my-bookings', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email parameter required' });

    let bookings = [];
    if (!getIsFallback()) {
      bookings = await Booking.find({ userEmail: email }).sort({ createdAt: -1 });
    } else {
      bookings = inMemoryBookings.filter(b => b.userEmail === email);
    }

    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: 'Fetch bookings failed' });
  }
});

// POST /api/bookings/transfer - Transfer delay-threatened ticket to faster train & recycle seat
router.post('/transfer', async (req, res) => {
  try {
    const { pnr, newTrainNo, newTrainName } = req.body;
    let booking = null;

    if (!getIsFallback()) {
      booking = await Booking.findOne({ pnr });
      if (booking) {
        const oldTrainNo = booking.trainNo;
        booking.transferredFromPnr = booking.pnr;
        booking.trainNo = newTrainNo;
        booking.trainName = newTrainName;
        booking.status = 'Confirmed';
        booking.explanationReason = `Ticket validity transferred to faster train (${newTrainNo} - ${newTrainName}) due to delay. Confirmed seat guaranteed. Old berth on Train #${oldTrainNo} recycled to waitlist.`;
        await booking.save();
      }
    } else {
      booking = inMemoryBookings.find(b => b.pnr === pnr);
      if (booking) {
        const oldTrainNo = booking.trainNo;
        booking.transferredFromPnr = pnr;
        booking.trainNo = newTrainNo;
        booking.trainName = newTrainName;
        booking.status = 'Confirmed';
        booking.explanationReason = `Ticket validity transferred to faster train (${newTrainNo} - ${newTrainName}) due to delay. Confirmed seat guaranteed. Old berth on Train #${oldTrainNo} recycled to waitlist.`;
      }
    }

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Real-time notification of seat recycling to waitlist
    const io = req.app.get('io');
    if (io) {
      io.emit('ticket_transferred', { pnr, newTrainNo, newTrainName, recycledOldTrain: booking.trainNo });
      io.emit('seat_update', { trainNo: newTrainNo, pnr, status: 'Confirmed' });
    }

    res.json({
      message: 'Ticket successfully transferred! Seat on delayed train automatically recycled.',
      updatedBooking: booking
    });
  } catch (err) {
    res.status(500).json({ error: 'Transfer failed' });
  }
});

module.exports = { router, inMemoryBookings, getCoachPosition, getBerthType };
