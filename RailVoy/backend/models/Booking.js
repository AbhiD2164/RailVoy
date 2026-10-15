const mongoose = require('mongoose');

const passengerSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  age:            { type: Number, required: true },
  gender:         { type: String, required: true, enum: ['M', 'F', 'O'] },
  berthPreference:{ type: String, default: 'No Preference' },
  berthType:      { type: String, default: 'Lower' },
  seatNo:         { type: String, default: 'TBD' }
}, { _id: false });

const bookingSchema = new mongoose.Schema({
  pnr:         { type: String, required: true, unique: true, index: true },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userEmail:   { type: String, required: true, index: true },
  contactEmail:{ type: String, default: '' },
  passcodeHash:{ type: String, required: true }, // bcrypt-hashed 4-digit security passcode

  trainNo:    { type: String, required: true },
  trainName:  { type: String, required: true },
  fromStation:{ type: String, required: true },
  toStation:  { type: String, required: true },
  travelDate: { type: String, required: true }, // "YYYY-MM-DD"
  travelClass:{ type: String, required: true },
  quota:      { type: String, default: 'GENERAL' },
  coachPosition:{ type: String, default: '' },  // e.g. "B-1", "S-2"

  passengers: [passengerSchema],

  // Meal details — meal charges = 0 if pantry not available OR outside meal hours
  foodSelection: {
    mealCategory: { type: String, default: 'No Meal' }, // Veg, Non-Veg, Jain, Continental, No Meal
    mealType:     { type: String, default: 'None' },
    mealPrice:    { type: Number, default: 0 }
  },
  mealEligible:      { type: Boolean, default: false }, // was journey within meal hours?
  mealChargesApplied:{ type: Boolean, default: false }, // were charges actually added?

  // Fare — LOCKED at quote time, never overridable by client
  fareLockToken: { type: String, default: '' }, // UUID token used to lock fare
  lockedFare:    { type: Number, required: true }, // the fare that was locked and displayed
  baseFare:      { type: Number, required: true },
  dynamicFare:   { type: Number, required: true },
  finalFare:     { type: Number, required: true }, // = lockedFare — what was printed on ticket

  couponCode:    { type: String, default: '' },
  discountAmount:{ type: Number, default: 0 },

  paymentDetails: {
    gateway:      { type: String, default: 'RailVoy Direct Bank Pay' },
    transactionId:{ type: String, required: true },
    bankName:     { type: String, default: '' }, // bank name shown at payment — not account/balance
    status:       { type: String, default: 'SUCCESS' },
    paidAt:       { type: Date,   default: Date.now }
  },

  status:                 { type: String, enum: ['Confirmed', 'RAC', 'Waitlisted', 'Cancelled', 'Transferred', 'Pending'], default: 'Confirmed' },
  waitlistPosition:       { type: Number, default: 0 },
  confirmationProbability:{ type: Number, default: 100 },
  explanationReason:      { type: String, default: '' },

  // Transfer tracking
  transferredFromPnr:{ type: String, default: null },
  transferFareDiff:  { type: Number, default: 0 },  // positive = user paid more; negative = refund due
  adminRefundPending:{ type: Number, default: 0 },   // amount railways owes user (admin settles this)

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Booking', bookingSchema);