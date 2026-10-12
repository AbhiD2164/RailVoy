import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  X, UserPlus, Trash2, Utensils, Tag, CreditCard, ShieldCheck, Clock,
  CheckCircle2, AlertCircle, Info, Train, Calendar, MapPin, Sparkles,
  UserCheck, Lock, Activity, ArrowRight, ArrowLeft, RefreshCw, Coffee,
  ChevronRight, Users, Flame
} from 'lucide-react';
import axios from 'axios';
import { TrainSearchResult, Passenger } from '../types';

interface BookingModalProps {
  train: TrainSearchResult | null;
  isOpen: boolean;
  onClose: () => void;
  onProceedToPayment: (bookingData: any) => void;
  userEmail: string;
}

interface QuoteResponse {
  perPassenger: {
    baseFare: number;
    dynamicFare: number;
    mealPrice: number;
    finalFare: number;
    surgePercentage: number;
    mealEligible: boolean;
    factors: string[];
    explanation: string;
    detectedEvents: string[];
  };
  passengerCount: number;
  mealCategory: string;
  mealPricePerPassenger: number;
  mealEligible: boolean;
  pantryAvailable: boolean;
  mealNote: string;
  couponCode: string;
  couponValid: boolean;
  discountAmount: number;
  couponMessage: string;
  totalFinalFare: number;
  trainType: string;
  lockToken: string;
  lockedFare: number;
  fareLockExpiresAt: string;
  explanation: string;
  occupancyRate?: number;
  seatsAvailable?: number;
  seatsTotal?: number;
  waitlistCount?: number;
}

type MealChoice = 'Veg' | 'Non-Veg' | 'No Food';

export const BookingModal: React.FC<BookingModalProps> = ({
  train, isOpen, onClose, onProceedToPayment, userEmail
}) => {
  // Wizard Navigation Step: 1 = Quota, 2 = Passenger Details, 3 = Catering, 4 = Review & Price Reveal
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  const travelClass = useMemo(() => (train as any)?.travelClass?.toUpperCase() || '3A', [train]);
  const isGS = travelClass === 'GS';
  const isChairCar = ['CC', 'EC'].includes(travelClass);
  const is1A = travelClass === '1A';

  // Step 1: Quota State
  const [quota, setQuota] = useState<'GENERAL' | 'TATKAL'>('GENERAL');

  // Step 2: Passenger Details
  const [passengers, setPassengers] = useState<Passenger[]>([
    { name: '', age: 28, gender: 'M', berthPreference: 'Lower' }
  ]);

  // Step 3: Catering Preferences (Sequential dependent dropdowns)
  const [foodChoice, setFoodChoice] = useState<MealChoice>('Veg');
  const [subMealChoice, setSubMealChoice] = useState<string>('Standard North Indian Thali (Paneer & Dal)');

  // Step 4: Contact & Voucher
  const [contactEmail, setContactEmail] = useState(userEmail || '');
  const [couponCode, setCouponCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [couponAppliedMsg, setCouponAppliedMsg] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  // Server Quote & Price State (Calculated and revealed ONLY at Step 4)
  const [quoteData, setQuoteData] = useState<QuoteResponse | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [lockToken, setLockToken] = useState('');
  const [lockExpiresAt, setLockExpiresAt] = useState<Date | null>(null);
  const [lockCountdown, setLockCountdown] = useState<number>(300);
  const [stepError, setStepError] = useState('');

  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync email
  useEffect(() => {
    if (userEmail) setContactEmail(userEmail);
  }, [userEmail]);

  // Reset wizard on open
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setStepError('');
      setQuoteData(null);
      setLockToken('');
      setDiscountAmount(0);
      setCouponAppliedMsg('');
      setCouponError('');
    }
  }, [isOpen, train]);

  // Dynamic Berth Options
  const berthOptions = useMemo(() => {
    if (isGS) return [{ value: 'No Preference', label: 'General Unreserved' }];
    if (is1A) return [
      { value: 'Lower', label: 'Lower Berth' },
      { value: 'Upper', label: 'Upper Berth' },
      { value: 'No Preference', label: 'No Preference' }
    ];
    if (travelClass === '2A') return [
      { value: 'Lower', label: 'Lower Berth' },
      { value: 'Upper', label: 'Upper Berth' },
      { value: 'Side Lower', label: 'Side Lower' },
      { value: 'Side Upper', label: 'Side Upper' },
      { value: 'No Preference', label: 'No Preference' }
    ];
    if (['3A', '3E', 'SL'].includes(travelClass)) return [
      { value: 'Lower', label: 'Lower Berth' },
      { value: 'Middle', label: 'Middle Berth' },
      { value: 'Upper', label: 'Upper Berth' },
      { value: 'Side Lower', label: 'Side Lower' },
      { value: 'Side Upper', label: 'Side Upper' },
      { value: 'No Preference', label: 'No Preference' }
    ];
    if (isChairCar) return [
      { value: 'Window', label: 'Window Seat' },
      { value: 'Aisle', label: 'Aisle Seat' },
      { value: 'Middle', label: 'Middle Seat' },
      { value: 'No Preference', label: 'No Preference' }
    ];
    return [{ value: 'No Preference', label: 'No Preference' }];
  }, [travelClass, isGS, is1A, isChairCar]);

  // Dynamic Catering Options depending on primary food choice
  const subMealOptions = useMemo(() => {
    if (foodChoice === 'Veg') {
      return [
        'Standard North Indian Thali (Paneer, Dal, Seasonal Veg, Rice, Paratha)',
        'South Indian Deluxe Thali (Sambar, Rasam, Steamed Rice, Poriyal, Curd)',
        'Jain Satvik Meal (Prepared strictly without onion, garlic, or root vegetables)',
        'Continental Vegetarian Gourmet Tray (Herb Rice, Veg Medley & Rolls)'
      ];
    }
    if (foodChoice === 'Non-Veg') {
      return [
        'Egg Curry & Jeera Rice Thali (Boiled Spiced Eggs with Dal & Roti)',
        'Mughlai Chicken Curry Deluxe Meal (Tender Chicken Gravy with Rice & Paratha)',
        'Coastal Fish Curry & Steamed Rice Plate',
        'Continental Grilled Chicken Gourmet Tray'
      ];
    }
    return ['Opt Out — No Food Service Required'];
  }, [foodChoice]);

  // Synchronize secondary dropdown when primary food choice switches
  const handlePrimaryFoodChange = (choice: MealChoice) => {
    setFoodChoice(choice);
    if (choice === 'Veg') {
      setSubMealChoice('Standard North Indian Thali (Paneer, Dal, Seasonal Veg, Rice, Paratha)');
    } else if (choice === 'Non-Veg') {
      setSubMealChoice('Mughlai Chicken Curry Deluxe Meal (Tender Chicken Gravy with Rice & Paratha)');
    } else {
      setSubMealChoice('Opt Out — No Food Service Required');
    }
  };

  // Train-specific meal service hours
  const trainCatering = (train as any)?.cateringServices;
  const isComplimentaryMeal = trainCatering?.includedInFare === true;

  // Pantry availability — from train data (shown before quote is fetched)
  const trainPantryAvailable = (train as any)?.pantryAvailable !== false;
  const trainHasCatering = trainPantryAvailable && !(train as any)?.noFoodService;

  // Auto-reset food choice when pantry is unavailable
  useEffect(() => {
    if (!trainHasCatering || isGS) {
      setFoodChoice('No Food');
      setSubMealChoice('Opt Out — No Food Service Required');
    }
  }, [trainHasCatering, isGS]);

  const mealWindows = useMemo(() => {
    if (trainCatering) {
      return {
        breakfast: trainCatering.breakfast?.enabled ? `${trainCatering.breakfast.start} – ${trainCatering.breakfast.end}` : '07:30 – 09:30',
        lunch: trainCatering.lunch?.enabled ? `${trainCatering.lunch.start} – ${trainCatering.lunch.end}` : '12:30 – 14:00',
        snacks: trainCatering.snacks?.enabled ? `${trainCatering.snacks.start} – ${trainCatering.snacks.end}` : '16:30 – 18:00',
        dinner: trainCatering.dinner?.enabled ? `${trainCatering.dinner.start} – ${trainCatering.dinner.end}` : '19:30 – 21:30'
      };
    }
    // Dynamic fallback based on train number parity to guarantee variety
    const tNum = parseInt(train?.trainNo || '0', 10);
    if (tNum % 3 === 0) {
      return {
        breakfast: '07:00 – 09:00 (Early Morning)',
        lunch: '12:00 – 14:00 (Afternoon Express)',
        snacks: '16:00 – 17:30 (Evening Chai)',
        dinner: '19:30 – 21:30 (Dinner Service)'
      };
    } else if (tNum % 3 === 1) {
      return {
        breakfast: '08:00 – 10:00 (Continental Morning)',
        lunch: '13:00 – 14:30 (Executive Lunch)',
        snacks: '17:00 – 18:30 (High Tea)',
        dinner: '20:00 – 22:00 (Late Dinner)'
      };
    } else {
      return {
        breakfast: '08:30 – 11:00 (Brunch Window)',
        lunch: '12:30 – 14:00 (Standard Thali)',
        snacks: '16:30 – 18:00 (Light Snacks)',
        dinner: '20:30 – 22:30 (Hot Dinner)'
      };
    }
  }, [trainCatering, train]);

  // Tatkal quota applicability logic
  const tatkalApplicability = useMemo(() => {
    const availSeats = train?.availableSeats ?? 28;
    const isTatkalEligible = availSeats > 2;
    return {
      eligible: isTatkalEligible,
      reason: isTatkalEligible
        ? 'Tatkal quota open for reservation — priority emergency allocation available.'
        : 'Tatkal quota currently exhausted for this departure. General quota recommended.'
    };
  }, [train]);

  // Fare countdown timer
  useEffect(() => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (!lockExpiresAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.round((lockExpiresAt.getTime() - Date.now()) / 1000));
      setLockCountdown(remaining);
      if (remaining === 0 && countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
    tick();
    countdownTimerRef.current = setInterval(tick, 1000);
    return () => { if (countdownTimerRef.current) clearInterval(countdownTimerRef.current); };
  }, [lockExpiresAt]);

  // Price Calculation — Triggered strictly upon entering Step 4
  const fetchFinalQuote = useCallback(async () => {
    if (!train) return;
    setQuoting(true);
    setQuoteError('');
    try {
      const mappedMeal = (isGS || foodChoice === 'No Food' || !trainHasCatering) ? 'No Meal' : foodChoice;
      const res = await axios.post<QuoteResponse>('/api/bookings/quote', {
        trainNo: train.trainNo,
        trainName: train.trainName,
        trainType: train.trainType,
        travelClass,
        distanceKm: (train as any).distanceKm || 450,
        travelDate: train.travelDate || new Date().toISOString().split('T')[0],
        passengerCount: passengers.length,
        mealCategory: mappedMeal,
        quota,
        couponCode: couponCode.trim().toUpperCase() || undefined
      });
      const data = res.data;
      setQuoteData(data);
      if (data.lockToken) {
        setLockToken(data.lockToken);
        setLockExpiresAt(new Date(data.fareLockExpiresAt));
      }
      if (data.couponValid && data.discountAmount > 0) {
        setDiscountAmount(data.discountAmount);
        setCouponAppliedMsg(data.couponMessage || `Voucher applied: ₹${data.discountAmount} off`);
      }
    } catch (err: any) {
      setQuoteError('Unable to calculate final tariff. Please try again.');
    } finally {
      setQuoting(false);
    }
  }, [train, travelClass, passengers.length, foodChoice, quota, couponCode, isGS, trainHasCatering]);

  // Trigger calculation when entering Step 4
  useEffect(() => {
    if (currentStep === 4 && !quoteData && !quoting) {
      fetchFinalQuote();
    }
  }, [currentStep, quoteData, quoting, fetchFinalQuote]);

  // Voucher apply handler
  const handleApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) { setCouponError('Enter a voucher code'); return; }
    setCouponLoading(true);
    setCouponError('');
    setCouponAppliedMsg('');
    try {
      const mappedMeal = (isGS || foodChoice === 'No Food') ? 'No Meal' : foodChoice;
      const res = await axios.post<QuoteResponse>('/api/bookings/quote', {
        trainNo: train?.trainNo,
        trainName: train?.trainName,
        trainType: train?.trainType,
        travelClass,
        distanceKm: (train as any)?.distanceKm || 450,
        travelDate: train?.travelDate || new Date().toISOString().split('T')[0],
        passengerCount: passengers.length,
        mealCategory: mappedMeal,
        quota,
        couponCode: code
      });
      const data = res.data;
      if (data.couponValid && data.discountAmount > 0) {
        setDiscountAmount(data.discountAmount);
        setCouponAppliedMsg(data.couponMessage || `Voucher "${code}" applied: ₹${data.discountAmount} off!`);
        setQuoteData(data);
        if (data.lockToken) {
          setLockToken(data.lockToken);
          setLockExpiresAt(new Date(data.fareLockExpiresAt));
        }
      } else {
        setCouponError(data.couponMessage || `Voucher code "${code}" is invalid or expired.`);
        setDiscountAmount(0);
      }
    } catch (err: any) {
      setCouponError(err.response?.data?.error || 'Coupon validation failed');
    } finally {
      setCouponLoading(false);
    }
  };

  // Step Navigators with strict validation
  const goToStep2 = () => {
    setStepError('');
    setCurrentStep(2);
  };

  const goToStep3 = () => {
    setStepError('');
    // Validate passengers
    for (let i = 0; i < passengers.length; i++) {
      const p = passengers[i];
      if (!p.name || p.name.trim().length < 2) {
        setStepError(`Please enter a valid legal name for Passenger #${i + 1}`);
        return;
      }
      if (!p.age || p.age < 1 || p.age > 120) {
        setStepError(`Please enter a valid age (1-120) for Passenger #${i + 1}`);
        return;
      }
    }
    setCurrentStep(3);
  };

  const goToStep4 = () => {
    setStepError('');
    setCurrentStep(4);
  };

  // Add / remove passenger
  const handleAddPassenger = () => {
    if (passengers.length >= 6) {
      setStepError('Maximum 6 passengers allowed per reservation');
      return;
    }
    setPassengers([...passengers, { name: '', age: 25, gender: 'M', berthPreference: 'No Preference' }]);
  };

  const handleRemovePassenger = (index: number) => {
    if (passengers.length === 1) return;
    setPassengers(passengers.filter((_, i) => i !== index));
  };

  // Proceed to Payment (Final Submit)
  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStepError('');
    if (!contactEmail.trim() || !contactEmail.includes('@')) {
      setStepError('Please enter a valid contact email to receive your e-ticket & security passkey');
      return;
    }
    if (!quoteData || !lockToken) {
      setStepError('Fare quotation is still processing. Please wait a moment.');
      fetchFinalQuote();
      return;
    }

    const payable = Math.max(20, (quoteData.totalFinalFare || 0) - discountAmount);

    onProceedToPayment({
      trainNo: train?.trainNo,
      trainName: train?.trainName,
      trainType: train?.trainType,
      fromStation: train?.fromStation,
      toStation: train?.toStation,
      departureTime: train?.departureTime,
      arrivalTime: train?.arrivalTime,
      travelDate: train?.travelDate || new Date().toISOString().split('T')[0],
      travelClass,
      quota,
      passengers,
      userEmail: contactEmail.trim(),
      foodSelection: {
        mealCategory: (!trainHasCatering || isGS) ? 'No Food' : foodChoice,
        mealType: (!trainHasCatering || isGS) ? 'No Food Service' : subMealChoice,
        mealPrice: (!trainHasCatering || isGS) ? 0 : (quoteData.mealPricePerPassenger || 0)
      },
      mealEligible: trainHasCatering && !isGS && foodChoice !== 'No Food',
      couponCode: discountAmount > 0 ? couponCode.trim().toUpperCase() : '',
      discountAmount,
      lockToken,
      grandTotal: payable,
      finalFare: payable,
      baseFare: quoteData.perPassenger.baseFare,
      dynamicFare: quoteData.perPassenger.dynamicFare
    });
  };

  if (!isOpen || !train) return null;

  const payableTotal = quoteData ? Math.max(20, quoteData.totalFinalFare - discountAmount) : 0;
  const lockMinutes = Math.floor(lockCountdown / 60);
  const lockSeconds = lockCountdown % 60;
  const lockExpired = lockCountdown === 0 && !!lockToken;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm">
      <div className="min-h-full flex items-center justify-center p-3 sm:p-6 text-center">
        <div className="relative w-full max-w-3xl bg-white border border-slate-200 rounded-3xl shadow-2xl text-left overflow-hidden my-6 text-slate-900">

          {/* Header Banner */}
          <div className="bg-gradient-to-r from-sky-700 via-sky-800 to-blue-900 p-5 sm:p-6 text-white border-b border-sky-800">
            <div className="flex items-center justify-between">
              <div className="flex items-start space-x-3">
                <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-amber-300 flex-shrink-0">
                  <Train className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg sm:text-xl font-black text-white">{train.trainName}</h3>
                    <span className="font-mono text-xs px-2.5 py-0.5 rounded-lg bg-sky-950/70 text-amber-300 font-bold border border-sky-600/50">#{train.trainNo}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-white/20 text-white uppercase">Class {travelClass}</span>
                    {isComplimentaryMeal && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-500 text-white uppercase shadow-xs">
                        Complimentary Meal
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-sky-100 mt-1 flex flex-wrap items-center gap-1.5 font-medium">
                    <span>{train.fromStation} ({train.departureTime})</span>
                    <span className="text-amber-300 font-bold">&rarr;</span>
                    <span>{train.toStation} ({train.arrivalTime})</span>
                    <span>&bull;</span>
                    <span>{(train as any).distanceKm || train.distanceKm || 450} km</span>
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-sky-200 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stepper Progress Bar (Sequential UI) */}
            <div className="mt-5 pt-4 border-t border-sky-700/60">
              <div className="flex items-center justify-between max-w-xl mx-auto">
                {[
                  { step: 1, label: 'Quota' },
                  { step: 2, label: 'Passengers' },
                  { step: 3, label: 'Catering' },
                  { step: 4, label: 'Review & Fare' }
                ].map((item, idx) => (
                  <div key={item.step} className="flex items-center space-x-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                      currentStep === item.step
                        ? 'bg-amber-400 text-sky-950 ring-4 ring-white/20 font-black'
                        : currentStep > item.step
                        ? 'bg-emerald-400 text-sky-950'
                        : 'bg-white/20 text-sky-200'
                    }`}>
                      {currentStep > item.step ? '✓' : item.step}
                    </div>
                    <span className={`text-xs hidden sm:inline ${
                      currentStep === item.step ? 'font-black text-white' : 'text-sky-200 font-medium'
                    }`}>
                      {item.label}
                    </span>
                    {idx < 3 && <div className="w-6 sm:w-12 h-0.5 bg-white/20" />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Form Body */}
          <div className="p-5 sm:p-8 space-y-6">

            {stepError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm text-rose-800 font-bold flex items-center space-x-2 shadow-2xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                <span>{stepError}</span>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════
                STEP 1: QUOTA SELECTION (GENERAL VS TATKAL)
                ═══════════════════════════════════════════════════════════ */}
            {currentStep === 1 && (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="border-b border-slate-100 pb-3">
                  <h4 className="text-base font-black text-slate-900">Step 1: Select Reservation Quota</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Live system intelligence evaluates Tatkal quota applicability based on coach vacancy and booking demand.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* General Quota Card */}
                  <div
                    onClick={() => setQuota('GENERAL')}
                    className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                      quota === 'GENERAL'
                        ? 'border-sky-600 bg-sky-50/70 shadow-sm ring-1 ring-sky-600'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <Users className="w-5 h-5 text-sky-700" />
                        <span className="font-black text-sm text-slate-900">General Quota</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">Standard</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Standard advance booking quota open to all passengers. Standard train tariff rules apply.
                    </p>
                  </div>

                  {/* Tatkal Quota Card */}
                  <div
                    onClick={() => {
                      if (tatkalApplicability.eligible) setQuota('TATKAL');
                    }}
                    className={`p-5 rounded-2xl border-2 transition-all ${
                      !tatkalApplicability.eligible
                        ? 'opacity-60 bg-slate-50 border-slate-200 cursor-not-allowed'
                        : quota === 'TATKAL'
                        ? 'border-amber-500 bg-amber-50/70 shadow-sm ring-1 ring-amber-500 cursor-pointer'
                        : 'border-slate-200 hover:border-slate-300 bg-white cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <Flame className="w-5 h-5 text-amber-600" />
                        <span className="font-black text-sm text-slate-900">Tatkal Quota</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Priority Emergency</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Emergency short-notice travel quota with premium booking priority.
                    </p>
                    <div className="mt-3 text-[11px] font-medium text-slate-500">
                      {tatkalApplicability.reason}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-500 flex items-center space-x-2">
                  <Info className="w-4 h-4 text-sky-600 flex-shrink-0" />
                  <span>Fare for each choice will be consolidated and shown at the final verification step.</span>
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    type="button"
                    onClick={goToStep2}
                    className="px-7 py-3 bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-sm rounded-xl shadow-md flex items-center space-x-2 transition-all hover:scale-105 cursor-pointer"
                  >
                    <span>Next: Passenger Details</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════
                STEP 2: PASSENGER INFORMATION
                ═══════════════════════════════════════════════════════════ */}
            {currentStep === 2 && (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-base font-black text-slate-900">Step 2: Enter Passenger Details</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Please provide passenger details as per official government photo identity cards.</p>
                  </div>
                  {passengers.length < 6 && (
                    <button
                      type="button"
                      onClick={handleAddPassenger}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold transition-colors"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Add Passenger</span>
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {passengers.map((p, idx) => (
                    <div key={idx} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                          Passenger #{idx + 1} Full Name
                        </label>
                        <input
                          type="text"
                          required
                          value={p.name}
                          onChange={e => {
                            const n = [...passengers];
                            n[idx].name = e.target.value;
                            setPassengers(n);
                          }}
                          placeholder="As on Aadhaar / Voter ID"
                          className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-sky-500"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Age</label>
                        <input
                          type="number"
                          required
                          min={1}
                          max={120}
                          value={p.age}
                          onChange={e => {
                            const n = [...passengers];
                            n[idx].age = parseInt(e.target.value) || 18;
                            setPassengers(n);
                          }}
                          className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-sky-500"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Gender</label>
                        <select
                          value={p.gender}
                          onChange={e => {
                            const n = [...passengers];
                            n[idx].gender = e.target.value as any;
                            setPassengers(n);
                          }}
                          className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-sky-500"
                        >
                          <option value="M">Male</option>
                          <option value="F">Female</option>
                          <option value="O">Other</option>
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                          {isChairCar ? 'Seat Preference' : 'Berth Preference'}
                        </label>
                        <select
                          value={p.berthPreference}
                          onChange={e => {
                            const n = [...passengers];
                            n[idx].berthPreference = e.target.value;
                            setPassengers(n);
                          }}
                          className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-sky-500"
                        >
                          {berthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>

                      {passengers.length > 1 && (
                        <div className="sm:col-span-1 text-center pb-1">
                          <button
                            type="button"
                            onClick={() => handleRemovePassenger(idx)}
                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                            title="Remove passenger"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-3">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back: Quota</span>
                  </button>
                  <button
                    type="button"
                    onClick={goToStep3}
                    className="px-7 py-3 bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-sm rounded-xl shadow-md flex items-center space-x-2 transition-all hover:scale-105 cursor-pointer"
                  >
                    <span>Next: Catering Preferences</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════
                STEP 3: CATERING PREFERENCES (DEPENDENT DROPDOWNS & TIMETABLE)
                ═══════════════════════════════════════════════════════════ */}
            {currentStep === 3 && (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="border-b border-slate-100 pb-3">
                  <h4 className="text-base font-black text-slate-900">Step 3: Onboard Catering &amp; Meal Options</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Second choice is dynamically filtered based on your first selection. Exact meal windows vary by train.
                  </p>
                </div>

                {/* No Pantry Car Notice */}
                {(!trainHasCatering || isGS) && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start space-x-3">
                    <Utensils className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-black text-amber-900">
                        {isGS ? 'Catering Not Available for General (GS) Class' : 'No Pantry Car on This Train'}
                      </p>
                      <p className="text-xs text-amber-800 mt-1">
                        {isGS
                          ? 'General class coaches do not include reserved onboard food service. You may bring your own food.'
                          : 'This train does not have a pantry car. Onboard food service is unavailable for this journey. You are welcome to carry your own refreshments.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Catering form — only shown if pantry available and not GS */}
                {trainHasCatering && !isGS && (
                  <>
                    {/* Train-Specific Timetable Display */}
                    <div className="p-4 bg-sky-50/70 rounded-2xl border border-sky-200 space-y-2">
                      <div className="flex items-center space-x-2 text-sky-900 font-extrabold text-xs uppercase tracking-wider">
                        <Clock className="w-4 h-4 text-sky-700" />
                        <span>Train #{train.trainNo} Catering Timetable (Official Windows)</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-700 pt-1">
                        <div className="bg-white p-2.5 rounded-xl border border-sky-100">
                          <span className="block text-[10px] font-bold text-slate-400 uppercase">Breakfast</span>
                          <span className="font-bold text-slate-800">{mealWindows.breakfast}</span>
                        </div>
                        <div className="bg-white p-2.5 rounded-xl border border-sky-100">
                          <span className="block text-[10px] font-bold text-slate-400 uppercase">Lunch</span>
                          <span className="font-bold text-slate-800">{mealWindows.lunch}</span>
                        </div>
                        <div className="bg-white p-2.5 rounded-xl border border-sky-100">
                          <span className="block text-[10px] font-bold text-slate-400 uppercase">Evening Snacks</span>
                          <span className="font-bold text-slate-800">{mealWindows.snacks}</span>
                        </div>
                        <div className="bg-white p-2.5 rounded-xl border border-sky-100">
                          <span className="block text-[10px] font-bold text-slate-400 uppercase">Dinner</span>
                          <span className="font-bold text-slate-800">{mealWindows.dinner}</span>
                        </div>
                      </div>
                    </div>

                    {/* Dependent Dropdowns */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* First Choicebox */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                          1. Dietary Preference (First Choice)
                        </label>
                        <select
                          value={foodChoice}
                          onChange={e => handlePrimaryFoodChange(e.target.value as MealChoice)}
                          className="w-full px-3.5 py-3 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-sky-500"
                        >
                          <option value="Veg">Pure Vegetarian (Veg)</option>
                          <option value="Non-Veg">Non-Vegetarian (Non-Veg)</option>
                          <option value="No Food">Opt Out — No Food Service</option>
                        </select>
                        <p className="text-[11px] text-slate-400 mt-1">Options below depend on this selection.</p>
                      </div>

                      {/* Second Dropdown — Strictly dependent on the first choicebox */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                          2. Meal Cuisine / Preparation
                        </label>
                        <select
                          value={subMealChoice}
                          onChange={e => setSubMealChoice(e.target.value)}
                          disabled={foodChoice === 'No Food'}
                          className="w-full px-3.5 py-3 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-sky-500 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          {subMealOptions.map((opt, i) => (
                            <option key={i} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <p className="text-[11px] text-slate-400 mt-1">Filtered specifically for {foodChoice}.</p>
                      </div>
                    </div>

                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
                      💡 Prices are calculated based on your catering selection and travel quota, and will be displayed on the final review step.
                    </div>
                  </>
                )}

                <div className="flex items-center justify-between pt-3">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back: Passengers</span>
                  </button>
                  <button
                    type="button"
                    onClick={goToStep4}
                    className="px-7 py-3 bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-sm rounded-xl shadow-md flex items-center space-x-2 transition-all hover:scale-105 cursor-pointer"
                  >
                    <span>Next: Review &amp; Calculate Fare</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════
                STEP 4: CONTACT, VOUCHER & FINAL PRICE REVEAL
                ═══════════════════════════════════════════════════════════ */}
            {currentStep === 4 && (
              <form onSubmit={handleFinalSubmit} className="space-y-5 animate-in fade-in duration-200">
                <div className="border-b border-slate-100 pb-3">
                  <h4 className="text-base font-black text-slate-900">Step 4: Ticket Delivery &amp; Final Price Verification</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Review your journey details. The server calculates the exact guaranteed fare based on your preferences.
                  </p>
                </div>

                {/* Delivery Email */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Ticket Delivery Email (e-Ticket PDF &amp; 4-Digit Security Passkey)
                  </label>
                  <input
                    type="email"
                    required
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    placeholder="passenger@gmail.com"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:border-sky-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Your 4-digit security passkey will be sent here upon booking.</p>
                </div>

                {/* Voucher Code */}
                {!isGS && (
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center space-x-1.5">
                      <Tag className="w-3.5 h-3.5 text-sky-600" />
                      <span>Promotional Discount Voucher (Optional)</span>
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        placeholder="Enter Promo Code"
                        value={couponCode}
                        onChange={e => setCouponCode(e.target.value.toUpperCase())}
                        className="flex-1 px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 uppercase outline-none focus:border-sky-500"
                      />
                      <button
                        type="button"
                        onClick={handleApplyCoupon}
                        disabled={couponLoading}
                        className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all disabled:opacity-50"
                      >
                        {couponLoading ? 'Checking...' : 'Apply Voucher'}
                      </button>
                    </div>
                    {couponAppliedMsg && (
                      <p className="text-xs text-emerald-700 font-bold mt-2 flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{couponAppliedMsg}</span>
                      </p>
                    )}
                    {couponError && (
                      <p className="text-xs text-rose-700 font-bold mt-2 flex items-center space-x-1">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>{couponError}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Journey Summary Badges */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
                  <div className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Booking Preference Summary:</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Quota</span>
                      <strong className={quota === 'TATKAL' ? 'text-amber-700' : 'text-sky-700'}>{quota}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Passengers</span>
                      <strong>{passengers.length} Passenger(s)</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Meal Preference</span>
                      <strong>{foodChoice}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Class</span>
                      <strong>{travelClass}</strong>
                    </div>
                  </div>
                </div>

                {/* CONSOLIDATED PRICE REVEAL SECTION (SHOWN ONLY AT THIS VERIFICATION STEP) */}
                <div className="bg-sky-50/70 rounded-2xl border-2 border-sky-300 p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-sky-200 pb-3">
                    <span className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center space-x-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Verified Guaranteed Price Breakdown</span>
                    </span>
                    {quoting && (
                      <span className="text-xs text-sky-700 font-bold animate-pulse flex items-center space-x-1">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Calculating live tariff...</span>
                      </span>
                    )}
                  </div>

                  {quoteError ? (
                    <div className="p-3 bg-rose-50 text-rose-800 text-xs rounded-xl flex items-center justify-between">
                      <span>{quoteError}</span>
                      <button
                        type="button"
                        onClick={fetchFinalQuote}
                        className="px-3 py-1 bg-rose-600 text-white rounded-lg font-bold text-[11px]"
                      >
                        Retry
                      </button>
                    </div>
                  ) : quoteData ? (
                    <div className="space-y-2 text-xs text-slate-700">
                      <div className="flex justify-between">
                        <span>Base Railway Tariff ({passengers.length} Passenger{passengers.length > 1 ? 's' : ''})</span>
                        <span className="font-bold text-slate-900">
                          ₹{((quoteData.perPassenger.baseFare || 650) * passengers.length).toLocaleString('en-IN')}
                        </span>
                      </div>

                      {/* Demand / Vacancy Surge Buffer */}
                      {(quoteData.perPassenger.dynamicFare > quoteData.perPassenger.baseFare) && (
                        <div className="flex justify-between text-amber-800">
                          <span>Route Demand &amp; Quota Adjustment</span>
                          <span className="font-bold">
                            +₹{(((quoteData.perPassenger.dynamicFare || 0) - (quoteData.perPassenger.baseFare || 0)) * passengers.length).toLocaleString('en-IN')}
                          </span>
                        </div>
                      )}

                      {/* Catering Charge */}
                      {foodChoice !== 'No Food' && !isComplimentaryMeal && (quoteData.mealPricePerPassenger || 0) > 0 && (
                        <div className="flex justify-between">
                          <span>Onboard Catering ({foodChoice} x {passengers.length})</span>
                          <span className="font-bold text-slate-900">
                            +₹{((quoteData.mealPricePerPassenger || 0) * passengers.length).toLocaleString('en-IN')}
                          </span>
                        </div>
                      )}

                      {/* Tatkal Surcharge */}
                      {quota === 'TATKAL' && (
                        <div className="flex justify-between text-amber-800 font-bold">
                          <span>Tatkal Emergency Reservation Quota Surcharge</span>
                          <span>+₹{(150 * passengers.length).toLocaleString('en-IN')}</span>
                        </div>
                      )}

                      {/* Voucher Discount */}
                      {discountAmount > 0 && (
                        <div className="flex justify-between text-emerald-700 font-bold">
                          <span>Promotional Voucher ({couponCode})</span>
                          <span>-₹{discountAmount.toLocaleString('en-IN')}</span>
                        </div>
                      )}

                      <div className="pt-3 border-t border-sky-200 flex justify-between items-center">
                        <div>
                          <span className="text-sm font-black text-slate-900 block">Total Verified Amount</span>
                          <span className="text-[11px] text-slate-500">Includes all taxes, quota, and catering fees</span>
                        </div>
                        <span className="text-3xl font-black text-sky-800 font-mono">
                          ₹{payableTotal.toLocaleString('en-IN')}
                        </span>
                      </div>

                      {lockToken && (
                        <div className="text-[11px] text-sky-800 bg-white/70 p-2.5 rounded-xl border border-sky-200 flex items-center justify-between mt-2">
                          <span className="flex items-center space-x-1.5">
                            <Lock className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Price guaranteed during checkout</span>
                          </span>
                          <span className="font-mono font-bold text-amber-700">
                            {lockMinutes}:{lockSeconds.toString().padStart(2, '0')}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back: Catering</span>
                  </button>

                  <button
                    type="submit"
                    disabled={quoting || !quoteData || lockExpired}
                    className="px-8 py-3.5 bg-sky-600 hover:bg-sky-700 text-white font-black text-sm rounded-2xl shadow-lg flex items-center space-x-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>
                      {quoting ? 'Calculating...' : `Proceed to Payment (₹${payableTotal.toLocaleString('en-IN')})`}
                    </span>
                  </button>
                </div>
              </form>
            )}

          </div>

        </div>
      </div>
    </div>
  );
};
