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
  validUntil: { type: Date, default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const inMemoryCoupons = [
  {
    _id: 'cpn_1',
    code: 'ELITE50',
    discountType: 'flat',
    discountValue: 50,
    couponType: 'food',
    targetTier: 'elite',
    description: 'Exclusive ₹50 Meal Voucher for Elite Passengers',
    minFare: 100,
    maxDiscount: 50,
    validUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    isActive: true,
    createdAt: new Date()
  },
  {
    _id: 'cpn_2',
    code: 'ROYAL15',
    discountType: 'percentage',
    discountValue: 15,
    couponType: 'food',
    targetTier: 'elite',
    description: '15% Off Onboard Gourmet Meals for Premium Travellers',
    minFare: 200,
    maxDiscount: 150,
    validUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    isActive: true,
    createdAt: new Date()
  }
];

let CouponModel;
try {
  CouponModel = mongoose.model('Coupon', couponSchema);
} catch (e) {
  CouponModel = mongoose.models.Coupon;
}

module.exports = { Coupon: CouponModel, inMemoryCoupons };
