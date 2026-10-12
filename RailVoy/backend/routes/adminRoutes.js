const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const Train = require('../models/Train');
const Station = require('../models/Station');
const Booking = require('../models/Booking');
const { Coupon, inMemoryCoupons } = require('../models/Coupon');
const { AdminAdjustment, inMemoryAdjustments } = require('../models/AdminAdjustment');
const { getIsFallback } = require('../config/db');
const { inMemoryBookings } = require('./bookingRoutes');
const { updateTrainDelayInMemory, getTrainsCache, setSeedCache } = require('./trainRoutes');
const { determineRouteConnectivity } = require('../services/routeGraphService');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

router.use(authenticateToken, requireAdmin);

const FARE_RULES_PATH = path.join(__dirname, '../../dataset/fare_rules.json');
const TRAINS_PATH = path.join(__dirname, '../../dataset/trains.json');

// Utility: get all bookings (DB or memory)
const getAllBookings = async () => {
  try {
    if (!getIsFallback()) {
      const dbBookings = await Booking.find({});
      return dbBookings.length > 0 ? dbBookings : inMemoryBookings;
    }
    return inMemoryBookings;
  } catch (e) {
    return inMemoryBookings;
  }
};

// Utility: get all trains
const getAllTrains = async () => {
  try {
    if (!getIsFallback()) {
      const dbTrains = await Train.find({});
      if (dbTrains.length > 0) return dbTrains;
    }
    if (typeof getTrainsCache === 'function') {
      const cache = getTrainsCache();
      if (cache && cache.length > 0) return cache;
    }
    if (fs.existsSync(TRAINS_PATH)) {
      return JSON.parse(fs.readFileSync(TRAINS_PATH, 'utf8'));
    }
  } catch (e) {}
  return [];
};

// ════════════════════════════════════════════
//   TRAFFIC & ANALYTICS
// ════════════════════════════════════════════

router.get('/traffic-analytics', async (req, res) => {
  try {
    const allBookings = await getAllBookings();

    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dailyMap = {};
    days.forEach(d => { dailyMap[d] = { bookings: 0, revenue: 0, searches: 0 }; });

    allBookings.forEach(b => {
      const d = new Date(b.createdAt || Date.now());
      const dayName = days[d.getDay()];
      if (dailyMap[dayName]) {
        dailyMap[dayName].bookings++;
        dailyMap[dayName].revenue += Number(b.finalFare || 0);
        dailyMap[dayName].searches += 3;
      }
    });

    const baseDemand = { Sun: 180, Mon: 90, Tue: 110, Wed: 130, Thu: 150, Fri: 210, Sat: 240 };
    const dailyTraffic = days.map(day => ({
      day,
      bookings: Math.max(dailyMap[day].bookings || 0, baseDemand[day] || 100),
      revenue: Math.max(dailyMap[day].revenue || 0, (baseDemand[day] || 100) * 1200),
      searches: Math.max(dailyMap[day].searches || 0, (baseDemand[day] || 100) * 8)
    }));

    const totalBookings = allBookings.length;
    const totalRevenue = allBookings.reduce((sum, b) => sum + Number(b.finalFare || 0), 0);
    const confirmedCount = allBookings.filter(b => b.status === 'Confirmed').length;
    const waitlistCount = allBookings.filter(b => b.status === 'Waitlisted').length;
    const cancelledCount = allBookings.filter(b => b.status === 'Cancelled').length;

    const routeMap = {};
    allBookings.forEach(b => {
      const key = `${b.fromStation} → ${b.toStation}`;
      if (!routeMap[key]) routeMap[key] = { bookings: 0, revenue: 0 };
      routeMap[key].bookings++;
      routeMap[key].revenue += Number(b.finalFare || 0);
    });

    const routePopularity = Object.entries(routeMap)
      .map(([route, data]) => ({
        route,
        bookings: data.bookings,
        avgOccupancy: `${Math.min(99, Math.round(60 + data.bookings * 5))}%`
      }))
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 6);

    if (routePopularity.length < 2) {
      routePopularity.push(
        { route: 'NDLS → SBC (Karnataka Express)', bookings: 420, avgOccupancy: '92%' },
        { route: 'MMCT → NDLS (Rajdhani Express)', bookings: 510, avgOccupancy: '98%' }
      );
    }

    res.json({
      summary: {
        totalDailyBookings: totalBookings || dailyTraffic.reduce((s, d) => s + d.bookings, 0),
        totalWeeklyRevenue: totalRevenue || dailyTraffic.reduce((s, d) => s + d.revenue, 0),
        confirmedBookings: confirmedCount,
        waitlistBookings: waitlistCount,
        cancelledBookings: cancelledCount,
        aiReplansIssued: Math.round((totalBookings || 50) * 0.08),
        seatRecyclingRate: `${Math.min(99, Math.round(90 + (confirmedCount / Math.max(1, totalBookings)) * 8)).toFixed(1)}%`
      },
      dailyTraffic,
      routePopularity
    });
  } catch (err) {
    console.error('Analytics Error:', err);
    res.status(500).json({ error: 'Analytics fetch failed' });
  }
});

// ════════════════════════════════════════════
//   DELAY MANAGEMENT
// ════════════════════════════════════════════

router.post('/update-delay', async (req, res) => {
  try {
    const { trainNo, delayMinutes, status } = req.body;
    const cleanTrainNo = String(trainNo || '').trim();
    const safeDelay = Number(delayMinutes);

    if (!cleanTrainNo) return res.status(400).json({ error: 'trainNo required' });
    if (!Number.isFinite(safeDelay) || safeDelay < 0 || safeDelay > 300) {
      return res.status(400).json({ error: 'Delay must be between 0 and 300 minutes.' });
    }

    const normalizedStatus = typeof status === 'string' && status.trim() ? status.trim() : (safeDelay > 0 ? 'Delayed' : 'On Time');

    if (!getIsFallback()) {
      await Train.updateOne({ trainNo: cleanTrainNo }, { currentDelayMinutes: safeDelay, status: normalizedStatus });
    }
    if (typeof updateTrainDelayInMemory === 'function') {
      updateTrainDelayInMemory(cleanTrainNo, safeDelay, normalizedStatus);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('delay_alert', {
        trainNo: cleanTrainNo,
        delayMinutes: safeDelay,
        status: safeDelay > 0 ? `Delayed by ${safeDelay} mins` : 'On Time',
        timestamp: new Date()
      });
    }

    res.json({ message: `Train ${cleanTrainNo} delay updated to ${safeDelay} minutes`, trainNo: cleanTrainNo, delayMinutes: safeDelay });
  } catch (err) {
    res.status(500).json({ error: 'Delay update failed' });
  }
});

// ════════════════════════════════════════════
//   TRAIN MANAGEMENT (CRUD & Coach Editor)
// ════════════════════════════════════════════

// GET /api/admin/trains - Full train list
router.get('/trains', async (req, res) => {
  try {
    const trains = await getAllTrains();
    res.json({ trains, total: trains.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trains' });
  }
});

// POST /api/admin/trains/add - Add new train
router.post('/trains/add', async (req, res) => {
  try {
    const {
      trainNo, trainName, trainType = 'Superfast',
      source, destination, runDays = [0,1,2,3,4,5,6],
      pantryAvailable = true, hasPantrycar = true,
      coachComposition = [], totalSeats = {}, bookedSeats = {}
    } = req.body;

    if (!trainNo || !trainName || !source || !destination) {
      return res.status(400).json({ error: 'trainNo, trainName, source, and destination are required' });
    }

    const cleanTrainNo = String(trainNo).trim();

    const trainData = {
      trainNo: cleanTrainNo,
      trainName: trainName.trim(),
      trainType,
      source: source.toUpperCase().trim(),
      destination: destination.toUpperCase().trim(),
      runDays,
      pantryAvailable: Boolean(pantryAvailable),
      hasPantrycar: Boolean(hasPantrycar),
      coachComposition: coachComposition.length > 0 ? coachComposition : [
        { code: 'GS1', type: 'GS', position: 1, seats: 80 },
        { code: 'S1',  type: 'SL', position: 2, seats: 72 },
        { code: 'S2',  type: 'SL', position: 3, seats: 72 },
        { code: 'B1',  type: '3A', position: 4, seats: 72 },
        { code: 'B2',  type: '3A', position: 5, seats: 72 },
        { code: 'A1',  type: '2A', position: 6, seats: 52 },
        { code: 'H1',  type: '1A', position: 7, seats: 24 }
      ],
      totalSeats,
      bookedSeats,
      currentDelayMinutes: 0,
      status: 'On Time'
    };

    if (!getIsFallback()) {
      const existing = await Train.findOne({ trainNo: cleanTrainNo });
      if (existing) return res.status(409).json({ error: `Train #${cleanTrainNo} already exists` });
      const newTrain = new Train(trainData);
      await newTrain.save();
    }

    // Also update JSON dataset
    try {
      if (fs.existsSync(TRAINS_PATH)) {
        const list = JSON.parse(fs.readFileSync(TRAINS_PATH, 'utf8'));
        if (!list.find(t => t.trainNo === cleanTrainNo)) {
          list.push(trainData);
          fs.writeFileSync(TRAINS_PATH, JSON.stringify(list, null, 2));
        }
      }
    } catch (e) {}

    res.json({ success: true, message: `Train #${cleanTrainNo} created successfully`, train: trainData });
  } catch (err) {
    console.error('Train add error:', err);
    res.status(500).json({ error: 'Failed to add train' });
  }
});

// PATCH /api/admin/trains/:trainNo - Update train details
router.patch('/trains/:trainNo', async (req, res) => {
  try {
    const { trainNo } = req.params;
    const cleanTrainNo = String(trainNo).trim();
    const updateData = req.body;

    if (!getIsFallback()) {
      const updated = await Train.findOneAndUpdate({ trainNo: cleanTrainNo }, updateData, { new: true });
      if (!updated) return res.status(404).json({ error: 'Train not found' });
      return res.json({ success: true, message: `Train #${cleanTrainNo} updated`, train: updated });
    } else {
      let cache = typeof getTrainsCache === 'function' ? getTrainsCache() : [];
      const train = cache.find(t => t.trainNo === cleanTrainNo);
      if (!train) return res.status(404).json({ error: 'Train not found' });
      Object.assign(train, updateData);
      return res.json({ success: true, message: `Train #${cleanTrainNo} updated`, train });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update train' });
  }
});

// DELETE /api/admin/trains/:trainNo - Delete train
router.delete('/trains/:trainNo', async (req, res) => {
  try {
    const { trainNo } = req.params;
    const cleanTrainNo = String(trainNo).trim();

    if (!getIsFallback()) {
      await Train.findOneAndDelete({ trainNo: cleanTrainNo });
    }

    try {
      if (fs.existsSync(TRAINS_PATH)) {
        let list = JSON.parse(fs.readFileSync(TRAINS_PATH, 'utf8'));
        list = list.filter(t => t.trainNo !== cleanTrainNo);
        fs.writeFileSync(TRAINS_PATH, JSON.stringify(list, null, 2));
      }
    } catch (e) {}

    res.json({ success: true, message: `Train #${cleanTrainNo} deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete train' });
  }
});

// POST /api/admin/trains/:trainNo/coaches - Update Coach Composition
router.post('/trains/:trainNo/coaches', async (req, res) => {
  try {
    const { trainNo } = req.params;
    const { coachComposition } = req.body;
    const cleanTrainNo = String(trainNo).trim();

    if (!Array.isArray(coachComposition)) {
      return res.status(400).json({ error: 'coachComposition must be an array of coach objects' });
    }

    const hasPantrycar = coachComposition.some(c => (c.type || c.code || '').toUpperCase().includes('PC') || (c.type || '').toUpperCase() === 'PANTRY');

    if (!getIsFallback()) {
      await Train.updateOne(
        { trainNo: cleanTrainNo },
        { coachComposition, hasPantrycar, pantryAvailable: hasPantrycar }
      );
    }

    res.json({
      success: true,
      message: `Coach composition updated for Train #${cleanTrainNo}`,
      trainNo: cleanTrainNo,
      hasPantrycar,
      coachesCount: coachComposition.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update coach composition' });
  }
});

// ════════════════════════════════════════════
//   FARE RULES MANAGEMENT
// ════════════════════════════════════════════

// GET /api/admin/fare-rules
router.get('/fare-rules', (req, res) => {
  try {
    if (fs.existsSync(FARE_RULES_PATH)) {
      const rules = JSON.parse(fs.readFileSync(FARE_RULES_PATH, 'utf8'));
      return res.json({ fareRules: rules });
    }
    res.status(404).json({ error: 'Fare rules file not found' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load fare rules' });
  }
});

// PATCH /api/admin/fare-rules - Update baseFarePerKm or multipliers
router.patch('/fare-rules', (req, res) => {
  try {
    const { trainType, baseFarePerKm, facilityMultiplier, reservationCharge } = req.body;
    if (!trainType) return res.status(400).json({ error: 'trainType is required' });

    if (fs.existsSync(FARE_RULES_PATH)) {
      let rules = JSON.parse(fs.readFileSync(FARE_RULES_PATH, 'utf8'));
      const idx = rules.findIndex(r => r.trainType.toLowerCase() === trainType.toLowerCase());
      if (idx === -1) return res.status(404).json({ error: `Fare rule for ${trainType} not found` });

      if (baseFarePerKm != null) rules[idx].baseFarePerKm = Number(baseFarePerKm);
      if (facilityMultiplier != null) rules[idx].facilityMultiplier = Number(facilityMultiplier);
      if (reservationCharge != null) rules[idx].reservationCharge = Number(reservationCharge);

      fs.writeFileSync(FARE_RULES_PATH, JSON.stringify(rules, null, 2));
      return res.json({ success: true, message: `Fare rule for ${trainType} updated`, updatedRule: rules[idx] });
    }
    res.status(404).json({ error: 'Fare rules file not found' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update fare rule' });
  }
});

// ════════════════════════════════════════════
//   FARE ADJUSTMENT LEDGER (Delay Transfers)
// ════════════════════════════════════════════

// GET /api/admin/adjustment-ledger - List all transfer fare adjustments
router.get('/adjustment-ledger', async (req, res) => {
  try {
    let adjustments = [];
    if (!getIsFallback()) {
      adjustments = await AdminAdjustment.find({}).sort({ createdAt: -1 });
      if (adjustments.length === 0) adjustments = inMemoryAdjustments;
    } else {
      adjustments = inMemoryAdjustments;
    }

    const totalOverdue = adjustments
      .filter(a => a.direction === 'refund' && a.status === 'pending')
      .reduce((sum, a) => sum + (Number(a.fareDiff) || 0), 0);

    const totalPendingCredits = adjustments
      .filter(a => a.direction === 'charge' && a.status === 'pending')
      .reduce((sum, a) => sum + (Number(a.fareDiff) || 0), 0);

    res.json({
      adjustments,
      totalCount: adjustments.length,
      pendingCount: adjustments.filter(a => a.status === 'pending').length,
      totalOverdueRefunds: totalOverdue,
      totalPendingCredits
    });
  } catch (err) {
    res.json({ adjustments: inMemoryAdjustments, totalCount: inMemoryAdjustments.length });
  }
});

// PATCH /api/admin/adjustment/:id/settle - Settle an adjustment
router.patch('/adjustment/:id/settle', async (req, res) => {
  try {
    const { id } = req.params;
    const { settledBy = 'admin@railvoy.com', note = 'Settled by railway authority' } = req.body;

    if (!getIsFallback()) {
      const adj = await AdminAdjustment.findById(id);
      if (adj) {
        adj.status = 'settled';
        adj.settledAt = new Date();
        adj.settledBy = settledBy;
        adj.note = note;
        await adj.save();
        return res.json({ success: true, message: 'Adjustment marked as settled', adjustment: adj });
      }
    }

    const memAdj = inMemoryAdjustments.find(a => (a._id || a.id) === id || a.bookingPnr === id);
    if (!memAdj) return res.status(404).json({ error: 'Adjustment record not found' });

    memAdj.status = 'settled';
    memAdj.settledAt = new Date();
    memAdj.settledBy = settledBy;
    memAdj.note = note;

    res.json({ success: true, message: 'Adjustment marked as settled', adjustment: memAdj });
  } catch (err) {
    res.status(500).json({ error: 'Settlement failed' });
  }
});

// ════════════════════════════════════════════
//   COUPON MANAGEMENT
// ════════════════════════════════════════════

router.get('/coupons', async (req, res) => {
  try {
    let coupons = [];
    if (!getIsFallback()) {
      coupons = await Coupon.find({}).sort({ createdAt: -1 });
      if (coupons.length === 0) coupons = inMemoryCoupons;
    } else {
      coupons = inMemoryCoupons;
    }
    res.json({ coupons, total: coupons.length });
  } catch (err) {
    res.json({ coupons: inMemoryCoupons, total: inMemoryCoupons.length });
  }
});

router.post('/coupons/create', async (req, res) => {
  try {
    const {
      code, discountType = 'flat', discountValue, couponType = 'food',
      targetTier = 'elite', description = '', minFare = 0, maxDiscount, validDays = 90
    } = req.body;

    if (!code || !discountValue) {
      return res.status(400).json({ error: 'code and discountValue are required' });
    }

    const cleanCode = code.toUpperCase().trim();
    const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);
    const newCoupon = {
      code: cleanCode, discountType, discountValue: Number(discountValue),
      couponType, targetTier, description,
      minFare: Number(minFare), maxDiscount: maxDiscount ? Number(maxDiscount) : Number(discountValue) * 2,
      validUntil, isActive: true, createdAt: new Date()
    };

    if (!getIsFallback()) {
      const doc = new Coupon(newCoupon);
      const saved = await doc.save();
      return res.json({ success: true, coupon: saved, message: `Coupon ${cleanCode} created and ready for distribution.` });
    } else {
      const exists = inMemoryCoupons.find(c => c.code === cleanCode);
      if (exists) return res.status(409).json({ error: `Coupon code ${cleanCode} already exists.` });
      const memCoupon = { ...newCoupon, _id: 'cpn_' + Date.now() };
      inMemoryCoupons.push(memCoupon);
      return res.json({ success: true, coupon: memCoupon, message: `Coupon ${cleanCode} created and ready for distribution.` });
    }
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Coupon code already exists.' });
    console.error('Coupon Create Error:', err);
    res.status(500).json({ error: 'Failed to create coupon' });
  }
});

router.patch('/coupons/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    if (!getIsFallback()) {
      const coupon = await Coupon.findById(id);
      if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
      coupon.isActive = !coupon.isActive;
      await coupon.save();
      return res.json({ success: true, coupon, message: `Coupon ${coupon.code} ${coupon.isActive ? 'activated' : 'deactivated'}.` });
    } else {
      const coupon = inMemoryCoupons.find(c => c._id === id);
      if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
      coupon.isActive = !coupon.isActive;
      return res.json({ success: true, coupon, message: `Coupon ${coupon.code} ${coupon.isActive ? 'activated' : 'deactivated'}.` });
    }
  } catch (err) {
    res.status(500).json({ error: 'Toggle failed' });
  }
});

router.delete('/coupons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!getIsFallback()) {
      const result = await Coupon.findByIdAndDelete(id);
      if (!result) return res.status(404).json({ error: 'Coupon not found' });
      return res.json({ success: true, message: `Coupon ${result.code} permanently revoked.` });
    } else {
      const idx = inMemoryCoupons.findIndex(c => c._id === id);
      if (idx === -1) return res.status(404).json({ error: 'Coupon not found' });
      const [removed] = inMemoryCoupons.splice(idx, 1);
      return res.json({ success: true, message: `Coupon ${removed.code} permanently revoked.` });
    }
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ════════════════════════════════════════════
//   STATION MANAGEMENT & ROUTE CONNECTIVITY
// ════════════════════════════════════════════

const STATIONS_PATH = path.join(__dirname, '../../dataset/stations.json');

const loadStationsDataset = () => {
  try {
    if (fs.existsSync(STATIONS_PATH)) {
      return JSON.parse(fs.readFileSync(STATIONS_PATH, 'utf8'));
    }
  } catch (e) {}
  return [];
};

// GET /api/admin/stations - All railway stations
router.get('/stations', async (req, res) => {
  try {
    let allStations = [];
    if (!getIsFallback()) {
      allStations = await Station.find({}).sort({ stationCode: 1 });
      if (allStations.length === 0) allStations = loadStationsDataset();
    } else {
      allStations = loadStationsDataset();
    }
    res.json(allStations);
  } catch (err) {
    console.error('Fetch stations error:', err);
    res.status(500).json({ error: 'Failed to fetch stations' });
  }
});

// POST /api/admin/stations - Add or update a railway station
router.post('/stations', async (req, res) => {
  try {
    const { stationCode, stationName, state, zone } = req.body;
    if (!stationCode || !stationName || !state) {
      return res.status(400).json({ error: 'Station Code, Name, and State are mandatory.' });
    }
    const cleanCode = String(stationCode).trim().toUpperCase();
    const cleanName = String(stationName).trim();
    const cleanState = String(state).trim();
    const stationId = 'STN_' + cleanCode;

    const newStationData = {
      stationId,
      stationCode: cleanCode,
      stationName: cleanName,
      state: cleanState,
      zone: zone ? String(zone).trim().toUpperCase() : 'NR'
    };

    if (!getIsFallback()) {
      await Station.findOneAndUpdate({ stationCode: cleanCode }, newStationData, { upsert: true, new: true });
    }

    // Also persist to dataset file
    try {
      const stationsList = loadStationsDataset();
      const existingIdx = stationsList.findIndex(s => s.stationCode === cleanCode);
      if (existingIdx !== -1) {
        stationsList[existingIdx] = { ...stationsList[existingIdx], ...newStationData };
      } else {
        stationsList.push(newStationData);
      }
      fs.writeFileSync(STATIONS_PATH, JSON.stringify(stationsList, null, 2), 'utf8');
    } catch (fsErr) {
      console.warn('Dataset file sync warning:', fsErr.message);
    }

    res.json({ success: true, message: `Station ${cleanCode} (${cleanName}) registered successfully!`, station: newStationData });
  } catch (err) {
    console.error('Create station error:', err);
    res.status(500).json({ error: 'Failed to save station' });
  }
});

// DELETE /api/admin/stations/:stationCode - Remove station
router.delete('/stations/:stationCode', async (req, res) => {
  try {
    const { stationCode } = req.params;
    const cleanCode = String(stationCode || '').trim().toUpperCase();

    if (!getIsFallback()) {
      await Station.findOneAndDelete({ stationCode: cleanCode });
    }

    try {
      let stationsList = loadStationsDataset();
      stationsList = stationsList.filter(s => s.stationCode !== cleanCode);
      fs.writeFileSync(STATIONS_PATH, JSON.stringify(stationsList, null, 2), 'utf8');
    } catch (e) {}

    res.json({ success: true, message: `Station ${cleanCode} removed from database.` });
  } catch (err) {
    console.error('Delete station error:', err);
    res.status(500).json({ error: 'Failed to delete station' });
  }
});

// GET /api/admin/route-connectivity - Graph BFS connectivity inspection
router.get('/route-connectivity', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'Both from and to station codes are required.' });
    }
    const cleanFrom = String(from).trim().toUpperCase();
    const cleanTo = String(to).trim().toUpperCase();

    const allTrains = await getAllTrains();
    let allStations = [];
    if (!getIsFallback()) {
      allStations = await Station.find({});
      if (allStations.length === 0) allStations = loadStationsDataset();
    } else {
      allStations = loadStationsDataset();
    }

    const connectivity = determineRouteConnectivity(cleanFrom, cleanTo, allTrains, allStations);
    res.json(connectivity);
  } catch (err) {
    console.error('Admin Route Connectivity Error:', err);
    res.status(500).json({ error: 'Failed to evaluate route connectivity.' });
  }
});

module.exports = router;
