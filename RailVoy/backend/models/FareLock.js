const mongoose = require('mongoose');

/**
 * FareLock — Atomic price-lock mechanism to prevent fare conflicts.
 *
 * Flow:
 *  1. POST /bookings/quote   → creates a FareLock with 5-min TTL
 *  2. POST /bookings/create  → verifyAndConsumeFareLock(token, amount)
 *                              ► if token valid & amount matches lockedFare → proceed
 *                              ► if mismatch → reject with 409 (fare changed)
 *                              ► if expired  → reject with 410 (please re-quote)
 *
 * This guarantees: fare shown to user == fare on ticket == amount debited from bank.
 */
const fareLockSchema = new mongoose.Schema({
  lockToken:   { type: String, required: true, unique: true, index: true },
  trainNo:     { type: String, required: true },
  travelClass: { type: String, required: true },
  travelDate:  { type: String, required: true },
  userEmail:   { type: String, required: true },
  lockedFare:  { type: Number, required: true },
  baseFare:    { type: Number, required: true },
  dynamicFare: { type: Number, required: true },
  mealPrice:   { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  passengerCount: { type: Number, default: 1 },
  used:        { type: Boolean, default: false },
  expiresAt:   { type: Date, required: true, index: { expireAfterSeconds: 0 } } // MongoDB TTL index
}, {
  timestamps: true
});

// In-memory store for fallback mode (when MongoDB not available)
const inMemoryFareLocks = new Map();

const FareLock = mongoose.model('FareLock', fareLockSchema);

module.exports = { FareLock, inMemoryFareLocks };
