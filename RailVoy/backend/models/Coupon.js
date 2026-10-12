const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  discountType: { type: String, enum: ['flat', 'percentage'], default: 'flat' },
  discountValue: { type: Number, required: true },
  couponType: { type: String, enum: ['food', 'ticket', 'all'], default: 'food' },
  targetTier: { type: String, enum: ['elite', 'general'], default: 'elite' },
  description: { type: String, default: '' },
  minFare: { type: Number, default: 0 },
  maxDiscount: { type: Number, default: 500 },
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// ZERO default coupons. All meal coupons must be explicitly created by the Administrator for specified validity windows.
const inMemoryCoupons = [];

let CouponModel;
try {
  CouponModel = mongoose.model('Coupon', couponSchema);
} catch (e) {
  CouponModel = mongoose.models.Coupon;
}

module.exports = { Coupon: CouponModel, inMemoryCoupons };
