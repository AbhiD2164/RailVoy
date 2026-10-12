const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address']
  },
  passwordHash: {
    type: String,
    required: true
    // Hashed with bcrypt (saltRounds: 10) — never stored in plaintext
  },
  mobileNumber: {
    type: String,
    default: '',
    trim: true,
    match: [/^(\+91)?[6-9]\d{9}$|^$/, 'Mobile number must be a valid 10-digit Indian number']
  },
  mobileVerified: { type: Boolean, default: false },
  emailVerified:  { type: Boolean, default: false },
  role: {
    type: String,
    enum: ['passenger', 'admin'],
    default: 'passenger'
  },
  isVerified: { type: Boolean, default: false }, // overall account verification
  otp:        { type: String, select: false },
  otpExpires: { type: Date,   select: false },
  mobileOtp:        { type: String, select: false },
  mobileOtpExpires: { type: Date,   select: false },
  googleId: { type: String, default: '' },
  avatar:   { type: String, default: '' },

  // Banking — 16-digit numeric account number (mandatory real-world format)
  bankAccountNo: {
    type: String,
    unique: true,
    sparse: true,
    validate: {
      validator: function(v) {
        return !v || /^\d{16}$/.test(v);
      },
      message: 'Bank account number must be exactly 16 digits'
    }
  },
  bankName:    { type: String, default: 'State Bank of India' },
  bankIfscCode:{ type: String, default: '' },
  bankBalance: { type: Number, default: 75000 }, // internal only — NEVER exposed to frontend

  // Railway & External App Integration Scope
  railwayUserId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  paymentAppId: {
    type: String,
    default: '',
    trim: true
  },
  externalAppProvider: {
    type: String,
    enum: ['RAILVOY_DIRECT', 'IRCTC_APP', 'RAIL_PAY', 'GOOGLE_SSO', 'EXTERNAL_PARTNER'],
    default: 'RAILVOY_DIRECT'
  },
  contactEmail: {
    type: String,
    default: '',
    trim: true
  },

  passwordResetToken:   { type: String, select: false },
  passwordResetExpires: { type: Date,   select: false },

  createdAt: { type: Date, default: Date.now }
});

// Virtual: mask account number for safe display (last 4 digits only)
userSchema.virtual('maskedAccountNo').get(function() {
  if (!this.bankAccountNo) return '';
  return '*'.repeat(12) + this.bankAccountNo.slice(-4);
});

// Instance method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
