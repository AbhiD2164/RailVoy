import React, { useState, useEffect } from 'react';
import { MapPin, Calendar, Train, ArrowRightLeft, Sparkles, Filter, Search } from 'lucide-react';
import { Station } from '../types';

interface TrainSearchProps {
  stations: Station[];
  onSearch: (from: string, to: string, date: string, travelClass: string) => void;
  loading: boolean;
  selectedTrainType?: string;
  onSelectTrainType?: (type: string) => void;
  selectedTimeSlot?: string;
  onSelectTimeSlot?: (slot: string) => void;
}

export const TrainSearch: React.FC<TrainSearchProps> = ({
  stations,
  onSearch,
  loading,
  selectedTrainType,
  onSelectTrainType,
  selectedTimeSlot,
  onSelectTimeSlot
}) => {
  const [fromCode, setFromCode] = useState('');
  const [toCode, setToCode] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [travelClass, setTravelClass] = useState('3A');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (stations && stations.length >= 2) {
      setFromCode(prev => prev || stations[0].stationCode);
      setToCode(prev => prev || stations[1].stationCode);
    } else if (stations && stations.length === 1) {
      setFromCode(prev => prev || stations[0].stationCode);
    }
  }, [stations]);

  const classes = [
    { code: '3A', label: 'AC 3 Tier (3A)' },
    { code: '2A', label: 'AC 2 Tier (2A)' },
    { code: '1A', label: 'AC 1st Class (1A)' },
    { code: 'SL', label: 'Sleeper (SL)' },
    { code: 'CC', label: 'AC Chair Car (CC)' },
    { code: 'EC', label: 'Exec. Chair Car (EC)' },
    { code: '3E', label: 'AC 3 Economy (3E)' },
    { code: 'GS', label: 'General (GS)' },
  ];

  const popularRoutes = React.useMemo(() => {
    if (!stations || stations.length < 2) return [];
    return [
      { from: stations[0].stationCode, to: stations[stations.length - 1].stationCode, label: `${stations[0].stationName} ➔ ${stations[stations.length - 1].stationName}` },
      ...(stations.length > 3 ? [{ from: stations[1].stationCode, to: stations[stations.length - 2].stationCode, label: `${stations[1].stationName} ➔ ${stations[stations.length - 2].stationName}` }] : [])
    ];
  }, [stations]);

  const handleSwap = () => {
    const temp = fromCode;
    setFromCode(toCode);
    setToCode(temp);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!fromCode || !toCode) {
      setFormError('Please choose both source and destination stations.');
      return;
    }

    if (fromCode === toCode) {
      setFormError('Source and destination stations must be different.');
      return;
    }

    if (!date) {
      setFormError('Please select a travel date.');
      return;
    }

    const selectedDate = new Date(`${date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      setFormError('Travel date cannot be in the past.');
      return;
    }

    setFormError('');
    onSearch(fromCode, toCode, date, travelClass);
  };

  return (
    <div className="w-full glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden">
      
      {/* Background ambient glow */}
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative z-10">
        
        {/* Title */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Train className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-100">Train Search & Ticket Availability</h2>
              <p className="text-xs text-slate-400">Live seat availability, real-time waitlist confirmation odds & government-regulated dynamic fares</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            
            {/* From Station */}
            <div className="md:col-span-5 relative">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center space-x-1">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                <span>From Station</span>
              </label>
              <select
                value={fromCode}
                onChange={(e) => { setFormError(''); setFromCode(e.target.value); }}
                aria-invalid={Boolean(formError)}
                className="w-full py-3 px-4 bg-slate-900/90 border border-slate-700/80 rounded-2xl text-sm font-semibold text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              >
                {stations.map(s => (
                  <option key={s.stationCode} value={s.stationCode}>
                    {s.stationName} ({s.stationCode}) - {s.state}
                  </option>
                ))}
              </select>
            </div>

            {/* Swap Button */}
            <div className="md:col-span-2 flex items-center justify-center pt-5">
              <button
                type="button"
                onClick={handleSwap}
                className="p-3 rounded-full bg-slate-800/80 hover:bg-cyan-500/20 text-cyan-400 border border-slate-700 hover:border-cyan-500/50 transition-all hover:rotate-180 duration-300"
                title="Swap Stations"
              >
                <ArrowRightLeft className="w-4 h-4" />
              </button>
            </div>

            {/* To Station */}
            <div className="md:col-span-5 relative">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center space-x-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                <span>To Station</span>
              </label>
              <select
                value={toCode}
                onChange={(e) => { setFormError(''); setToCode(e.target.value); }}
                aria-invalid={Boolean(formError)}
                className="w-full py-3 px-4 bg-slate-900/90 border border-slate-700/80 rounded-2xl text-sm font-semibold text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              >
                {stations.map(s => (
                  <option key={s.stationCode} value={s.stationCode}>
                    {s.stationName} ({s.stationCode}) - {s.state}
                  </option>
                ))}
              </select>
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            
            {/* Travel Date */}
            <div className="md:col-span-5">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                <span>Travel Date</span>
              </label>
              <input
                type="date"
                min={new Date().toISOString().split('T')[0]}
                value={date}
                onChange={(e) => { setFormError(''); setDate(e.target.value); }}
                aria-invalid={Boolean(formError)}
                className="w-full py-3 px-4 bg-slate-900/90 border border-slate-700/80 rounded-2xl text-sm font-semibold text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Travel Class Selector */}
            <div className="md:col-span-7">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center space-x-1">
                <Filter className="w-3.5 h-3.5 text-teal-400" />
                <span>Class</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {classes.map(c => (
                  <button
                    type="button"
                    key={c.code}
                    onClick={() => setTravelClass(c.code)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                      travelClass === c.code
                        ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 shadow-md shadow-cyan-500/20'
                        : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {c.code}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {formError && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {formError}
            </div>
          )}

          {/* Quick Filter Chips: Train Types & Time Slots */}
          <div className="pt-2 border-t border-slate-800/80 space-y-3">
            {/* Train Type Chips */}
            <div>
              <div className="flex items-center space-x-1.5 mb-2">
                <Train className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Train Type Filter:
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'all', label: 'All Services' },
                  { id: 'Vande Bharat', label: '⚡ Vande Bharat' },
                  { id: 'Rajdhani', label: '👑 Rajdhani' },
                  { id: 'Tejas', label: '🚅 Tejas Express' },
                  { id: 'Garib Rath', label: '🟢 Garib Rath' },
                  { id: 'Shatabdi', label: '⚡ Shatabdi' },
                  { id: 'Sachkhand', label: '🙏 Sachkhand' },
                  { id: 'Superfast', label: '🚆 Superfast' },
                ].map(item => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => onSelectTrainType && onSelectTrainType(item.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      (selectedTrainType || 'all') === item.id
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'bg-slate-900/70 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Departure Time Slots */}
            <div>
              <div className="flex items-center space-x-1.5 mb-2">
                <Calendar className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Departure Time Window:
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'all', label: 'Any Time' },
                  { id: 'early-morning', label: '00:00 - 06:00 (Early)' },
                  { id: 'morning', label: '06:00 - 12:00 (Morning)' },
                  { id: 'afternoon', label: '12:00 - 18:00 (Afternoon)' },
                  { id: 'night', label: '18:00 - 24:00 (Night)' },
                ].map(slot => (
                  <button
                    type="button"
                    key={slot.id}
                    onClick={() => onSelectTimeSlot && onSelectTimeSlot(slot.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      (selectedTimeSlot || 'all') === slot.id
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm'
                        : 'bg-slate-900/70 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Popular Routes */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Popular Routes:</span>
            {popularRoutes.map((r, idx) => (
              <button
                type="button"
                key={idx}
                onClick={() => { setFromCode(r.from); setToCode(r.to); }}
                className="px-2.5 py-1 rounded-lg bg-slate-900/60 hover:bg-slate-800 border border-slate-800 text-[11px] text-cyan-300 font-medium transition-colors"
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Submit Search Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-extrabold text-base rounded-2xl shadow-xl shadow-cyan-500/25 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center space-x-2"
          >
            <Search className="w-5 h-5" />
            <span>{loading ? 'Fetching Availability & Fares...' : 'Search Trains & Check Availability'}</span>
          </button>

        </form>

      </div>
    </div>
  );
};
