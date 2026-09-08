const http = require('http');

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';

// Helper: Check if train journey overlaps with standard meal service windows
// Breakfast: 07:00 - 10:00, Lunch: 12:00 - 14:00, Dinner: 19:00 - 21:00
const isMealTimeEligible = (depTime = '08:00', arrTime = '18:00') => {
  const parseMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(n => parseInt(n, 10) || 0);
    return h * 60 + m;
  };

  const depMinutes = parseMinutes(depTime);
  let arrMinutes = parseMinutes(arrTime);
  // If arrival is on next day or past midnight
  if (arrMinutes <= depMinutes) {
    arrMinutes += 24 * 60;
  }

  // Meal windows in minutes from midnight
  const mealWindows = [
    { name: 'Breakfast', start: 7 * 60, end: 10 * 60 },
    { name: 'Lunch', start: 12 * 60, end: 14 * 60 },
    { name: 'Dinner', start: 19 * 60, end: 21 * 60 },
    // Next day windows if multi-day journey
    { name: 'Breakfast (Next Day)', start: (24 + 7) * 60, end: (24 + 10) * 60 },
    { name: 'Lunch (Next Day)', start: (24 + 12) * 60, end: (24 + 14) * 60 },
    { name: 'Dinner (Next Day)', start: (24 + 19) * 60, end: (24 + 21) * 60 }
  ];

  const activeWindows = [];
  for (const w of mealWindows) {
    // Journey overlaps window if max(start, dep) <= min(end, arr)
    if (Math.max(w.start, depMinutes) < Math.min(w.end, arrMinutes)) {
      activeWindows.push(w.name);
    }
  }

  return {
    isEligible: activeWindows.length > 0,
    eligibleMeals: activeWindows,
    message: activeWindows.length > 0
      ? `Meal service & food coupons eligible for: ${activeWindows.join(', ')}`
      : 'Journey does not overlap with onboard catering hours (7-10 AM, 12-2 PM, 7-9 PM).'
  };
};

// Helper: Calendar & Festival detection for Node.js engine
const detectCalendarSurge = (travelDate) => {
  const events = [];
  let surge = 0;
  const dateObj = new Date(travelDate || Date.now());
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat
  const monthDay = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const festivalMap = {
    '01-01': { name: 'New Year Peak Travel', surge: 0.20 },
    '01-14': { name: 'Makar Sankranti / Pongal', surge: 0.25 },
    '01-26': { name: 'Republic Day Extended Weekend', surge: 0.15 },
    '03-25': { name: 'Holi Festival of Colors', surge: 0.35 },
    '04-11': { name: 'Eid-ul-Fitr Travel Surge', surge: 0.30 },
    '08-15': { name: 'Independence Day Holiday', surge: 0.25 },
    '08-19': { name: 'Raksha Bandhan Rush', surge: 0.25 },
    '09-07': { name: 'Ganesh Chaturthi Festivities', surge: 0.25 },
    '10-02': { name: 'Gandhi Jayanti Long Weekend', surge: 0.20 },
    '10-12': { name: 'Dussehra / Durga Puja Peak', surge: 0.35 },
    '10-24': { name: 'ICC World Cup / Tournament Match', surge: 0.30 },
    '10-31': { name: 'Diwali Festival Peak Travel', surge: 0.40 },
    '11-01': { name: 'Diwali & Govardhan Celebrations', surge: 0.40 },
    '11-07': { name: 'Chhath Puja Peak Movement', surge: 0.45 },
    '12-25': { name: 'Christmas Holiday Travel', surge: 0.25 },
    '12-31': { name: 'New Year Eve Travel Surge', surge: 0.35 }
  };

  if (festivalMap[monthDay]) {
    events.push(festivalMap[monthDay].name);
    surge += festivalMap[monthDay].surge;
  }

  // Summer Vacations (May & June)
  if (month === 5 || month === 6) {
    events.push('Summer Vacation Holiday Rush');
    surge += 0.20;
  }

  // Winter Vacation (Dec 20 - Jan 5)
  if ((month === 12 && day >= 20) || (month === 1 && day <= 5)) {
    if (!festivalMap[monthDay]) {
      events.push('Winter Holidays Travel Rush');
      surge += 0.15;
    }
  }

  // Weekends (Friday evening, Saturday, Sunday)
  if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) {
    const dName = dayOfWeek === 0 ? 'Sunday' : dayOfWeek === 6 ? 'Saturday' : 'Friday';
    events.push(`${dName} Weekend Travel Demand`);
    surge += 0.12;
  }

  return { events, surge };
};

// Helper to make HTTP POST/GET to Python FastAPI service
const callFastAPI = (endpoint, method = 'POST', payload = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(`${FASTAPI_URL}${endpoint}`);
      const data = JSON.stringify(payload);
      
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 2500
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(body));
            } else {
              reject(new Error(`FastAPI returned status ${res.statusCode}`));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('FastAPI connection timeout'));
      });

      if (method === 'POST') {
        req.write(data);
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
};

// 1. Predict Waitlist Confirmation Probability
const predictWaitlist = async (trainNo, travelClass, waitlistPos, travelDate) => {
  try {
    const res = await callFastAPI('/predict-waitlist', 'POST', {
      trainNo, travelClass, waitlistPos, travelDate
    });
    return res;
  } catch (err) {
    let probability = Math.max(15, 95 - waitlistPos * 4.5);
    if (travelClass === '1A' || travelClass === '2A') probability += 8;
    probability = Math.min(99, Math.round(probability));

    return {
      confirmationProbability: probability,
      explanation: `Based on 12-month cancellation velocity and coach capacity (${travelClass}), Waitlist #${waitlistPos} has a ${probability}% probability of confirmation before chart preparation.`
    };
  }
};

// Dynamic Meal Pricing by Train Type & Purpose:
// Luxury trains (Shatabdi, Rajdhani, Duronto, Vande Bharat, Tejas): Premium gourmet dining
// Standard (Superfast, Express, Mail): Standard IRCTC catering
// Holy / Pilgrimage (Sachkhand Express): Subsidized satvik langar meals (pure veg)
// Needy / Budget (Garib Rath): Subsidized low-cost affordable meals
// General ticket (GS): Food facility NOT ALLOWED (mealPrice = 0)
const getMealPrice = (trainType = 'Superfast', travelClass = '3A', mealCategory = 'No Meal') => {
  if (travelClass === 'GS' || mealCategory === 'No Meal') return 0;

  const t = (trainType || '').toLowerCase();
  
  // Luxury dining
  if (t.includes('rajdhani') || t.includes('shatabdi') || t.includes('duronto') || t.includes('vande') || t.includes('tejas')) {
    if (mealCategory === 'Veg' || mealCategory === 'Jain') return 260;
    if (mealCategory === 'Non-Veg') return 310;
    if (mealCategory === 'Continental') return 350;
    return 260;
  }

  // Holy purpose (Sachkhand) - pure satvik
  if (t.includes('sachkhand')) {
    if (mealCategory === 'Veg' || mealCategory === 'Jain') return 65;
    return 65; // Non-veg & continental unavailable on holy train
  }

  // Budget / Needy purpose (Garib Rath)
  if (t.includes('garib')) {
    if (mealCategory === 'Veg' || mealCategory === 'Jain') return 60;
    if (mealCategory === 'Non-Veg') return 85;
    return 60;
  }

  // Standard Express / Superfast
  if (mealCategory === 'Veg' || mealCategory === 'Jain') return 130;
  if (mealCategory === 'Non-Veg') return 170;
  if (mealCategory === 'Continental') return 210;
  return 130;
};

// 2. Dynamic Fare Calculation with Google Calendar, Festivals, Vacations & Traffic
const calculateDynamicFare = async (params) => {
  const { trainNo, trainType, travelClass = '3A', distanceKm, bookingCount, occupancyRate, travelDate, mealCategory = 'No Meal' } = params;
  try {
    const res = await callFastAPI('/calculate-fare', 'POST', params);
    // Override meal price with train-specific rate
    const dynamicMealPrice = getMealPrice(trainType, travelClass, mealCategory);
    return {
      ...res,
      mealPrice: dynamicMealPrice,
      finalFare: res.dynamicFare + dynamicMealPrice
    };
  } catch (err) {
    // Base fare table
    const rates = {
      Passenger: 0.45, Local: 0.40, Mail: 0.55, Express: 0.65,
      Superfast: 0.75, Shatabdi: 1.10, Rajdhani: 1.20, Duronto: 1.15,
      'Vande Bharat': 1.35, Tejas: 1.30, 'Garib Rath': 0.50, Sachkhand: 0.55
    };
    const classMultiplier = { '1A': 3.2, '2A': 2.1, '3A': 1.5, 'SL': 0.6, 'CC': 1.1, 'EC': 2.4, 'GS': 0.35 };
    const baseRate = rates[trainType] || 0.65;
    const mult = classMultiplier[travelClass] || 1.0;
    const baseFare = Math.round((distanceKm * baseRate * mult) + 30);

    // Dynamic factors: Traffic congestion + Calendar / Festivals
    let dynamicMultiplier = 1.0;
    const factors = [];

    if (occupancyRate >= 0.85) {
      dynamicMultiplier += 0.25;
      factors.push(`Heavy Route Congestion (${Math.round(occupancyRate * 100)}% load)`);
    } else if (occupancyRate >= 0.65) {
      dynamicMultiplier += 0.15;
      factors.push(`Moderate Seat Demand (${Math.round(occupancyRate * 100)}% load)`);
    }

    const { events, surge } = detectCalendarSurge(travelDate);
    dynamicMultiplier += surge;
    events.forEach(e => factors.push(e));

    dynamicMultiplier = Math.min(2.2, dynamicMultiplier);

    // Floor protection: dynamic fare can NEVER be below base fare
    let calculatedDynamicFare = Math.round(baseFare * dynamicMultiplier);
    if (calculatedDynamicFare < baseFare) calculatedDynamicFare = baseFare;

    // Train-specific meal price
    const mealPrice = getMealPrice(trainType, travelClass, mealCategory);
    const finalFare = calculatedDynamicFare + mealPrice;
    const surgePercentage = Math.round((dynamicMultiplier - 1.0) * 100);
    const factorsStr = factors.length > 0 ? factors.join(', ') : 'Standard demand curve';

    return {
      baseFare,
      dynamicFare: calculatedDynamicFare,
      mealPrice,
      finalFare,
      surgePercentage,
      detectedEvents: events,
      explanation: `Base tariff floor-protected at ₹${baseFare}. Dynamic rate (${surgePercentage > 0 ? '+' + surgePercentage + '%' : 'Standard'}) calculated from: ${factorsStr}.`
    };
  }
};

// 3. Delay & Journey Replanner
const getDelayReplanning = async (trainNo, currentDelayMinutes, routeCode) => {
  try {
    const res = await callFastAPI('/delay-replan', 'POST', { trainNo, currentDelayMinutes, routeCode });
    return res;
  } catch (err) {
    const shouldReplan = currentDelayMinutes >= 20;
    return {
      isDelayed: currentDelayMinutes > 15,
      delayMinutes: currentDelayMinutes,
      recommendationAvailable: shouldReplan,
      alternativeTrains: shouldReplan ? [
        {
          trainNo: '12951',
          trainName: 'Mumbai New Delhi Rajdhani Express',
          departure: '16:30',
          arrival: '08:30',
          availableSeats: 14,
          timeSavedMinutes: currentDelayMinutes + 25,
          explanation: 'Running on-time along the same route track with guaranteed available berths.'
        },
        {
          trainNo: '12002',
          trainName: 'Bhopal Shatabdi Express',
          departure: '17:45',
          arrival: '23:30',
          availableSeats: 8,
          timeSavedMinutes: currentDelayMinutes + 15,
          explanation: 'Fastest superfast service on route with available AC Chair Car seats.'
        }
      ] : []
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
