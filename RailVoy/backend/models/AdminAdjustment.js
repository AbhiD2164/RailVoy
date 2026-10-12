const mongoose = require('mongoose');

/**
 * AdminAdjustment — Tracks fare differences when a passenger transfers
 * their booking from a delayed train to an alternate train.
 *
 * Admin panel shows:
 *  - "Overdue" rows: user paid more for the new train → railways owes a refund
 *  - "Charge" rows:  new train is cheaper → user paid less than the old fare (credit)
 *
 * Admin can mark each as "settled" after manually processing via the admin panel.
 */
const adminAdjustmentSchema = new mongoose.Schema({
  bookingPnr:   { type: String, required: true, index: true },
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userEmail:    { type: String, required: true },
  userName:     { type: String, default: '' },

  oldTrainNo:   { type: String, required: true },
  oldTrainName: { type: String, default: '' },
  newTrainNo:   { type: String, required: true },
  newTrainName: { type: String, default: '' },

  oldFare:      { type: Number, required: true },
  newFare:      { type: Number, required: true },
  fareDiff:     { type: Number, required: true },  // newFare - oldFare
  // fareDiff > 0 → user paid more for new train → railways owes refund (adminRefundPending)
  // fareDiff < 0 → new train is cheaper → railways collected extra (credit note to user)
  direction:    { type: String, enum: ['refund', 'charge', 'even'], default: 'even' },

  status:    { type: String, enum: ['pending', 'settled'], default: 'pending' },
  settledAt: { type: Date },
  settledBy: { type: String, default: '' }, // admin email who settled

  note: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

// In-memory store for fallback mode
const inMemoryAdjustments = [];

const AdminAdjustment = mongoose.model('AdminAdjustment', adminAdjustmentSchema);

module.exports = { AdminAdjustment, inMemoryAdjustments };
