import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { X, UserPlus, Trash2, Utensils, Tag, CreditCard, ShieldCheck, Clock, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import axios from 'axios';
import { TrainSearchResult, Passenger } from '../types';


interface BookingModalProps {
  train: TrainSearchResult | null;
  isOpen: boolean;
  onClose: () => void;
  onProceedToPayment: (bookingData: any) => void;
  userEmail: string;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  train, isOpen, onClose, onProceedToPayment, userEmail
}) => {
  // Derive class from the selected train
  const travelClass = useMemo(() => (train as any)?.travelClass?.toUpperCase() || '3A', [train]);
  const isGS = travelClass === 'GS';
  const isChairCar = ['CC', 'EC'].includes(travelClass);
  const is1A = travelClass === '1A';

  // Berth/seat preference options per class
  const berthOptions = useMemo(() => {
    if (isGS) return [{ value: 'No Preference', label: 'N/A (General)' }];
    if (is1A) return [
      { value: 'Lower', label: 'Lower' }, { value: 'Upper', label: 'Upper' }, { value: 'No Preference', label: 'No Preference' }
    ];
    if (travelClass === '2A') return [
      { value: 'Lower', label: 'Lower' }, { value: 'Upper', label: 'Upper' },
      { value: 'Side Lower', label: 'Side Lower' }, { value: 'Side Upper', label: 'Side Upper' },
      { value: 'No Preference', label: 'No Preference' }
    ];
    if (['3A', '3E', 'SL'].includes(travelClass)) return [
      { value: 'Lower', label: 'Lower' }, { value: 'Middle', label: 'Middle' }, { value: 'Upper', label: 'Upper' },
      { value: 'Side Lower', label: 'Side Lower' }, { value: 'Side Upper', label: 'Side Upper' },
      { value: 'No Preference', label: 'No Preference' }
    ];
    if (isChairCar) return [
      { value: 'Window', label: 'Window' }, { value: 'Aisle', label: 'Aisle' },
      { value: 'Middle', label: 'Middle' }, { value: 'No Preference', label: 'No Preference' }
    ];
    // Default
    return [{ value: 'No Preference', label: 'No Preference' }];
  }, [travelClass, isGS, is1A, isChairCar]);

  const [passengers, setPassengers] = useState<Passenger[]>([
    { name: '', age: 28, gender: 'M', berthPreference: berthOptions[0]?.value || 'Lower' }
  ]);

  const [mealCategory, setMealCategory] = useState<'No Meal' | 'Veg' | 'Non-Veg' | 'Jain' | 'Continental'>('Veg');
  const [mealType, setMealType] = useState('Indian');
  const [couponCode, setCouponCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [couponAppliedMsg, setCouponAppliedMsg] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [formError, setFormError] = useState('');


  // Check if journey overlaps with standard onboard meal windows (7-10 AM, 12-2 PM, 7-9 PM)
  const mealWindowEligibility = useMemo(() => {
    if (!train) return { isEligible: true, activeWindows: ['Meal Service'] };
    
    const parseMinutes = (timeStr: string) => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(n => parseInt(n, 10) || 0);
      return h * 60 + m;
    };

    const depMinutes = parseMinutes(train.departureTime || '08:00');
    let arrMinutes = parseMinutes(train.arrivalTime || '18:00');
    if (arrMinutes <= depMinutes) arrMinutes += 24 * 60;

    const windows = [
      { name: 'Breakfast (7-10 AM)', start: 7 * 60, end: 10 * 60 },
      { name: 'Lunch (12-2 PM)', start: 12 * 60, end: 14 * 60 },
      { name: 'Dinner (7-9 PM)', start: 19 * 60, end: 21 * 60 },
      { name: 'Breakfast (Next Day)', start: (24 + 7) * 60, end: (24 + 10) * 60 },
      { name: 'Lunch (Next Day)', start: (24 + 12) * 60, end: (24 + 14) * 60 },
      { name: 'Dinner (Next Day)', start: (24 + 19) * 60, end: (24 + 21) * 60 }
    ];

    const active = windows
      .filter(w => Math.max(w.start, depMinutes) < Math.min(w.end, arrMinutes))
      .map(w => w.name);

    return {
      isEligible: active.length > 0,
      activeWindows: active
    };
  }, [train]);

  if (!isOpen || !train) return null;

  const handleAddPassenger = () => {
    if (passengers.length < 4) {
      setPassengers([...passengers, { name: '', age: 25, gender: 'M', berthPreference: 'No Preference' }]);
    }
  };

  const handleRemovePassenger = (index: number) => {
    if (passengers.length > 1) {
      setPassengers(passengers.filter((_, idx) => idx !== index));
    }
  };

  const handleApplyCoupon = useCallback(async () => {
    setCouponError('');
    setCouponAppliedMsg('');
    const code = couponCode.trim().toUpperCase();
    if (!code) { setCouponError('Please enter a coupon code'); return; }
    if (isGS) { setCouponError('Coupons are not applicable on General (GS) class tickets.'); return; }
    if (!train) return;

    setCouponLoading(true);
    try {
      const res = await axios.post('/api/bookings/quote', {
        trainNo: train.trainNo,
        trainType: (train as any).trainType || 'Superfast',
        travelClass,
        distanceKm: (train as any).distanceKm || 450,
        travelDate: (train as any).travelDate || new Date().toISOString().split('T')[0],
        mealCategory: mealWindowEligibility.isEligible ? mealCategory : 'No Meal',
        couponCode: code,
        passengerCount: passengers.length,
        departureTime: train.departureTime,
        arrivalTime: train.arrivalTime,
      });
      const { discountAmount: disc, couponValid, couponMessage } = res.data;
      if (couponValid) {
        setDiscountAmount(disc);
        setCouponAppliedMsg(couponMessage || `Coupon ${code} applied! ₹${disc} discount.`);
      } else {
        setDiscountAmount(0);
        setCouponError(couponMessage || 'Invalid or expired coupon code.');
      }
    } catch (err: any) {
      // Fallback local validation if backend unavailable
      const localDiscounts: Record<string, number> = { RAILVOY50: 50, RAIL100: 100, MEAL50: 50 };
      if (localDiscounts[code]) {
        setDiscountAmount(localDiscounts[code]);
        setCouponAppliedMsg(`Coupon ${code} applied! ₹${localDiscounts[code]} discount.`);
      } else {
        setDiscountAmount(0);
        setCouponError(err.response?.data?.message || 'Invalid coupon code.');
      }
    } finally {
      setCouponLoading(false);
    }
  }, [couponCode, isGS, train, travelClass, mealCategory, mealWindowEligibility.isEligible, passengers.length]);

  const isHolyTrain = useMemo(() => {
    return `${train?.trainType} ${train?.trainName}`.toLowerCase().includes('sachkhand');
  }, [train]);

  const isBudgetTrain = useMemo(() => {
    return `${train?.trainType} ${train?.trainName}`.toLowerCase().includes('garib');
  }, [train]);

  const isLuxuryTrain = useMemo(() => {
    const s = `${train?.trainType} ${train?.trainName}`.toLowerCase();
    return ['rajdhani', 'shatabdi', 'duronto', 'vande', 'tejas'].some(k => s.includes(k));
  }, [train]);

  // Helper for meal pricing per train type & category
  const getMealPrice = useCallback((category: string) => {
    if (isGS || category === 'No Meal') return 0;
    if (isLuxuryTrain) {
      if (category === 'Veg' || category === 'Jain') return 260;
      if (category === 'Non-Veg') return 310;
      if (category === 'Continental') return 350;
      return 260;
    }
    if (isHolyTrain) {
      return 65;
    }
    if (isBudgetTrain) {
      if (category === 'Veg' || category === 'Jain') return 60;
      if (category === 'Non-Veg') return 85;
      return 60;
    }
    // Standard Express / Superfast
    if (category === 'Veg' || category === 'Jain') return 130;
    if (category === 'Non-Veg') return 170;
    if (category === 'Continental') return 210;
    return 130;
  }, [isGS, isLuxuryTrain, isHolyTrain, isBudgetTrain]);

  // Ensure selected meal is valid for holy / budget trains
  useEffect(() => {
    if (isHolyTrain && (mealCategory === 'Non-Veg' || mealCategory === 'Continental')) {
      setMealCategory('Veg');
    } else if (isBudgetTrain && mealCategory === 'Continental') {
      setMealCategory('Veg');
    }
  }, [isHolyTrain, isBudgetTrain, mealCategory]);

  // GS class: no meals, no coupons
  const effectiveMeal = isGS ? 'No Meal' : (mealWindowEligibility.isEligible ? mealCategory : 'No Meal');
  const activeMealPrice = getMealPrice(effectiveMeal);

  // Grand total computed client-side as confirmation (server also recalculates)
  const singlePassengerFare = (train?.fare?.dynamicFare || train?.fare?.finalFare || 0) + activeMealPrice;
  const grandTotal = Math.max(20, (singlePassengerFare * passengers.length) - discountAmount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const invalidPassenger = passengers.find((p) => !p.name?.trim() || Number(p.age) <= 0 || Number(p.age) > 120);
    if (invalidPassenger) {
      setFormError('Each passenger needs a valid name and age between 1 and 120.');
      return;
    }

    if (!userEmail) {
      setFormError('Please sign in before booking a train.');
      return;
    }

    setFormError('');
    onProceedToPayment({
      trainNo: train.trainNo,
      trainName: train.trainName,
      trainType: (train as any).trainType || 'Superfast',
      fromStation: train.fromStation,
      toStation: train.toStation,
      departureTime: train.departureTime,
      arrivalTime: train.arrivalTime,
      travelDate: (train as any).travelDate || new Date().toISOString().split('T')[0],
      travelClass,
      passengers,
      foodSelection: {
        mealCategory: effectiveMeal,
        mealType: isGS ? 'N/A' : mealType,
        mealPrice: activeMealPrice
      },
      couponCode,
      discountAmount,
      grandTotal,
      userEmail: userEmail || ''
    });
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-3xl glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-2xl my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
          <div>
            <h3 className="text-xl font-bold text-slate-100">Passenger Reservation &amp; Travel Plan</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {train.trainName} (#{train.trainNo}) · {train.fromStation} ({train.departureTime}) &rarr; {train.toStation} ({train.arrivalTime})
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-200 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {formError && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {formError}
            </div>
          )}

          {/* Passenger Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Passenger Information</h4>
              {passengers.length < 4 && (
                <button
                  type="button"
                  onClick={handleAddPassenger}
                  className="flex items-center space-x-1 text-xs text-cyan-400 font-semibold hover:underline"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add Passenger</span>
                </button>
              )}
            </div>

            <div className="space-y-3">
              {passengers.map((p, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-4 bg-slate-900/60 rounded-2xl border border-slate-800 items-center">
                  <div className="sm:col-span-4">
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Passenger Name"
                      value={p.name}
                      onChange={e => {
                        const next = [...passengers];
                        next[idx].name = e.target.value;
                        setPassengers(next);
                      }}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Age</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={120}
                      value={p.age}
                      onChange={e => {
                        const next = [...passengers];
                        next[idx].age = parseInt(e.target.value) || 18;
                        setPassengers(next);
                      }}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Gender</label>
                    <select
                      value={p.gender}
                      onChange={e => {
                        const next = [...passengers];
                        next[idx].gender = e.target.value as any;
                        setPassengers(next);
                      }}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="O">Other</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                      {isChairCar ? 'Seat Preference' : 'Berth Preference'}
                    </label>
                    <select
                      value={p.berthPreference}
                      onChange={e => {
                        const next = [...passengers];
                        next[idx].berthPreference = e.target.value;
                        setPassengers(next);
                      }}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                    >
                      {berthOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  {passengers.length > 1 && (
                    <div className="sm:col-span-1 text-center">
                      <button type="button" onClick={() => handleRemovePassenger(idx)} className="p-1.5 text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Onboard Meal Selection — hidden for GS */}
          {isGS ? (
            <div className="p-4 bg-amber-950/20 border border-amber-900/50 rounded-2xl flex items-start space-x-3 text-xs text-amber-300">
              <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <span>Food facility is <strong>not available</strong> on General (GS) class tickets. Pantry cars serve reserved class passengers only.</span>
            </div>
          ) : (
          <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Utensils className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Onboard Catering &amp; Meal Selection
                </h4>
              </div>
              <div className="flex items-center space-x-2">
                {isHolyTrain && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-700">
                    Satvik Langar Catering
                  </span>
                )}
                {isBudgetTrain && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-300 border border-emerald-700">
                    Subsidized Fare Catering
                  </span>
                )}
                {isLuxuryTrain && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 border border-purple-700">
                    Premium Dining Menu
                  </span>
                )}
                <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
                  mealWindowEligibility.isEligible
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {mealWindowEligibility.isEligible ? 'Active Catering Window' : 'Non-Meal Hours'}
                </span>
              </div>
            </div>

            {mealWindowEligibility.isEligible ? (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-400">
                  Your journey ({train.departureTime} &rarr; {train.arrivalTime}) traverses catering slots:{' '}
                  <span className="text-emerald-400 font-medium">{mealWindowEligibility.activeWindows.join(', ')}</span>.
                  {isHolyTrain && (
                    <span className="text-amber-300 block mt-1 font-medium">
                      Note: Sachkhand Express serves pure vegetarian Satvik Langar meals exclusively. Non-Veg and Continental options are not offered.
                    </span>
                  )}
                  {isBudgetTrain && (
                    <span className="text-emerald-400 block mt-1 font-medium">
                      Note: Garib Rath offers subsidized standard meals at budget rates.
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Meal Option {activeMealPrice > 0 && <span className="text-emerald-400 font-mono">(+₹{activeMealPrice}/passenger)</span>}
                    </label>
                    <select value={mealCategory} onChange={e => setMealCategory(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100">
                      <option value="Veg">
                        Pure Vegetarian Meal — ₹{getMealPrice('Veg')}
                      </option>
                      {!isHolyTrain && (
                        <option value="Non-Veg">
                          Non-Vegetarian Meal — ₹{getMealPrice('Non-Veg')}
                        </option>
                      )}
                      <option value="Jain">
                        Jain Meal (No Onion/Garlic) — ₹{getMealPrice('Jain')}
                      </option>
                      {!isHolyTrain && !isBudgetTrain && (
                        <option value="Continental">
                          Continental Gourmet Selection — ₹{getMealPrice('Continental')}
                        </option>
                      )}
                      <option value="No Meal">Opt Out (No Meal) — ₹0</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Cuisine Style</label>
                    <select value={mealType} onChange={e => setMealType(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100">
                      <option value="Indian">{isHolyTrain ? 'Satvik Langar Thali' : 'Regional Indian Thali'}</option>
                      {!isHolyTrain && !isBudgetTrain && <option value="Continental">Continental Lite Meal</option>}
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start space-x-2 text-xs text-slate-400">
                <Clock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <span>This journey runs outside standard meal windows. Pantry car snacks remain available onboard.</span>
              </div>
            )}
          </div>
          )}

          {/* Coupon Code — hidden for GS */}
          {!isGS && (
          <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800">
            <div className="flex items-center space-x-2 mb-2">
              <Tag className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Promotional &amp; Meal Coupons</h4>
            </div>
            <div className="flex space-x-2">
              <input type="text"
                placeholder="Enter coupon code (e.g. RAILVOY50, MEAL50)"
                value={couponCode}
                onChange={e => setCouponCode(e.target.value.toUpperCase())}
                className="flex-1 px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 uppercase font-mono" />
              <button type="button" onClick={handleApplyCoupon} disabled={couponLoading}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl transition-colors disabled:opacity-50">
                {couponLoading ? 'Checking...' : 'Apply'}
              </button>
            </div>
            {couponAppliedMsg && (
              <p className="text-[11px] text-emerald-400 font-medium mt-1.5 flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5" /><span>{couponAppliedMsg}</span>
              </p>
            )}
            {couponError && (
              <p className="text-[11px] text-rose-400 font-medium mt-1.5 flex items-center space-x-1">
                <AlertCircle className="w-3.5 h-3.5" /><span>{couponError}</span>
              </p>
            )}
          </div>
          )}


          {/* Fare Summary & Direct Debit Checkout */}
          <div className="border-t border-slate-800 pt-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-slate-400 font-medium">Passenger Count: {passengers.length}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Floor-protected dynamic fare automatically applied
              </p>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-right">
                <span className="text-xs text-slate-400 font-medium">Total Fare to Pay:</span>
                <div className="text-2xl font-black text-emerald-400">&#8377;{grandTotal.toLocaleString('en-IN')}</div>
              </div>

              <button
                type="submit"
                className="px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-sm rounded-xl shadow-lg shadow-emerald-900/30 flex items-center space-x-2 transition-all"
              >
                <CreditCard className="w-4 h-4" />
                <span>Proceed to Bank Debit</span>
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
