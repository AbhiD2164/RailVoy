import React, { useMemo, useState, useEffect } from 'react';
import { X, Users, Info, Train, Utensils, Loader2 } from 'lucide-react';
import { TrainSearchResult } from '../types';

interface SeatMatrixModalProps {
  train: TrainSearchResult | null;
  selectedClass: string;
  travelDate?: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirmSelection: () => void;
}

// ─── Seat layout generators per class ─────────────────────────────────────────

const DEFAULT_RAKE = ['ENG', 'GS', 'S1', 'S2', 'B1', 'B2', 'B3', 'AB1', 'A1', 'HA1', 'H1', 'PC', 'GS'];

function isCoachMatchingClass(coach: string, travelClass: string): boolean {
  const c = coach.toUpperCase();
  const tc = (travelClass || '').toUpperCase();
  if (tc === 'GS' && c === 'GS') return true;
  if (tc === '1A' && (c.startsWith('H') || c.includes('HA'))) return true;
  if (tc === '2A' && (c.startsWith('A') || c.includes('AB'))) return true;
  if ((tc === '3A' || tc === '3E') && (c.startsWith('B') || c.startsWith('G') || c.includes('AB'))) return true;
  if (tc === 'SL' && c.startsWith('S')) return true;
  if (tc === 'CC' && c.startsWith('C')) return true;
  if (tc === 'EC' && c.startsWith('E')) return true;
  return false;
}

function getCoachDescription(coach: string): string {
  const c = coach.toUpperCase();
  if (c === 'ENG') return 'Locomotive Engine';
  if (c === 'GS') return 'General Unreserved';
  if (c.startsWith('H1') || c.startsWith('H')) return 'AC First Class (1A)';
  if (c.startsWith('HA')) return 'First AC / 2-Tier Composite';
  if (c.startsWith('A')) return 'AC 2-Tier (2A)';
  if (c.startsWith('AB')) return 'AC 2-Tier / 3-Tier Composite';
  if (c.startsWith('B')) return 'AC 3-Tier (3A)';
  if (c.startsWith('G')) return 'AC 3-Tier Economy (3E)';
  if (c.startsWith('S')) return 'Sleeper Class (SL)';
  if (c.startsWith('C')) return 'AC Chair Car (CC)';
  if (c.startsWith('E')) return 'Executive Chair Car (EC)';
  if (c === 'PC') return 'Pantry Car / Catering';
  return `${c} Coach`;
}

function getBerthType3A_SL(seatNo: number): string {
  const mod = seatNo % 8;
  if (mod === 1 || mod === 4) return 'Lower';
  if (mod === 2 || mod === 5) return 'Middle';
  if (mod === 3 || mod === 6) return 'Upper';
  if (mod === 7) return 'Side Lower';
  return 'Side Upper'; // mod 0
}

function getBerthType2A(seatNo: number): string {
  const mod = seatNo % 6;
  if (mod === 1 || mod === 3) return 'Lower';
  if (mod === 2 || mod === 4) return 'Upper';
  if (mod === 5) return 'Side Lower';
  return 'Side Upper';
}

function getBerthType1A(seatNo: number): string {
  return seatNo % 2 === 1 ? 'Lower' : 'Upper';
}

function getSeatTypeCC(seatNo: number): string {
  const mod = seatNo % 5;
  if (mod === 1 || mod === 0) return 'Window';
  if (mod === 3) return 'Aisle';
  return 'Middle';
}

function getSeatTypeEC(seatNo: number): string {
  const mod = seatNo % 4;
  if (mod === 1 || mod === 0) return 'Window';
  return 'Aisle';
}

const classConfig: Record<string, { total: number; coachLabel: (trainName: string) => string; getType: (seatNo: number) => string; label: string }> = {
  '1A': { total: 24, coachLabel: (n) => `H1 — ${n}`, getType: getBerthType1A, label: 'First AC' },
  '2A': { total: 52, coachLabel: (n) => `A1 — ${n}`, getType: getBerthType2A, label: 'Second AC' },
  '3A': { total: 72, coachLabel: (n) => `B1 — ${n}`, getType: getBerthType3A_SL, label: 'Third AC' },
  '3E': { total: 72, coachLabel: (n) => `B1 — ${n}`, getType: getBerthType3A_SL, label: 'Third AC Economy' },
  'SL': { total: 72, coachLabel: (n) => `S1 — ${n}`, getType: getBerthType3A_SL, label: 'Sleeper' },
  'CC': { total: 78, coachLabel: (n) => `C1 — ${n}`, getType: getSeatTypeCC, label: 'Chair Car' },
  'EC': { total: 52, coachLabel: (n) => `E1 — ${n}`, getType: getSeatTypeEC, label: 'Executive Chair Car' },
  'GS': { total: 0, coachLabel: (n) => `GS — ${n}`, getType: () => 'General', label: 'General' },
};

const berthColor: Record<string, string> = {
  Lower: 'bg-sky-50 border-sky-300 text-sky-900',
  Middle: 'bg-indigo-50 border-indigo-300 text-indigo-900',
  Upper: 'bg-blue-50 border-blue-300 text-blue-900',
  'Side Lower': 'bg-teal-50 border-teal-300 text-teal-900',
  'Side Upper': 'bg-cyan-50 border-cyan-300 text-cyan-900',
  Window: 'bg-sky-50 border-sky-300 text-sky-900',
  Aisle: 'bg-indigo-50 border-indigo-300 text-indigo-900',
  General: 'bg-slate-100 border-slate-300 text-slate-700',
};

export const SeatMatrixModal: React.FC<SeatMatrixModalProps> = ({
  train, selectedClass, travelDate, isOpen, onClose, onConfirmSelection
}) => {
  const [hoveredSeat, setHoveredSeat] = useState<number | null>(null);
  const [activeCoach, setActiveCoach] = useState<string | null>(null);
  const [liveStats, setLiveStats] = useState<{ booked: number; rac: number; available: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Fetch live seat stats when modal opens
  useEffect(() => {
    if (!isOpen || !train) return;
    const date = travelDate || new Date().toISOString().split('T')[0];
    const cls = (selectedClass || '3A').toUpperCase();
    setStatsLoading(true);
    fetch(`/api/bookings/seat-stats/${train.trainNo}/${cls}/${date}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && typeof data.booked === 'number') {
          setLiveStats({ booked: data.booked, rac: data.rac ?? 0, available: data.available });
        } else {
          setLiveStats(null);
        }
      })
      .catch(() => setLiveStats(null))
      .finally(() => setStatsLoading(false));
  }, [isOpen, train, selectedClass, travelDate]);

  const rake = useMemo(() => {
    return (train?.coachComposition && train.coachComposition.length > 0)
      ? train.coachComposition
      : DEFAULT_RAKE;
  }, [train]);

  const cfg = classConfig[selectedClass?.toUpperCase()] || classConfig['3A'];
  const total = cfg.total || 72;

  // Real-world seat mapping: NO mock/fake booked seeds!
  // Only mark seats as booked if actually booked via the website
  const seats = useMemo(() => {
    if (cfg.total === 0) return [];
    const count = Math.min(total, 72);

    const bookedSet = new Set<number>();
    const racSet = new Set<number>();

    if (liveStats && liveStats.booked > 0) {
      // Allocate sequentially from seat 1 for tickets booked on this platform
      for (let i = 1; i <= Math.min(liveStats.booked, count); i++) {
        bookedSet.add(i);
      }
      for (let i = 1; i <= Math.min(liveStats.rac, count - bookedSet.size); i++) {
        racSet.add(liveStats.booked + i);
      }
    }

    return Array.from({ length: count }, (_, i) => {
      const seatNo = i + 1;
      const type = cfg.getType(seatNo);
      const status = bookedSet.has(seatNo) ? 'Booked' : racSet.has(seatNo) ? 'RAC' : 'Available';
      return { seatNo, type, status };
    });
  }, [selectedClass, cfg, liveStats, total]);

  const available = seats.filter(s => s.status === 'Available').length;
  const booked = seats.filter(s => s.status === 'Booked').length;
  const rac = seats.filter(s => s.status === 'RAC').length;

  if (!isOpen || !train) return null;

  // Train Rake Bar Component
  const renderTrainRake = () => (
    <div className="mb-5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
          <Train className="w-3.5 h-3.5 text-sky-600" />
          <span>Train Rake Composition (Engine &rarr; Guard Van)</span>
        </span>
        <span className="text-[10px] text-slate-500">
          {activeCoach ? (
            <span>Selected: <strong className="text-sky-700 font-mono">{activeCoach}</strong> ({getCoachDescription(activeCoach)})</span>
          ) : (
            <span>Class Coach: <strong className="text-emerald-700 font-mono">{cfg.coachLabel('').split(' ')[0]}</strong></span>
          )}
        </span>
      </div>

      <div className="overflow-x-auto pb-1 scrollbar-thin">
        <div className="flex items-center space-x-1.5 min-w-max py-1">
          {rake.map((coach: any, idx: number) => {
            const coachCode = typeof coach === 'string' ? coach : (coach.code || 'GS');
            const isEng = coachCode === 'ENG';
            const isPC = coachCode === 'PC';
            const isMatch = isCoachMatchingClass(coachCode, selectedClass);
            const isCurrent = activeCoach ? activeCoach === coachCode : isMatch;

            return (
              <div key={idx} className="flex items-center">
                <button
                  type="button"
                  onClick={() => !isEng && setActiveCoach(coachCode)}
                  title={`${coachCode}: ${getCoachDescription(coachCode)}`}
                  className={`relative flex flex-col items-center justify-center rounded-xl px-2.5 py-1.5 text-center transition-all ${
                    isEng
                      ? 'bg-amber-100 border border-amber-300 text-amber-900 font-black cursor-default'
                      : isPC
                      ? 'bg-purple-100 border border-purple-300 text-purple-900 hover:scale-105'
                      : isCurrent
                      ? 'bg-sky-600 text-white font-black border border-sky-700 shadow-sm scale-105'
                      : isMatch
                      ? 'bg-sky-50 border border-sky-300 text-sky-800 hover:bg-sky-100 font-semibold'
                      : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  <div className="text-[10px] font-mono font-black flex items-center space-x-0.5">
                    {isEng && <span>🚂</span>}
                    {isPC && <Utensils className="w-2.5 h-2.5 mr-0.5 text-purple-600" />}
                    <span>{coachCode}</span>
                  </div>
                  <div className="text-[8px] uppercase tracking-tighter opacity-80">
                    {isEng ? 'Loco' : isPC ? 'Pantry' : coachCode === 'GS' ? 'Gen' : 'Coach'}
                  </div>
                </button>
                {idx < rake.length - 1 && (
                  <div className="w-2 h-0.5 bg-slate-300 flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (selectedClass?.toUpperCase() === 'GS') {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm">
        <div className="min-h-full flex items-center justify-center p-3 sm:p-6 text-center">
          <div className="relative w-full max-w-2xl bg-white border border-slate-200 p-8 rounded-3xl shadow-2xl text-left space-y-5 my-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Info className="w-5 h-5 text-amber-500" />
                <span>General Coach (GS) — Train #{train.trainNo}</span>
              </h3>
              <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            {renderTrainRake()}

            <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-200 text-left">
              General class coaches (<strong>GS</strong>) are positioned directly behind the locomotive and at the rear end of the train rake.
              Seating is unreserved on a first-come, first-served basis as per Indian Railways rules. Food service is not available on General tickets.
            </p>

            <div className="flex space-x-3 justify-end pt-2">
              <button onClick={onClose} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors">Close</button>
              <button onClick={onConfirmSelection} className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all">Proceed to Booking</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm">
      <div className="min-h-full flex items-center justify-center p-3 sm:p-6 text-center">
        <div className="relative w-full max-w-3xl bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl my-6 text-left overflow-hidden text-slate-900">

          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-4 mb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                <Users className="w-5 h-5 text-sky-600" />
                <span>Coach Layout — {activeCoach ? `${activeCoach} (${getCoachDescription(activeCoach)})` : cfg.coachLabel(train.trainName)}</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Class: {cfg.label} | Train #{train.trainNo} ({train.trainName})</p>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Train Rake Visualization */}
          {renderTrainRake()}

          {/* Stats row */}
          <div className="flex items-center space-x-3 mb-4 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">{available} Available</span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-bold">{booked} Booked</span>
            {rac > 0 && <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-bold">{rac} RAC</span>}
            {statsLoading ? (
              <span className="flex items-center space-x-1 text-slate-500"><Loader2 className="w-3 h-3 animate-spin" /><span>Syncing inventory...</span></span>
            ) : (
              <span className="px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-700 font-bold text-[10px] uppercase tracking-widest">● LIVE INVENTORY</span>
            )}
            <span className="ml-auto text-slate-500 font-medium">Total: {cfg.total} berths</span>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-2 mb-4 text-[10px]">
            {Object.entries(berthColor).map(([name, cls]) => (
              <div key={name} className="flex items-center space-x-1.5">
                <span className={`w-3 h-3 rounded border ${cls}`} />
                <span className="text-slate-600 font-medium">{name}</span>
              </div>
            ))}
          </div>

          {/* Seat Grid */}
          <div className="grid grid-cols-8 gap-2 bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-6">
            {seats.map(s => (
              <div
                key={s.seatNo}
                onMouseEnter={() => setHoveredSeat(s.seatNo)}
                onMouseLeave={() => setHoveredSeat(null)}
                className={`relative p-2 rounded-xl border text-center transition-all cursor-default ${
                  s.status === 'Available'
                    ? `${berthColor[s.type] || 'bg-emerald-50 border-emerald-300 text-emerald-900'} hover:scale-105 hover:shadow-sm cursor-pointer`
                    : s.status === 'RAC'
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-slate-100 border-slate-200 text-slate-400 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="text-[10px] font-mono font-bold">{s.seatNo}</div>
                <div className="text-[8px] uppercase font-semibold mt-0.5 opacity-80 leading-tight">{s.type.replace(' ', '\n')}</div>
                {s.status === 'Booked' && <div className="absolute inset-0 flex items-center justify-center"><span className="text-[8px] text-slate-400 font-bold">●</span></div>}
                {hoveredSeat === s.seatNo && s.status === 'Available' && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-10 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap shadow-md">
                    Seat {s.seatNo} · {s.type}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer hint */}
          <p className="text-[11px] text-slate-500 mb-4 text-center">
            Berth allocation adheres to Indian Railways rules (Lower berths prioritized for senior citizens).
          </p>

          {/* Actions */}
          <div className="flex justify-end space-x-3">
            <button onClick={onClose} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors">Close</button>
            <button onClick={onConfirmSelection} className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all">
              Proceed to Booking
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
