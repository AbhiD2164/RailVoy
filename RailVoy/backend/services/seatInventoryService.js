/**
 * seatInventoryService.js — Real-Time Seat Inventory with Concurrency Control
 * 
 * Implements OS-level mutex locking per train, ACID-style two-phase commit for seat allocation:
 * Phase 1 RESERVE → Phase 2 CONFIRM (or ROLLBACK on payment failure)
 * Simulates a production RDBMS row-level lock system.
 */

const path = require('path');
const fs = require('fs');

// ── Default seat counts by train type ──────────────────────────────────────
const SEAT_CONFIG = {
  'Rajdhani':    { '1A': 24, '2A': 52, '3A': 144, 'SL': 0,   'CC': 0,   'EC': 0,  'GS': 0 },
  'Duronto':     { '1A': 24, '2A': 52, '3A': 144, 'SL': 0,   'CC': 0,   'EC': 0,  'GS': 0 },
  'Shatabdi':    { '1A': 0,  '2A': 0,  '3A': 0,   'SL': 0,   'CC': 390, 'EC': 98, 'GS': 0 },
  'Vande Bharat':{ '1A': 0,  '2A': 0,  '3A': 0,   'SL': 0,   'CC': 390, 'EC': 98, 'GS': 0 },
  'Tejas':       { '1A': 0,  '2A': 0,  '3A': 0,   'SL': 0,   'CC': 390, 'EC': 98, 'GS': 0 },
  'Humsafar':    { '1A': 0,  '2A': 0,  '3A': 216, 'SL': 0,   'CC': 0,   'EC': 0,  'GS': 0 },
  'Garib Rath':  { '1A': 0,  '2A': 0,  '3A': 216, 'SL': 0,   'CC': 0,   'EC': 0,  'GS': 72 },
  'Sachkhand':   { '1A': 24, '2A': 52, '3A': 144, 'SL': 72,  'CC': 0,   'EC': 0,  'GS': 72 },
  'Superfast':   { '1A': 24, '2A': 52, '3A': 144, 'SL': 288, 'CC': 0,   'EC': 0,  'GS': 216 },
  'Express':     { '1A': 24, '2A': 52, '3A': 144, 'SL': 288, 'CC': 0,   'EC': 0,  'GS': 216 },
  'Mail':        { '1A': 24, '2A': 52, '3A': 144, 'SL': 288, 'CC': 0,   'EC': 0,  'GS': 216 },
  'Passenger':   { '1A': 0,  '2A': 0,  '3A': 0,   'SL': 288, 'CC': 0,   'EC': 0,  'GS': 432 },
  'Local':       { '1A': 0,  '2A': 0,  '3A': 0,   'SL': 0,   'CC': 0,   'EC': 0,  'GS': 999 },
};
const DEFAULT_CONFIG = { '1A': 24, '2A': 52, '3A': 144, 'SL': 288, 'CC': 78, 'EC': 52, 'GS': 216 };

// ── In-memory inventory store ───────────────────────────────────────────────
// Structure: inventory.get(trainNo).get(travelClass).get(travelDate) = InventorySlot
const inventory = new Map();

// ── In-memory reservation holds (2-phase commit staging) ───────────────────
// reservationHolds.get(lockId) = { trainNo, travelClass, travelDate, count, expiresAt, confirmed }
const reservationHolds = new Map();

const RAC_LIMIT_PER_CLASS = 10;

// ── Per-train mutex queue (OS-style semaphore via Promise chaining) ─────────
const mutexQueues = new Map();

const acquireMutex = async (trainNo) => {
  const existing = mutexQueues.get(trainNo) || Promise.resolve();
  let releaseFn;
  const nextLock = new Promise(resolve => { releaseFn = resolve; });
  mutexQueues.set(trainNo, existing.then(() => nextLock));
  await existing;
  return releaseFn;
};

// ── Initialize inventory from trains dataset ────────────────────────────────
const TRAINS_JSON = path.join(__dirname, '../../dataset/trains.json');

const initInventory = () => {
  let trains = [];
  try {
    if (fs.existsSync(TRAINS_JSON)) {
      trains = JSON.parse(fs.readFileSync(TRAINS_JSON, 'utf8'));
    }
  } catch (e) {
    console.warn('[SeatInventory] Could not load trains.json, using empty inventory');
  }

  const today = new Date();
  const dates = [];
  for (let d = 0; d < 60; d++) {
    const dt = new Date(today);
    dt.setDate(today.getDate() + d);
    dates.push(dt.toISOString().split('T')[0]);
  }

  for (const train of trains) {
    const trainNo = String(train.trainNo || train.number || '');
    if (!trainNo) continue;
    const config = SEAT_CONFIG[train.trainType] || DEFAULT_CONFIG;
    const trainMap = new Map();

    for (const [cls, total] of Object.entries(config)) {
      if (!total) continue;
      const clsMap = new Map();
      for (const date of dates) {
        // Real-world inventory: Starts with zero booked seats; only tickets actually
        // booked by passengers using this website will increment booked and decrement available
        clsMap.set(date, {
          total,
          booked: 0,
          reserved: 0, // holds pending 2-phase commit
          available: total,
          waitlisted: 0,
        });
      }
      trainMap.set(cls, clsMap);
    }
    inventory.set(trainNo, trainMap);
  }

  console.log(`[SeatInventory] Initialized ${trains.length} trains across 60 dates`);
};

// Initialize on module load
try { initInventory(); } catch(e) { console.error('[SeatInventory] Init error:', e.message); }

// ── Auto-expire stale reservation holds (background cleanup) ───────────────
setInterval(() => {
  const now = Date.now();
  for (const [lockId, hold] of reservationHolds.entries()) {
    if (!hold.confirmed && now > hold.expiresAt) {
      // TTL expired — roll back: release reserved seats back to available
      _applyReservation(hold.trainNo, hold.travelClass, hold.travelDate, -hold.count);
      reservationHolds.delete(lockId);
    }
  }
}, 30 * 1000); // run every 30 seconds

// ── Internal: increment/decrement counts atomically ────────────────────────
const _getOrCreateSlot = (trainNo, travelClass, travelDate) => {
  const tn = String(trainNo);
  const cls = (travelClass || '3A').toUpperCase();
  if (!inventory.has(tn)) inventory.set(tn, new Map());
  const trainMap = inventory.get(tn);
  if (!trainMap.has(cls)) trainMap.set(cls, new Map());
  const clsMap = trainMap.get(cls);
  if (!clsMap.has(travelDate)) {
    const config = DEFAULT_CONFIG;
    const total = config[cls] || 72;
    const booked = Math.floor(total * 0.5);
    clsMap.set(travelDate, { total, booked, reserved: 0, available: total - booked, waitlisted: 0 });
  }
  return clsMap.get(travelDate);
};

const _applyReservation = (trainNo, travelClass, travelDate, delta) => {
  const slot = _getOrCreateSlot(trainNo, travelClass, travelDate);
  slot.reserved = Math.max(0, slot.reserved + delta);
  slot.available = Math.max(0, slot.total - slot.booked - slot.reserved);
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Reserve seats (Phase 1 of 2-phase commit).
 * Uses mutex to prevent double-booking in concurrent requests.
 */
const reserveSeat = async (trainNo, travelClass, travelDate, count, lockId) => {
  const release = await acquireMutex(String(trainNo));
  try {
    const slot = _getOrCreateSlot(trainNo, travelClass, travelDate);
    const requested = Math.max(1, count);

    // Check if existing hold for this lockId (idempotent)
    if (lockId && reservationHolds.has(lockId)) {
      return {
        success: true,
        allocationStatus: 'Confirmed',
        reservationId: lockId,
        available: slot.available,
        occupancyRate: getOccupancyRate(trainNo, travelClass, travelDate),
        alreadyHeld: true
      };
    }

    if (slot.available >= requested) {
      slot.reserved += requested;
      slot.available = Math.max(0, slot.total - slot.booked - slot.reserved);

      const holdId = lockId || require('crypto').randomUUID();
      reservationHolds.set(holdId, {
        trainNo: String(trainNo),
        travelClass: travelClass.toUpperCase(),
        travelDate,
        count: requested,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5-min TTL matches fare lock
        confirmed: false
      });

      return {
        success: true,
        allocationStatus: 'Confirmed',
        reservationId: holdId,
        available: slot.available,
        seatsTotal: slot.total,
        occupancyRate: getOccupancyRate(trainNo, travelClass, travelDate)
      };
    } else {
      // Keep a bounded RAC queue before accepting regular waitlist requests.
      const racUsed = slot.rac || 0;
      if (racUsed + requested <= RAC_LIMIT_PER_CLASS) {
        slot.rac = racUsed + requested;
        return {
          success: true,
          allocationStatus: 'RAC',
          racPosition: racUsed + 1,
          available: 0,
          seatsTotal: slot.total,
          occupancyRate: 1.0
        };
      }

      slot.waitlisted += requested;
      return {
        success: true,
        allocationStatus: 'Waitlisted',
        waitlisted: true,
        waitlistPosition: slot.waitlisted,
        available: 0,
        seatsTotal: slot.total,
        occupancyRate: 1.0
      };
    }
  } finally {
    release();
  }
};

/**
 * Confirm reservation (Phase 2 commit — after successful payment).
 */
const confirmReservation = async (lockId) => {
  const hold = reservationHolds.get(lockId);
  if (!hold) return { success: false, reason: 'Reservation hold not found or expired' };
  if (hold.confirmed) return { success: true, alreadyConfirmed: true };

  const release = await acquireMutex(hold.trainNo);
  try {
    const slot = _getOrCreateSlot(hold.trainNo, hold.travelClass, hold.travelDate);
    // Move from reserved -> booked
    slot.reserved = Math.max(0, slot.reserved - hold.count);
    slot.booked = Math.min(slot.total, slot.booked + hold.count);
    slot.available = Math.max(0, slot.total - slot.booked - slot.reserved);
    hold.confirmed = true;
    // Clean up hold after brief delay
    setTimeout(() => reservationHolds.delete(lockId), 60 * 1000);
    return { success: true, booked: slot.booked, available: slot.available };
  } finally {
    release();
  }
};

/**
 * Release reservation (rollback — payment failed or cancellation).
 */
const releaseReservation = async (lockId) => {
  const hold = reservationHolds.get(lockId);
  if (!hold || hold.confirmed) return { success: false };
  const release = await acquireMutex(hold.trainNo);
  try {
    _applyReservation(hold.trainNo, hold.travelClass, hold.travelDate, -hold.count);
    reservationHolds.delete(lockId);
    return { success: true };
  } finally {
    release();
  }
};

const releaseBookedSeat = async (trainNo, travelClass, travelDate, count = 1) => {
  const release = await acquireMutex(String(trainNo));
  try {
    const slot = _getOrCreateSlot(trainNo, travelClass, travelDate);
    const released = Math.min(Math.max(1, count), slot.booked);
    slot.booked -= released;
    slot.available = Math.max(0, slot.total - slot.booked - slot.reserved);
    return { success: true, released, ...getSeatStats(trainNo, travelClass, travelDate) };
  } finally {
    release();
  }
};

const releaseRacSeat = async (trainNo, travelClass, travelDate, count = 1) => {
  const release = await acquireMutex(String(trainNo));
  try {
    const slot = _getOrCreateSlot(trainNo, travelClass, travelDate);
    const released = Math.min(Math.max(1, count), slot.rac || 0);
    slot.rac = Math.max(0, (slot.rac || 0) - released);
    return { success: true, released, ...getSeatStats(trainNo, travelClass, travelDate) };
  } finally {
    release();
  }
};

/**
 * Get current occupancy rate (0.0 to 1.0) for dynamic pricing surge.
 */
const getOccupancyRate = (trainNo, travelClass, travelDate) => {
  try {
    const slot = _getOrCreateSlot(trainNo, travelClass, travelDate);
    if (!slot.total) return 0.5;
    return Math.min(1.0, (slot.booked + slot.reserved) / slot.total);
  } catch (e) {
    return 0.65; // safe fallback
  }
};

/**
 * Get full seat statistics snapshot.
 */
const getSeatStats = (trainNo, travelClass, travelDate) => {
  const slot = _getOrCreateSlot(trainNo, travelClass, travelDate);
  const occupancyRate = getOccupancyRate(trainNo, travelClass, travelDate);
  return {
    ...slot,
    occupancyRate,
    occupancyPercentage: Math.round(occupancyRate * 100),
    status: slot.available > 0 ? 'Available' : slot.waitlisted > 0 ? 'Waitlisted' : 'Fully Booked'
  };
};

/**
 * Get inventory for a specific train (all classes, one date).
 */
const getInventory = (trainNo, travelClass, travelDate) => {
  return getSeatStats(trainNo, travelClass, travelDate);
};

module.exports = {
  reserveSeat,
  confirmReservation,
  releaseReservation,
  releaseBookedSeat,
  releaseRacSeat,
  getOccupancyRate,
  getSeatStats,
  getInventory,
  inventory
};
