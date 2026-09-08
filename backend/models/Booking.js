const mongoose = require('mongoose');

const passengerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  age: { type: Number, required: true },
  gender: { type: String, required: true }, // M, F, O
  berthPreference: { type: String, default: 'No Preference' },
  berthType: { type: String, default: 'Lower' },
  seatNo: { type: String, default: 'TBD' }
}, { _id: false });

const bookingSchema = new mongoose.Schema({
  pnr: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userEmail: { type: String, required: true },
  passcodeHash: { type: String, required: true }, // bcrypt hashed 4-digit passcode for ticket security
  trainNo: { type: String, required: true },
  trainName: { type: String, required: true },
  fromStation: { type: String, required: true },
  toStation: { type: String, required: true },
  travelDate: { type: String, required: true },
  travelClass: { type: String, required: true }, // 1A, 2A, 3A, SL, CC
  coachPosition: { type: String, default: 'B-1' },
  passengers: [passengerSchema],
  foodSelection: {
    mealCategory: { type: String, default: 'No Meal' }, // Veg, Non-Veg, Jain, Continental
    mealType: { type: String, default: 'None' }, // Indian / Continental
    mealPrice: { type: Number, default: 0 }
  },
  couponCode: { type: String, default: '' },
  discountAmount: { type: Number, default: 0 },
  baseFare: { type: Number, required: true },
  dynamicFare: { type: Number, required: true },
  finalFare: { type: Number, required: true },
  paymentDetails: {
    gateway: { type: String, default: 'PhonePe' }, // PhonePe, Paytm, UPI
    transactionId: { type: String, required: true },
    status: { type: String, default: 'SUCCESS' },
    paidAt: { type: Date, default: Date.now }
  },
  status: { type: String, enum: ['Confirmed', 'RAC', 'Waitlisted', 'Cancelled', 'Transferred'], default: 'Confirmed' },
  waitlistPosition: { type: Number, default: 0 },
  confirmationProbability: { type: Number, default: 100 }, // %
  explanationReason: { type: String, default: '' },
  transferredFromPnr: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Booking', bookingSchema);