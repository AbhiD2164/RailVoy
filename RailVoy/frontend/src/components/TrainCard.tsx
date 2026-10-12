import React, { useState } from 'react';
import { Train, ShieldCheck, ChevronRight, Utensils, LayoutGrid } from 'lucide-react';
import { TrainSearchResult } from '../types';

interface TrainCardProps {
  train: TrainSearchResult;
  onSelectSeats: (train: TrainSearchResult) => void;
  onBookNow: (train: TrainSearchResult) => void;
  onShowAIExplanation?: (explanation: string) => void;
}

export const TrainCard: React.FC<TrainCardProps> = ({
  train,
  onSelectSeats,
  onBookNow,
  onShowAIExplanation
}) => {
  const runDays = train.runDays || (train as any).daysOfRun || [0, 1, 2, 3, 4, 5, 6];
  const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // Determine true classes for rake type
  const tType = (train.trainType || '').toLowerCase();
  const tName = (train.trainName || '').toLowerCase();

  const isChairCarOnly = tType.includes('shatabdi') || tName.includes('shatabdi') ||
                         tType.includes('vande') || tName.includes('vande') ||
                         tType.includes('tejas') || tName.includes('tejas');
  const isLuxurySleeper = tType.includes('rajdhani') || tName.includes('rajdhani') ||
                          tType.includes('duronto') || tName.includes('duronto');
  const isGaribRath = tType.includes('garib') || tName.includes('garib');
  const isPassengerOnly = tType.includes('passenger') || tType.includes('local');

  const allClasses = [
    { code: '1A', label: 'First AC', fareMultiplier: 2.13 },
    { code: '2A', label: '2 Tier AC', fareMultiplier: 1.40 },
    { code: '3A', label: '3 Tier AC', fareMultiplier: 1.0 },
    { code: 'SL', label: 'Sleeper', fareMultiplier: 0.40 },
    { code: 'CC', label: 'AC Chair Car', fareMultiplier: 0.73 },
    { code: 'EC', label: 'Executive CC', fareMultiplier: 1.60 },
    { code: 'GS', label: 'General', fareMultiplier: 0.23 }
  ];

  const availableClasses = allClasses.filter(c => {
    if (isChairCarOnly) return c.code === 'CC' || c.code === 'EC';
    if (isLuxurySleeper) return ['1A', '2A', '3A'].includes(c.code);
    if (isGaribRath) return ['3A', 'GS'].includes(c.code);
    if (isPassengerOnly) return ['SL', 'GS'].includes(c.code);
    return ['1A', '2A', '3A', 'SL', 'GS'].includes(c.code);
  });

  const [selectedClass, setSelectedClass] = useState<string>(() => {
    const pref = (train as any).travelClass || '3A';
    return availableClasses.some(c => c.code === pref) ? pref : (availableClasses[0]?.code || '3A');
  });

  const baseFinalFare = train.fare?.finalFare || 950;
  const currentMultiplier = availableClasses.find(c => c.code === selectedClass)?.fareMultiplier || 1.0;
  const computedFare = Math.round(baseFinalFare * currentMultiplier);

  const handleClassClick = (clsCode: string) => {
    setSelectedClass(clsCode);
  };

  const handleBook = () => {
    const updatedTrain: TrainSearchResult = {
      ...train,
      travelClass: selectedClass,
      fare: {
        ...train.fare,
        finalFare: computedFare,
        baseFare: Math.round((train.fare?.baseFare || 650) * currentMultiplier)
      }
    } as any;
    onBookNow(updatedTrain);
  };

  const handleOpenSeatMatrix = () => {
    const updatedTrain: TrainSearchResult = {
      ...train,
      travelClass: selectedClass
    } as any;
    onSelectSeats(updatedTrain);
  };

  // Determine train badge style
  const trainType = train.trainType || 'Superfast';
  const isVandeBharat = trainType.toLowerCase().includes('vande') || (train.trainName || '').toLowerCase().includes('vande');
  const isRajdhani = trainType.toLowerCase().includes('rajdhani') || (train.trainName || '').toLowerCase().includes('rajdhani');
  const isTejas = trainType.toLowerCase().includes('tejas') || (train.trainName || '').toLowerCase().includes('tejas');

  const badgeColor = isVandeBharat 
    ? 'bg-amber-50 text-amber-800 border-amber-300' 
    : isRajdhani 
    ? 'bg-rose-50 text-rose-800 border-rose-300' 
    : isTejas 
    ? 'bg-amber-50 text-amber-800 border-amber-300' 
    : 'bg-sky-50 text-sky-800 border-sky-300';

  return (
    <div className="bg-white border border-slate-200/90 hover:border-sky-300 rounded-3xl shadow-sm hover:shadow-md overflow-hidden transition-all duration-200">
      
      {/* Top Strip: Train info & Days of Run */}
      <div className="bg-slate-50/90 px-5 sm:px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <h3 className="text-base sm:text-lg font-black text-slate-900">{train.trainName}</h3>
            <span className="font-mono text-xs px-2.5 py-0.5 rounded-lg bg-sky-50 text-sky-800 font-bold border border-sky-200">
              #{train.trainNo}
            </span>
          </div>

          <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md border ${badgeColor}`}>
            {trainType}
          </span>

          {train.pantryAvailable !== false && (
            <span className="hidden sm:inline-flex items-center space-x-1 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 font-bold">
              <Utensils className="w-2.5 h-2.5" />
              <span>Pantry</span>
            </span>
          )}
        </div>

        {/* Days of Run indicator */}
        <div className="flex items-center space-x-1.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase mr-1 hidden sm:inline">Runs On:</span>
          {dayNames.map((d, idx) => {
            const runs = runDays.includes(idx);
            return (
              <span
                key={idx}
                className={`w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center ${
                  runs ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-400'
                }`}
                title={runs ? `Runs on day ${idx}` : 'Does not run'}
              >
                {d}
              </span>
            );
          })}
        </div>
      </div>

      {/* Main Train Timetable Row */}
      <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-white">
        
        {/* Departure */}
        <div className="md:col-span-4 text-left">
          <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
            {train.departureTime}
          </span>
          <div className="flex items-center space-x-1.5 mt-0.5">
            <span className="font-bold text-xs text-sky-700 font-mono">{train.fromStation}</span>
            <span className="text-xs text-slate-500 font-medium">&bull; Origin</span>
          </div>
        </div>

        {/* Middle Route & Distance Visualizer */}
        <div className="md:col-span-4 flex flex-col items-center justify-center py-2 md:py-0">
          <span className="text-[11px] font-semibold text-slate-500 font-mono mb-1">
            {train.distanceKm} km
          </span>
          <div className="w-full flex items-center space-x-2 max-w-[200px]">
            <div className="w-2.5 h-2.5 rounded-full bg-sky-600 flex-shrink-0"></div>
            <div className="flex-1 border-t-2 border-dashed border-slate-300 relative">
              <Train className="w-3.5 h-3.5 text-sky-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-0.5" />
            </div>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 flex-shrink-0"></div>
          </div>
          <span className="text-[10px] text-emerald-700 font-bold mt-1 flex items-center space-x-1">
            <ShieldCheck className="w-3 h-3" />
            <span>Direct Daily Express</span>
          </span>
        </div>

        {/* Arrival */}
        <div className="md:col-span-4 text-left md:text-right">
          <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
            {train.arrivalTime}
          </span>
          <div className="flex items-center md:justify-end space-x-1.5 mt-0.5">
            <span className="font-bold text-xs text-emerald-700 font-mono">{train.toStation}</span>
            <span className="text-xs text-slate-500 font-medium">&bull; Destination</span>
          </div>
        </div>

      </div>

      {/* IRCTC-Style Class Selection Tiles */}
      <div className="px-5 sm:px-6 pb-4 bg-white">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
            Select Travel Class &amp; Quota:
          </span>
          <span className="text-[11px] text-slate-500 font-medium">Fare protected during checkout</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
          {availableClasses.map(cls => {
            const isSelected = selectedClass === cls.code;
            const fareForClass = Math.round(baseFinalFare * cls.fareMultiplier);

            return (
              <button
                key={cls.code}
                type="button"
                onClick={() => handleClassClick(cls.code)}
                className={`p-3 rounded-2xl border text-left transition-all relative ${
                  isSelected
                    ? 'bg-sky-50/90 border-sky-600 shadow-sm ring-1 ring-sky-600 scale-[1.02]'
                    : 'bg-white border-slate-200 hover:border-sky-300 hover:bg-slate-50/60'
                }`}
              >
                {isSelected && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-sky-600"></span>
                )}
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-black text-xs ${isSelected ? 'text-sky-900' : 'text-slate-800'}`}>{cls.code}</span>
                  <span className="text-[9px] text-slate-400 font-semibold">{cls.label.split(' ')[0]}</span>
                </div>
                <div className={`text-sm font-black font-mono ${isSelected ? 'text-sky-900' : 'text-slate-800'}`}>
                  ₹{fareForClass}
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className={`text-[10px] font-bold ${
                    cls.code === train.travelClass && train.seatStatus === 'Waitlist' ? 'text-rose-600' :
                    cls.code === train.travelClass && train.seatStatus === 'RAC' ? 'text-amber-700' :
                    'text-emerald-700'
                  }`}>
                    {cls.code === train.travelClass && train.seatStatus === 'Waitlist'
                      ? `WL #${train.waitlistPosition || 1}`
                      : cls.code === train.travelClass && train.seatStatus === 'RAC'
                      ? `RAC #${train.waitlistPosition || 1}`
                      : `AVL-${cls.code === train.travelClass ? (train.availableSeats || 24) : Math.max(6, Math.round((train.availableSeats || 24) * (cls.fareMultiplier < 1 ? 1.8 : 0.85)))}`
                    }
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Card Action Footer */}
      <div className="bg-slate-50 px-5 sm:px-6 py-3.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
        
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleOpenSeatMatrix}
            className="flex items-center space-x-1.5 text-xs text-slate-700 hover:text-sky-800 bg-white hover:bg-slate-100 border border-slate-300 px-3 py-1.5 rounded-xl shadow-2xs font-semibold transition-colors"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-sky-600" />
            <span>Coach Layout ({selectedClass})</span>
          </button>
        </div>

        {/* Book Button */}
        <div className="flex items-center space-x-3 ml-auto">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] text-slate-500 uppercase font-bold">Total Fare</span>
            <div className="text-lg font-black text-slate-900 font-mono">₹{computedFare}</div>
          </div>

          <button
            type="button"
            onClick={handleBook}
            className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black text-sm shadow-sm flex items-center space-x-2 transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            <span>Book Ticket ({selectedClass})</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </div>

    </div>
  );
};
