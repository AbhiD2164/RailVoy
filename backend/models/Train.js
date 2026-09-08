const mongoose = require('mongoose');

const stopSchema = new mongoose.Schema({
  sequence: Number,
  stationCode: String,
  arrival: String,
  departure: String,
  distanceFromOriginKm: Number,
  nextSegmentId: String,
  haltMinutes: Number
}, { _id: false });

const trainSchema = new mongoose.Schema({
  trainNo: { type: String, required: true, unique: true },
  trainName: { type: String, required: true },
  trainType: { type: String, required: true }, // Superfast, Express, Rajdhani, Shatabdi, Duronto, Mail
  source: { type: String, required: true },
  destination: { type: String, required: true },
  stops: [stopSchema],
  totalSeats: {
    '1A': { type: Number, default: 24 },
    '2A': { type: Number, default: 52 },
    '3A': { type: Number, default: 72 },
    'SL': { type: Number, default: 72 },
    'CC': { type: Number, default: 78 },
    'EC': { type: Number, default: 52 },
    'GS': { type: Number, default: 90 }
  },
  bookedSeats: {
    '1A': { type: Number, default: 6 },
    '2A': { type: Number, default: 14 },
    '3A': { type: Number, default: 28 },
    'SL': { type: Number, default: 35 },
    'CC': { type: Number, default: 22 },
    'EC': { type: Number, default: 10 },
    'GS': { type: Number, default: 40 }
  },
  coachComposition: { type: [String], default: ['ENG', 'GS', 'S1', 'S2', 'B1', 'B2', 'B3', 'AB1', 'A1', 'HA1', 'H1', 'PC', 'GS'] },
  cateringTier: { type: String, enum: ['luxury', 'standard', 'holy', 'budget', 'none'], default: 'standard' },
  currentDelayMinutes: { type: Number, default: 0 },
  status: { type: String, default: 'On Time' } // On Time, Delayed, Cancelled
});

module.exports = mongoose.model('Train', trainSchema);
