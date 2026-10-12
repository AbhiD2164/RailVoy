/**
 * fareService.js — Advanced Dynamic Pricing Engine with Uber/Ola Style Real-Time Surge,
 * Google Calendar Festival/Vacation Intelligence, and Statutory Government Tariff Floor Protection.
 *
 * PRODUCTION GOOGLE CALENDAR API CONFIGURATION:
 * 1. Go to Google Cloud Console: https://console.cloud.google.com/marketplace/product/google/calendar-json.googleapis.com
 * 2. Enable "Google Calendar API".
 * 3. Go to Credentials -> Create Credentials -> API Key:
 *    URL: https://console.cloud.google.com/apis/credentials
 * 4. Add the API Key in `backend/.env`:
 *    GOOGLE_CALENDAR_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxx
 * 5. Public Indian Holidays Calendar ID: en.indian#holiday@group.v.calendar.google.com
 *
 * In test/dev mode without an active API key, the service falls back to the high-fidelity
 * dataset in `dataset/google_calendar_events.json`.
 */

const { v4: uuidv4 } = require('crypto').webcrypto
  ? require('crypto') : { v4: () => require('crypto').randomUUID() };
const path = require('path');
const fs   = require('fs');
const https = require('https');
const { FareLock, inMemoryFareLocks } = require('../models/FareLock');
const { getIsFallback } = require('../config/db');
const redisService = require('./redisService');

// ─── Load JSON datasets once on startup ────────────────────────────────────────
const DATASET = path.join(__dirname, '../../dataset');

let fareRules = [];
let calendarData = { festivals: [], vacationWindows: [], weekendSurge: {} };

try {
  fareRules = JSON.parse(fs.readFileSync(path.join(DATASET, 'fare_rules.json'), 'utf8'));
} catch (e) {
  fareRules = [
    { trainType: 'Superfast', baseFarePerKm: 0.75, facilityMultiplier: 1.15, reservationCharge: 30, classMultipliers: { '1A': 3.2, '2A': 2.1, '3A': 1.5, 'SL': 0.6, 'CC': 1.1, 'EC': 2.4, 'GS': 0.35, '3E': 1.3 } }
  ];
}

try {
  calendarData = JSON.parse(fs.readFileSync(path.join(DATASET, 'google_calendar_events.json'), 'utf8'));
} catch (e) {
  calendarData = {
    festivals: [
      { monthDay: "10-24", name: "Diwali Festival Peak Travel", surgeMultiplier: 0.40 },
      { monthDay: "11-07", name: "Chhath Puja Peak Movement", surgeMultiplier: 0.45 },
      { monthDay: "03-25", name: "Holi Festival of Colors", surgeMultiplier: 0.35 }
    ],
    vacationWindows: [
      { name: "Summer Vacation", startMonth: 5, startDay: 1, endMonth: 6, endDay: 30, surgeMultiplier: 0.20 },
      { name: "Winter Vacation", startMonth: 12, startDay: 20, endMonth: 1, endDay: 5, surgeMultiplier: 0.15 }
    ],
    weekendSurge: {
      friday: { dayOfWeek: 5, surgeMultiplier: 0.12 },
      saturday: { dayOfWeek: 6, surgeMultiplier: 0.15 },
      sunday: { dayOfWeek: 0, surgeMultiplier: 0.10 }
    }
  };
}

const fareRulesMap = {};
fareRules.forEach(r => { fareRulesMap[r.trainType] = r; });

// ─── Real-Time Booking Velocity Tracker (Uber/Ola Style Demand Surge) ───────────
// Rolling 15-minute window of user booking activity per train
const recentBookingActivity = new Map(); // trainNo -> Array of timestamps

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const VELOCITY_WINDOW_MS  = 15 * 60 * 1000; // 15 mins

setInterval(() => {
  const now = Date.now();
  for (const [trainNo, timestamps] of recentBookingActivity.entries()) {
    const valid = timestamps.filter(ts => now - ts < VELOCITY_WINDOW_MS);
    if (valid.length === 0) {
      recentBookingActivity.delete(trainNo);
    } else {
      recentBookingActivity.set(trainNo, valid);
    }
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Records a booking or quote request to track route demand velocity
 */
const recordBookingActivity = (trainNo, passengerCount = 1) => {
  if (!trainNo) return;
  const key = String(trainNo).trim();
  const now = Date.now();
  const list = recentBookingActivity.get(key) || [];
  for (let i = 0; i < Math.max(1, passengerCount); i++) {
    list.push(now);
  }
  recentBookingActivity.set(key, list);
};

/**
 * Calculates current real-time booking velocity surge multiplier
 */
const getBookingVelocitySurge = (trainNo) => {
  if (!trainNo) return { surge: 0, velocity: 0, label: null };
  const key = String(trainNo).trim();
  const now = Date.now();
  const timestamps = (recentBookingActivity.get(key) || []).filter(ts => now - ts < VELOCITY_WINDOW_MS);
  const velocity = timestamps.length;

  if (velocity >= 8) {
    return { surge: 0.25, velocity, label: `Extreme Real-Time Booking Surge (${velocity} active passengers/15m)` };
  }
  if (velocity >= 4) {
    return { surge: 0.15, velocity, label: `High Demand Velocity (${velocity} recent bookings)` };
  }
  if (velocity >= 2) {
    return { surge: 0.08, velocity, label: `Moderate Booking Traffic (${velocity} active users)` };
  }
  return { surge: 0, velocity, label: null };
};

// ─── Peak Travel Rush Hours (Uber/Ola Style) ──────────────────────────────────
/**
 * Peak commuter and executive departure windows
 * Morning Rush: 06:00 to 09:30
 * Evening Rush: 17:00 to 21:00
 */
const getPeakHoursSurge = (departureTime) => {
  if (!departureTime) return { surge: 0, label: null };
  const [h, m] = departureTime.split(':').map(Number);
  const timeInMinutes = (h || 0) * 60 + (m || 0);

  // Morning Peak: 6:00 AM (360) to 9:30 AM (570)
  if (timeInMinutes >= 360 && timeInMinutes <= 570) {
    return { surge: 0.15, label: 'Morning Peak Commuter & Business Rush (06:00–09:30)' };
  }

  // Evening Peak: 5:00 PM (1020) to 9:00 PM (1260)
  if (timeInMinutes >= 1020 && timeInMinutes <= 1260) {
    return { surge: 0.15, label: 'Evening Prime-Time Travel Rush (17:00–21:00)' };
  }

  return { surge: 0, label: null };
};

// ─── Google Calendar API Cache (TTL: 24 hours) ──────────────────────────────
const gcalCache = new Map();

const fetchGoogleCalendarEvents = (travelDateStr) => {
  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!apiKey || !travelDateStr) return [];
  if (gcalCache.has(travelDateStr)) return gcalCache.get(travelDateStr);

  try {
    const calId = encodeURIComponent('en.indian#holiday@group.v.calendar.google.com');
    const timeMin = `${travelDateStr}T00:00:00Z`;
    const timeMax = `${travelDateStr}T23:59:59Z`;
    const url = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?timeMin=${timeMin}&timeMax=${timeMax}&key=${apiKey}`;
    https.get(url, { timeout: 1500 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const events = (json.items || []).map(i => ({
            name: `Google Calendar: ${i.summary || 'Public Holiday'}`,
            surgeMultiplier: 0.30
          }));
          if (events.length > 0) gcalCache.set(travelDateStr, events);
        } catch (e) {}
      });
    }).on('error', () => {});
  } catch (e) {}

  return gcalCache.get(travelDateStr) || [];
};

// ─── Calendar Surge (Google Calendar & Indian National Holidays) ───────────────
const detectCalendarSurge = (travelDate) => {
  const events = [];
  let surge = 0;
  const d = new Date(travelDate || Date.now());
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dow = d.getDay();
  const md = `${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const dateStr = `${d.getFullYear()}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

  // 1. Check Live Google Calendar API events (if API key active)
  const gcalEvents = fetchGoogleCalendarEvents(dateStr);
  gcalEvents.forEach(ev => {
    events.push(ev.name);
    surge += ev.surgeMultiplier;
  });

  // 2. Check Indian Gazetted Festivals from dataset
  const festival = calendarData.festivals.find(f => f.monthDay === md);
  if (festival) {
    events.push(festival.name);
    surge += festival.surgeMultiplier;
  }

  // 3. Check Vacation Windows
  for (const vac of calendarData.vacationWindows) {
    const inWindow = (() => {
      if (vac.startMonth === vac.endMonth) {
        return month === vac.startMonth && day >= vac.startDay && day <= vac.endDay;
      }
      if (month === vac.startMonth) return day >= vac.startDay;
      if (month === vac.endMonth)   return day <= vac.endDay;
      return (month > vac.startMonth && month < vac.endMonth) ||
             (vac.startMonth > vac.endMonth && (month > vac.startMonth || month < vac.endMonth));
    })();

    if (inWindow && !festival) {
      events.push(vac.name);
      surge += vac.surgeMultiplier;
    }
  }

  // 4. Weekend Surge
  const wkd = Object.values(calendarData.weekendSurge).find(w => w.dayOfWeek === dow);
  if (wkd) {
    const label = dow === 5 ? 'Friday' : dow === 6 ? 'Saturday' : 'Sunday';
    events.push(`${label} Weekend Travel Demand`);
    surge += wkd.surgeMultiplier;
  }

  return { events, surge };
};

// ─── Detect train category from name or type ──────────────────────────────
const detectTrainCategory = (trainName = '', trainType = '') => {
  const n = trainName.toLowerCase();
  const t = trainType.toLowerCase();
  if (n.includes('rajdhani') || t.includes('rajdhani')) return 'Rajdhani';
  if (n.includes('shatabdi') || t.includes('shatabdi')) return 'Shatabdi';
  if (n.includes('duronto') || t.includes('duronto')) return 'Duronto';
  if (n.includes('vande bharat') || n.includes('vande') || t.includes('vande')) return 'Vande Bharat';
  if (n.includes('tejas') || t.includes('tejas')) return 'Tejas';
  if (n.includes('humsafar') || t.includes('humsafar')) return 'Humsafar';
  if (n.includes('garib rath') || t.includes('garib rath')) return 'Garib Rath';
  if (n.includes('sachkhand') || t.includes('sachkhand')) return 'Sachkhand';
  if (n.includes('antyodaya') || t.includes('antyodaya')) return 'Antyodaya';
  if (t.includes('mail')) return 'Mail';
  if (t.includes('express')) return 'Express';
  if (t.includes('superfast')) return 'Superfast';
  if (t.includes('passenger')) return 'Passenger';
  if (t.includes('local')) return 'Local';
  return trainType || 'Superfast';
};

// ─── Meal price — loaded from fare_rules.json, by train type & class ──────────
const getMealPrice = (trainType = 'Superfast', travelClass = '3A', mealCategory = 'No Meal', trainName = '') => {
  if (travelClass === 'GS' || !mealCategory || mealCategory === 'No Meal') return 0;

  const resolvedType = detectTrainCategory(trainName, trainType);
  const rule = fareRulesMap[resolvedType] || fareRulesMap[trainType] || fareRulesMap['Superfast'];
  if (!rule) return 130;

  // Check if this class is in noMealClasses
  if ((rule.noMealClasses || []).includes(travelClass)) return 0;

  const mealKey = mealCategory === 'Non-Veg' ? 'NonVeg' : mealCategory;
  const mealPrices = rule.mealPrices || {};
  const price = mealPrices[mealKey];
  if (price !== undefined) return price;

  // Class-specific adjustment for luxury trains (Rajdhani/Duronto vary by class)
  const t = resolvedType.toLowerCase();
  if (t.includes('rajdhani') || t.includes('duronto')) {
    const base = mealCategory === 'Continental' ? 350 : mealCategory === 'Non-Veg' ? 310 : 260;
    if (travelClass === '1A') return base;
    if (travelClass === '2A') return Math.round(base * 0.86);
    return Math.round(base * 0.75);
  }

  return 130; // safe fallback
};

// ─── Meal time eligibility ────────────────────────────────────────────────────
const isMealTimeEligible = (depTime = '08:00', arrTime = '18:00', trainMealHours = null) => {
  const toMin = t => { if (!t) return 0; const [h,m] = t.split(':').map(Number); return h*60+m; };

  const depMin = toMin(depTime);
  let arrMin   = toMin(arrTime);
  if (arrMin <= depMin) arrMin += 24*60;

  const defaults = {
    breakfast: { start: '07:00', end: '10:00' },
    lunch:     { start: '12:00', end: '14:00' },
    snacks:    { start: '16:00', end: '18:00' },
    dinner:    { start: '19:00', end: '21:00' }
  };
  const src = trainMealHours || defaults;

  const windows = [];
  const addW = (label, start, end, dayOffset = 0) => {
    windows.push({ name: label, start: toMin(start) + dayOffset, end: toMin(end) + dayOffset });
  };

  if (src.breakfast) addW('Breakfast (7–10 AM)', src.breakfast.start, src.breakfast.end);
  if (src.lunch)     addW('Lunch (12–2 PM)',     src.lunch.start,     src.lunch.end);
  if (src.snacks)    addW('Evening Snacks & Tea', src.snacks.start,    src.snacks.end);
  if (src.dinner)    addW('Dinner (7–9 PM)',    src.dinner.start,    src.dinner.end);
  // Next-day windows for multi-day journeys
  if (src.breakfast) addW('Breakfast (Day 2)',   src.breakfast.start, src.breakfast.end, 24*60);
  if (src.lunch)     addW('Lunch (Day 2)',       src.lunch.start,     src.lunch.end,     24*60);
  if (src.snacks)    addW('Evening Snacks (Day 2)', src.snacks.start, src.snacks.end, 24*60);
  if (src.dinner)    addW('Dinner (Day 2)',      src.dinner.start,    src.dinner.end,    24*60);

  const active = windows.filter(w => Math.max(w.start, depMin) < Math.min(w.end, arrMin));
  const message = active.length > 0
    ? `Meal service eligible for: ${active.map(w=>w.name).join(', ')}`
    : 'Journey does not overlap with onboard catering hours. Food charges are ₹0.';

  return {
    isEligible:   active.length > 0,
    eligible:     active.length > 0,
    eligibleMeals: active.map(w => w.name),
    message,
    reason:       message
  };
};

// ─── Core Deterministic Dynamic Pricing Calculation ───────────────────────────
const calculateFare = (params) => {
  const {
    trainNo = '',
    trainName = '',
    trainType = 'Superfast',
    travelClass = '3A',
    distanceKm = 450,
    occupancyRate = 0.70,
    waitlistPosition = 0,
    travelDate,
    mealCategory = 'No Meal',
    passengerCount = 1,
    pantryAvailable = true,
    departureTime = '08:00',
    arrivalTime = '18:00',
    trainMealHours = null,
    quota = 'GENERAL'
  } = params;

  const effectiveTrainType = detectTrainCategory(trainName, trainType);
  const rule = fareRulesMap[effectiveTrainType] || fareRulesMap[trainType] || fareRulesMap['Superfast'] || {
    baseFarePerKm: 0.75, facilityMultiplier: 1.15, reservationCharge: 30, classMultipliers: {}
  };
  const clsMult = (rule.classMultipliers || {})[travelClass] || 1.0;
  
  // 1. Statutory Base Tariff (The Floor)
  const baseFare = Math.round((distanceKm * rule.baseFarePerKm * clsMult * rule.facilityMultiplier) + rule.reservationCharge);

  let dynamicMultiplier = 1.0;
  const factors = [];

  // 2. Occupancy Rate Surge
  if (occupancyRate >= 0.85) {
    dynamicMultiplier += 0.25;
    factors.push(`Heavy route load (${Math.round(occupancyRate*100)}% occupancy)`);
  } else if (occupancyRate >= 0.65) {
    dynamicMultiplier += 0.15;
    factors.push(`Moderate route load (${Math.round(occupancyRate*100)}% occupancy)`);
  }

  // 3. Real-Time Booking Velocity Surge (Uber/Ola model)
  const velocityCheck = getBookingVelocitySurge(trainNo);
  if (velocityCheck.surge > 0) {
    dynamicMultiplier += velocityCheck.surge;
    factors.push(velocityCheck.label);
  }

  // 4. Peak Rush Hours Surge (Uber/Ola peak departure hours model)
  const peakHourCheck = getPeakHoursSurge(departureTime);
  if (peakHourCheck.surge > 0) {
    dynamicMultiplier += peakHourCheck.surge;
    factors.push(peakHourCheck.label);
  }

  // 5. Scarcity & Waitlist Demand Surge
  if (waitlistPosition > 0) {
    dynamicMultiplier += 0.20;
    factors.push(`High Waitlist Demand & Seat Scarcity (WL #${waitlistPosition})`);
  }

  // Keep Tatkal policy configurable and separate from passenger profile data.
  if (String(quota).toUpperCase() === 'TATKAL') {
    const tatkalPercent = Number(process.env.TATKAL_SURCHARGE_PERCENT || 30);
    dynamicMultiplier += Math.max(0, tatkalPercent) / 100;
    factors.push(`Tatkal quota (+${Math.max(0, tatkalPercent)}%)`);
  }

  // 6. Multiple Passengers Group Load Factor
  if (passengerCount >= 3) {
    dynamicMultiplier += 0.08;
    factors.push(`Group Booking Factor (${passengerCount} passengers)`);
  }

  // 7. Google Calendar, Festivals, Vacations & Events
  const { events, surge: calendarSurge } = detectCalendarSurge(travelDate);
  if (calendarSurge > 0) {
    dynamicMultiplier += calendarSurge;
    events.forEach(e => factors.push(e));
  }

  // Dynamic multiplier capped at reasonable maximum 2.4x
  dynamicMultiplier = Math.min(2.4, dynamicMultiplier);

  // 8. STRICT STATUTORY FLOOR: Dynamic fare can NEVER be below base fare
  const dynamicFare = Math.max(baseFare, Math.round(baseFare * dynamicMultiplier));
  const surgePercentage = Math.round((dynamicMultiplier - 1.0) * 100);

  // 9. Meal Eligibility Verification (No cold drinks or standalone beverages permitted)
  const mealElig = isMealTimeEligible(departureTime, arrivalTime, trainMealHours);
  let mealPrice = 0;
  const isMealIncluded = rule.mealIncluded === true;
  if (pantryAvailable && mealElig.isEligible && mealCategory !== 'No Meal' && travelClass !== 'GS') {
    if (isMealIncluded) {
      mealPrice = 0; // Included in luxury statutory base fare
    } else {
      mealPrice = getMealPrice(effectiveTrainType, travelClass, mealCategory, trainName);
    }
  }

  const perPassengerTotal = dynamicFare + mealPrice;
  const finalFare = Math.round(perPassengerTotal * Math.max(1, passengerCount));

  return {
    baseFare,
    dynamicFare,
    mealPrice,
    mealEligible: mealElig.isEligible,
    mealChargesApplied: mealPrice > 0,
    perPassengerTotal,
    finalFare,
    passengerCount: Math.max(1, passengerCount),
    surgePercentage,
    detectedEvents: events,
    factors,
    explanation: `Base: ₹${baseFare}. Dynamic rate: +${surgePercentage}%. Factors: ${factors.length ? factors.join(', ') : 'Standard government tariff'}.`
  };
};

// ─── Fare-Lock Pipeline (Guarantees Quoted Price for 5 Minutes) ────────────────
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

const generateFareLock = async (fareParams) => {
  const fareResult = calculateFare(fareParams);
  const lockToken = require('crypto').randomUUID();
  const expiresAt = new Date(Date.now() + LOCK_TTL_MS);
  const lockedFare = fareParams.lockedFare !== undefined ? Number(fareParams.lockedFare) : fareResult.finalFare;

  const lockData = {
    lockToken,
    trainNo: fareParams.trainNo || '',
    travelClass: fareParams.travelClass || '3A',
    travelDate: fareParams.travelDate || '',
    userEmail: fareParams.userEmail || '',
    lockedFare,
    baseFare: fareResult.baseFare,
    dynamicFare: fareResult.dynamicFare,
    mealPrice: fareResult.mealPrice,
    discountAmount: fareParams.discountAmount || 0,
    passengerCount: fareParams.passengerCount || 1,
    used: false,
    expiresAt
  };

  // Enterprise Tier 1: Persist in Redis Distributed Cache Grid
  try {
    await redisService.setFareLock(lockToken, lockData, Math.round(LOCK_TTL_MS / 1000));
  } catch (err) {}

  if (!getIsFallback()) {
    try {
      await FareLock.create(lockData);
    } catch(e) {
      inMemoryFareLocks.set(lockToken, lockData);
    }
  } else {
    inMemoryFareLocks.set(lockToken, lockData);
  }

  return { lockToken, lockedFare, expiresAt, ...fareResult };
};

const verifyAndConsumeFareLock = async (lockToken, expectedAmount) => {
  if (!lockToken) return { valid: false, reason: 'No fare lock token provided.' };

  let lock = null;

  // Enterprise Tier 1: Fast Lookup via Redis Cache
  try {
    lock = await redisService.getFareLock(lockToken);
  } catch (err) {}

  if (!lock && !getIsFallback()) {
    try {
      lock = await FareLock.findOne({ lockToken, used: false });
    } catch(e) {}
  }
  if (!lock) lock = inMemoryFareLocks.get(lockToken) || null;

  if (!lock) return { valid: false, reason: 'Fare lock not found. Please re-quote ticket.' };
  if (lock.used) return { valid: false, reason: 'Fare lock already used.' };
  if (new Date() > new Date(lock.expiresAt)) {
    return { valid: false, reason: 'Fare lock expired (5 min). Please re-quote your ticket.' };
  }

  const diff = Math.abs(Number(lock.lockedFare) - Number(expectedAmount));
  if (diff > 1) {
    return { valid: false, reason: `Fare mismatch detected (locked: ₹${lock.lockedFare}, attempted: ₹${expectedAmount}). Please re-quote.` };
  }

  lock.used = true;
  // Invalidate in Redis
  try {
    await redisService.deleteFareLock(lockToken);
  } catch (err) {}

  if (!getIsFallback()) {
    try { await FareLock.updateOne({ lockToken }, { used: true }); } catch(e) {}
  }
  inMemoryFareLocks.delete(lockToken);

  return { valid: true, lock };
};

module.exports = {
  calculateFare,
  generateFareLock,
  verifyAndConsumeFareLock,
  isMealTimeEligible,
  getMealPrice,
  detectCalendarSurge,
  recordBookingActivity,
  getBookingVelocitySurge,
  getPeakHoursSurge
};
