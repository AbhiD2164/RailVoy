const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  phone: { type: String, default: '' },
  role: { type: String, enum: ['passenger', 'admin'], default: 'passenger' },
  isVerified: { type: Boolean, default: false },
  otp: { type: String },
  otpExpires: { type: Date },
  googleId: { type: String },
  avatar: { type: String, default: '' },
  bankAccountNo: { type: String, unique: true, sparse: true },
  bankName: { type: String, default: 'State Bank of India' },
  bankBalance: { type: Number, default: 50000 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
