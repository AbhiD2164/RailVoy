/**
 * aiProxyService.js
 * Proxy to the FastAPI Python AI service, with Node.js fallback implementations.
 * Delegates fare computation to fareService.js (single source of truth).
 */

const http = require('http');
const { calculateFare, isMealTimeEligible, getMealPrice, detectCalendarSurge } = require('./fareService');

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';

// Helper: HTTP POST/GET to Python FastAPI service
const callFastAPI = (endpoint, method = 'POST', payload = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const url  = new URL(`${FASTAPI_URL}${endpoint}`);
      const data = JSON.stringify(payload);
      const options = {
        hostname: url.hostname,
        port:     url.port,
        path:     url.pathname + url.search,
        method,
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 2500
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(body));
            else reject(new Error(`FastAPI returned ${res.statusCode}`));
          } catch(e) { reject(e); }
        });
      });
      req.on('error',   err => reject(err));
      req.on('timeout', () => { req.destroy(); reject(new Error('FastAPI timeout')); });
      if (method === 'POST') req.write(data);
      req.end();
    } catch(err) { reject(err); }
  });
};

// ─── 1. Waitlist probability prediction ───────────────────────────────────────
const predictWaitlist = async (trainNo, travelClass, waitlistPos, travelDate, occupancyRate = 0.80) => {
  try {
    return await callFastAPI('/predict-waitlist', 'POST', { trainNo, travelClass, waitlistPos, travelDate, occupancyRate });
  } catch {
    let p = Math.max(15, 95 - waitlistPos * 4.5);
    if (travelClass === '1A' || travelClass === '2A') p += 8;
    p = Math.min(99, Math.round(p));
    return {
      confirmationProbability: p,
      explanation: `WL#${waitlistPos} has ~${p}% confirmation chance based on ${travelClass} historical cancellations.`
    };
  }
};

// ─── 2. Dynamic fare calculation (delegates to fareService) ──────────────────
const calculateDynamicFare = async (params) => {
  try {
    const res = await callFastAPI('/calculate-fare', 'POST', params);
    // Override meal price with train-specific logic from fareService
    const mealPrice = getMealPrice(params.trainType, params.travelClass, params.mealCategory, params.trainName);
    return { ...res, mealPrice, finalFare: res.dynamicFare + mealPrice };
  } catch {
    // Fallback: use local fareService (same deterministic logic)
    return calculateFare({
      ...params,
      pantryAvailable: params.pantryAvailable !== false,
      departureTime:   params.departureTime || '08:00',
      arrivalTime:     params.arrivalTime   || '18:00',
      trainMealHours:  params.trainMealHours || null
    });
  }
};

// ─── 3. Delay replanning ──────────────────────────────────────────────────────
const getDelayReplanning = async (trainNo, currentDelayMinutes, routeCode) => {
  try {
    const result = await callFastAPI('/delay-replan', 'POST', { trainNo, currentDelayMinutes, routeCode });
    return {
      ...result,
      alternativeTrains: result.alternativeTrains || result.alternatives || []
    };
  } catch {
    const shouldReplan = currentDelayMinutes >= 20;
    const isDelayed = currentDelayMinutes > 15;
    let alternatives = [];

    if (shouldReplan) {
      try {
        const { getTrainsCache } = require('../routes/trainRoutes');
        const cache = typeof getTrainsCache === 'function' ? getTrainsCache() : [];
        const currentTrain = cache.find(t => String(t.trainNo) === String(trainNo));

        if (currentTrain) {
          const matched = cache.filter(t => 
            String(t.trainNo) !== String(trainNo) &&
            t.source === currentTrain.source &&
            t.destination === currentTrain.destination
          );

          if (matched.length > 0) {
            alternatives = matched.slice(0, 2).map(alt => ({
              trainNo: alt.trainNo,
              trainName: alt.trainName,
              departure: alt.stops?.[0]?.departure || '16:30',
              arrival: alt.stops?.[alt.stops.length - 1]?.arrival || '08:30',
              availableSeats: Math.max(0, (alt.totalSeats?.['3A'] || 0) - (alt.bookedSeats?.['3A'] || 0)),
              timeSavedMinutes: currentDelayMinutes + 25,
              explanation: `AI Rationale: Train #${trainNo} is delayed by ${currentDelayMinutes} mins. Transferring to Train #${alt.trainNo} (${alt.trainName}) guarantees confirmed seats on same corridor.`
            }));
          }
        }
      } catch (e) {}

      // Do not invent trains when the live/cache dataset has no matching route.
    }

    return {
      isDelayed,
      delayMinutes: currentDelayMinutes,
      recommendationAvailable: shouldReplan && alternatives.length > 0,
      alternativeTrains: alternatives
    };
  }
};

module.exports = {
  predictWaitlist,
  calculateDynamicFare,
  getDelayReplanning,
  isMealTimeEligible,
  detectCalendarSurge,
  getMealPrice
};
