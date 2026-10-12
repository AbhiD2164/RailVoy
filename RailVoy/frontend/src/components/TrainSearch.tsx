import React, { useState } from 'react';
import { MapPin, Calendar, Train, ArrowRightLeft, Sparkles, Filter, Search, ShieldCheck } from 'lucide-react';
import { Station } from '../types';

interface TrainSearchProps {
  stations: Station[];
  onSearch: (from: string, to: string, date: string, travelClass: string, trainNumber?: string) => void;
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
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [travelClass, setTravelClass] = useState('3A');
  const [searchMode, setSearchMode] = useState<'route' | 'train'>('route');
  const [trainNumber, setTrainNumber] = useState('');
  const [formError, setFormError] = useState('');

  const classes = [
    { code: '3A', label: 'AC 3 Tier (3A)' },
    { code: '2A', label: 'AC 2 Tier (2A)' },
    { code: '1A', label: 'AC 1st Class (1A)' },
    { code: 'SL', label: 'Sleeper (SL)' },
    { code: 'CC', label: 'AC Chair Car (CC)' },
    { code: 'EC', label: 'Exec. Chair Car (EC)' },
    { code: 'GS', label: 'General (GS)' },
  ];

  const popularRoutes = [
    { from: 'NDLS', to: 'BPL', label: 'New Delhi (NDLS) ➔ Bhopal (BPL)' },
    { from: 'NDLS', to: 'SBC', label: 'New Delhi (NDLS) ➔ Bengaluru (SBC)' },
    { from: 'INDB', to: 'NDLS', label: 'Indore (INDB) ➔ New Delhi (NDLS)' },
    { from: 'HWH', to: 'NDLS', label: 'Howrah (HWH) ➔ New Delhi (NDLS)' },
    { from: 'CSTM', to: 'MAO', label: 'Mumbai CSMT ➔ Goa (MAO)' },
  ];

  const handleSwap = () => {
    const temp = fromCode;
    setFromCode(toCode);
    setToCode(temp);
    setFromText(toText);
    setToText(fromText);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (searchMode === 'train') {
      const normalizedTrainNumber = trainNumber.trim();
      if (!/^\d{1,5}$/.test(normalizedTrainNumber)) {
        setFormError('Enter a valid train number (1 to 5 digits).');
        return;
      }
      if (!date) {
        setFormError('Please select a valid travel date.');
        return;
      }
      const selectedDate = new Date(date + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        setFormError('Travel date cannot be in the past.');
        return;
      }
      setFormError('');
      onSearch('', '', date, travelClass, normalizedTrainNumber);
      return;
    }

    const resolveStationCode = (value: string) => {
      const normalized = value.trim().toLowerCase();
      const station = stations.find(s =>
        s.stationCode.toLowerCase() === normalized ||
        `${s.stationCode} - ${s.stationName}`.toLowerCase() === normalized ||
        s.stationName.toLowerCase() === normalized
      );
      return station?.stationCode || '';
    };
    const resolvedFrom = resolveStationCode(fromText || fromCode);
    const resolvedTo = resolveStationCode(toText || toCode);

    if (!resolvedFrom || !resolvedTo) {
      setFormError('Please choose both source and destination stations.');
      return;
    }
    if (resolvedFrom === resolvedTo) {
      setFormError('Source and destination stations cannot be the same.');
      return;
    }

    setFormError('');
    setFromCode(resolvedFrom);
    setToCode(resolvedTo);
    onSearch(resolvedFrom, resolvedTo, date, travelClass);
  };

  return (
    <div className="w-full bg-white border border-slate-200 rounded-3xl shadow-md p-6 sm:p-8 relative overflow-hidden">
      
      {/* Subtle railway track ambient lines */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-sky-100/50 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-100/40 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative z-10">
        
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-6 border-b border-slate-200 gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700 shadow-xs">
              <Train className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
                <span>Book Railway Ticket</span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Live Quota Available
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">Official Indian Railways Passenger Reservation Enquiry &amp; Booking</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs text-slate-600 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs">
            <ShieldCheck className="w-4 h-4 text-sky-600" />
            <span className="font-semibold">Dynamic Fares &bull; Live Quota Tracking</span>
          </div>
        </div>

        {formError && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 font-bold shadow-2xs">
            {formError}
          </div>
        )}

        {/* Search Inputs Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => { setSearchMode('route'); setFormError(''); }}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                searchMode === 'route'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Search by route
            </button>
            <button
              type="button"
              onClick={() => { setSearchMode('train'); setFormError(''); }}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                searchMode === 'train'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Search by train number
            </button>
          </div>

          {searchMode === 'train' && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-sky-700">Train number</label>
              <input
                value={trainNumber}
                onChange={e => setTrainNumber(e.target.value.replace(/\D/g, '').slice(0, 5))}
                inputMode="numeric"
                placeholder="e.g. 12951, 22436, 12627"
                className="w-full bg-white px-3 py-2 rounded-xl border border-slate-300 text-base font-bold text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
              <p className="mt-1 text-xs text-slate-500">View the scheduled route and real-time availability for an exact train.</p>
            </div>
          )}

          {searchMode === 'route' && <>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            
            {/* From Station */}
            <div className="md:col-span-4 bg-slate-50 hover:bg-white focus-within:bg-white p-4 rounded-2xl border border-slate-200 focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500 transition-all shadow-2xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider flex items-center space-x-1">
                  <MapPin className="w-3 h-3" />
                  <span>From (Origin)</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">Boarding</span>
              </div>
              <input
                list="railvoy-stations"
                value={fromText}
                onChange={e => { setFromText(e.target.value); setFromCode(''); }}
                placeholder="Type station code or city (e.g. NDLS)"
                autoComplete="off"
                className="w-full bg-transparent text-slate-900 font-bold text-sm sm:text-base outline-none placeholder:text-slate-400"
              />
              <datalist id="railvoy-stations">
                {stations.map(s => (
                  <option key={s.stationCode} value={`${s.stationCode} - ${s.stationName}`} />
                ))}
              </datalist>
            </div>

            {/* Swap Button */}
            <div className="md:col-span-1 flex justify-center -my-2 md:my-0">
              <button
                type="button"
                onClick={handleSwap}
                title="Swap Stations"
                className="w-10 h-10 rounded-2xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 flex items-center justify-center shadow-sm transition-transform hover:rotate-180 duration-300"
              >
                <ArrowRightLeft className="w-4 h-4" />
              </button>
            </div>

            {/* To Station */}
            <div className="md:col-span-4 bg-slate-50 hover:bg-white focus-within:bg-white p-4 rounded-2xl border border-slate-200 focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500 transition-all shadow-2xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider flex items-center space-x-1">
                  <MapPin className="w-3 h-3" />
                  <span>To (Destination)</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">Arrival</span>
              </div>
              <input
                list="railvoy-stations-to"
                value={toText}
                onChange={e => { setToText(e.target.value); setToCode(''); }}
                placeholder="Type station code or city (e.g. SBC, BPL)"
                autoComplete="off"
                className="w-full bg-transparent text-slate-900 font-bold text-sm sm:text-base outline-none placeholder:text-slate-400"
              />
              <datalist id="railvoy-stations-to">
                {stations.map(s => (
                  <option key={s.stationCode} value={`${s.stationCode} - ${s.stationName}`} />
                ))}
              </datalist>
            </div>

            {/* Date Picker */}
            <div className="md:col-span-3 bg-slate-50 hover:bg-white focus-within:bg-white p-4 rounded-2xl border border-slate-200 focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500 transition-all shadow-2xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider flex items-center space-x-1">
                  <Calendar className="w-3 h-3" />
                  <span>Travel Date</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">Date</span>
              </div>
              <input
                type="date"
                required
                min={new Date().toISOString().split('T')[0]}
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-transparent text-slate-900 font-bold text-sm sm:text-base outline-none cursor-pointer"
              />
            </div>

          </div>
          </>}

          {/* Second Row: Class selection & Search CTA */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            
            {/* Preferred Class */}
            <div className="md:col-span-7 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                <Filter className="w-3.5 h-3.5 text-sky-600" />
                <span>Travel Class:</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {classes.map(c => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setTravelClass(c.code)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                      travelClass === c.code
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {c.code}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Button */}
            <div className="md:col-span-5">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-sky-600 via-sky-700 to-blue-800 hover:from-sky-500 hover:to-blue-700 text-white font-black text-base shadow-md flex items-center justify-center space-x-2 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <div className="flex items-center space-x-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Searching IRCTC Schedules...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Search className="w-5 h-5 text-white" />
                    <span>Search Available Trains</span>
                  </div>
                )}
              </button>
            </div>

          </div>

          {/* Quick Route Suggestions */}
          <div className="flex items-center space-x-2 pt-2 overflow-x-auto text-xs pb-1">
            <span className="text-slate-500 font-bold flex-shrink-0 flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Popular Routes:</span>
            </span>
            <div className="flex items-center space-x-2 min-w-max">
              {popularRoutes.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setFromText(r.from);
                    setToText(r.to);
                    setFromCode(r.from);
                    setToCode(r.to);
                  }}
                  className="px-3 py-1 rounded-xl bg-white border border-slate-200 hover:border-sky-400 text-slate-600 hover:text-sky-700 shadow-2xs transition-colors font-medium"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
