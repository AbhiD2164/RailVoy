const mongoose = require('mongoose');

// Individual stop on a train's route
const stopSchema = new mongoose.Schema({
  sequence:             { type: Number, required: true },
  stationCode:          { type: String, required: true },
  arrival:              { type: String, default: '' },   // "HH:MM"
  departure:            { type: String, default: '' },   // "HH:MM"
  distanceFromOriginKm: { type: Number, default: 0 },
  haltMinutes:          { type: Number, default: 0 },
  platformNo:           { type: Number, default: 1 }
}, { _id: false });

// Coach position descriptor — position in the train's rake
const coachSchema = new mongoose.Schema({
  code:        { type: String, required: true },   // e.g. "B1", "S2", "A1", "PC", "ENG"
  type:        { type: String, default: 'GS' },    // 1A, 2A, 3A, SL, CC, EC, GS, PC, ENG
  position:    { type: Number, required: true },   // sequential position from engine (1-based)
  seats:       { type: Number, default: 0 },       // 0 for PC/ENG
  coachNumber: { type: Number, default: 1 },       // the numeric suffix on the coach code
  farePerPassenger: { type: Number, default: 0, min: 0 }
}, { _id: false });

const trainSchema = new mongoose.Schema({
  trainNo:   { type: String, required: true, unique: true, index: true },
  trainCode: { type: String, index: true },   // alias / alternate code
  trainName: { type: String, required: true },
  trainType: { type: String, required: true },
  // Rajdhani, Shatabdi, Duronto, Superfast, Express, Mail, Vande Bharat, Tejas, Garib Rath, Sachkhand, Passenger, Local
  source:      { type: String, required: true },
  destination: { type: String, required: true },

  // Operating days: 0=Sun … 6=Sat
  runDays: { type: [Number], default: [0,1,2,3,4,5,6] },

  stops: [stopSchema],

  // Seat inventory per class
  totalSeats: {
    '1A': { type: Number, default: 0 },
    '2A': { type: Number, default: 0 },
    '3A': { type: Number, default: 0 },
    'SL': { type: Number, default: 0 },
    'CC': { type: Number, default: 0 },
    'EC': { type: Number, default: 0 },
    'GS': { type: Number, default: 0 }
  },
  bookedSeats: {
    '1A': { type: Number, default: 0 },
    '2A': { type: Number, default: 0 },
    '3A': { type: Number, default: 0 },
    'SL': { type: Number, default: 0 },
    'CC': { type: Number, default: 0 },
    'EC': { type: Number, default: 0 },
    'GS': { type: Number, default: 0 }
  },

  baseFarePerKm:   { type: Number, default: 0.80 },

  // Coach composition (array of coach codes, e.g. ["ENG", "GS", "S1", ...])
  coachComposition: { type: mongoose.Schema.Types.Mixed, default: [] },

  // Catering
  cateringTier:    { type: String, enum: ['luxury', 'standard', 'holy', 'budget', 'none'], default: 'standard' },
  pantryAvailable: { type: Boolean, default: true },  // KEY: if false, NO meal charges applied
  hasPantrycar:    { type: Boolean, default: true },

  // Per-train meal service hour overrides (null = use global defaults)
  mealServiceHours: {
    breakfast: { start: { type: String }, end: { type: String } },
    lunch:     { start: { type: String }, end: { type: String } },
    snacks:    { start: { type: String }, end: { type: String } },
    dinner:    { start: { type: String }, end: { type: String } }
  },

  // Per-train rich catering services configuration
  cateringServices: { type: mongoose.Schema.Types.Mixed, default: null },

  // Live status
  currentDelayMinutes: { type: Number, default: 0 },
  status: { type: String, default: 'On Time' }, // 'On Time' | 'Delayed' | 'Cancelled'

  isActive: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now }
});

// Pre-save: keep trainCode in sync
trainSchema.pre('save', function(next) {
  if (!this.trainCode) this.trainCode = this.trainNo;
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Train', trainSchema);
