import React, { useMemo, useState } from 'react';
import { X, Check, Users, Info, Train, Utensils } from 'lucide-react';
import { TrainSearchResult } from '../types';

interface SeatMatrixModalProps {
  train: TrainSearchResult | null;
  selectedClass: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirmSelection: () => void;
}

// ─── Seat layout generators per class ─────────────────────────────────────────

const BOOKED_SEED = [3, 6, 9, 11, 14, 17, 20, 23, 28, 31, 35, 38, 42, 46, 50, 53, 59, 64, 67, 70];
const RAC_SEED = [22, 48, 61];

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

// Per-class config: { total, coachLabel, getType }
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
  Lower: 'bg-sky-900/70 border-sky-700',
  Middle: 'bg-violet-900/70 border-violet-700',
  Upper: 'bg-indigo-900/70 border-indigo-700',
  'Side Lower': 'bg-teal-900/70 border-teal-700',
  'Side Upper': 'bg-cyan-900/70 border-cyan-700',
  Window: 'bg-sky-900/70 border-sky-700',
  Aisle: 'bg-violet-900/70 border-violet-700',
  General: 'bg-slate-800/70 border-slate-600',
};

export const SeatMatrixModal: React.FC<SeatMatrixModalProps> = ({
  train, selectedClass, isOpen, onClose, onConfirmSelection
}) => {
  const [hoveredSeat, setHoveredSeat] = useState<number | null>(null);
  const [activeCoach, setActiveCoach] = useState<string | null>(null);

  const rake = useMemo(() => {
    return (train?.coachComposition && train.coachComposition.length > 0)
      ? train.coachComposition
      : DEFAULT_RAKE;
  }, [train]);

  const cfg = classConfig[selectedClass?.toUpperCase()] || classConfig['3A'];

  const seats = useMemo(() => {
    if (cfg.total === 0) return [];
    return Array.from({ length: Math.min(cfg.total, 72) }, (_, i) => {
      const seatNo = i + 1;
      const type = cfg.getType(seatNo);
      const isBooked = BOOKED_SEED.includes(seatNo);
      const isRAC = RAC_SEED.includes(seatNo);
      return { seatNo, type, status: isBooked ? 'Booked' : isRAC ? 'RAC' : 'Available' };
    });
  }, [selectedClass, cfg]);

  const available = seats.filter(s => s.status === 'Available').length;
  const booked = seats.filter(s => s.status === 'Booked').length;
  const rac = seats.filter(s => s.status === 'RAC').length;

  if (!isOpen || !train) return null;

  // Train Rake Bar Component
  const renderTrainRake = () => (
    <div className="mb-5 bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
          <Train className="w-3.5 h-3.5 text-cyan-400" />
          <span>Train Rake Composition (Engine &rarr; Guard Van)</span>
        </span>
        <span className="text-[10px] text-slate-400">
          {activeCoach ? (
            <span>Selected: <strong className="text-cyan-300 font-mono">{activeCoach}</strong> ({getCoachDescription(activeCoach)})</span>
          ) : (
            <span>Class Coach: <strong className="text-emerald-300 font-mono">{cfg.coachLabel('').split(' ')[0]}</strong></span>
          )}
        </span>
      </div>

      <div className="overflow-x-auto pb-1 scrollbar-thin">
        <div className="flex items-center space-x-1.5 min-w-max py-1">
          {rake.map((coach, idx) => {
            const isEng = coach === 'ENG';
            const isPC = coach === 'PC';
            const isMatch = isCoachMatchingClass(coach, selectedClass);
            const isCurrent = activeCoach ? activeCoach === coach : isMatch;

            return (
              <div key={idx} className="flex items-center">
                <button
                  type="button"
                  onClick={() => !isEng && setActiveCoach(coach)}
                  title={`${coach}: ${getCoachDescription(coach)}`}
                  className={`relative flex flex-col items-center justify-center rounded-xl px-2.5 py-1.5 text-center transition-all ${
                    isEng
                      ? 'bg-amber-950/80 border border-amber-600 text-amber-300 font-black cursor-default'
                      : isPC
                      ? 'bg-purple-950/80 border border-purple-600 text-purple-300 hover:scale-105'
                      : isCurrent
                      ? 'bg-gradient-to-b from-cyan-500 to-emerald-500 text-slate-950 font-black border border-cyan-300 shadow-md shadow-cyan-500/30 scale-105'
                      : isMatch
                      ? 'bg-emerald-950/70 border border-emerald-700 text-emerald-300 hover:bg-emerald-900/80'
                      : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="text-[10px] font-mono font-black flex items-center space-x-0.5">
                    {isEng && <span>🚂</span>}
                    {isPC && <Utensils className="w-2.5 h-2.5 mr-0.5" />}
                    <span>{coach}</span>
                  </div>
                  <div className="text-[8px] uppercase tracking-tighter opacity-80">
                    {isEng ? 'Loco' : isPC ? 'Pantry' : coach === 'GS' ? 'Gen' : 'Coach'}
                  </div>
                </button>
                {idx < rake.length - 1 && (
                  <div className="w-2 h-0.5 bg-slate-700 flex-shrink-0" />
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <div className="relative w-full max-w-2xl glass-panel p-8 rounded-3xl border border-slate-800 shadow-2xl text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <Info className="w-5 h-5 text-amber-400" />
              <span>General Coach (GS) — Train #{train.trainNo}</span>
            </h3>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>

          {renderTrainRake()}

          <p className="text-sm text-slate-300 leading-relaxed bg-slate-900/60 p-4 rounded-2xl border border-slate-800 text-left">
            General class coaches (<strong>GS</strong>) are positioned directly behind the locomotive and at the rear end of the rake.
            Seating is unreserved on a first-come, first-served basis. Food service is not available on General tickets.
          </p>

          <div className="flex space-x-3 justify-end pt-2">
            <button onClick={onClose} className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl">Close</button>
            <button onClick={onConfirmSelection} className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 font-bold text-xs rounded-xl shadow-md">Proceed to Booking</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-3xl glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
              <Users className="w-5 h-5 text-cyan-400" />
              <span>Coach Layout — {activeCoach ? `${activeCoach} (${getCoachDescription(activeCoach)})` : cfg.coachLabel(train.trainName)}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Class: {cfg.label} | Train #{train.trainNo} ({train.trainName})</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Train Rake Visualization */}
        {renderTrainRake()}

        {/* Stats row */}
        <div className="flex items-center space-x-4 mb-4 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-emerald-900/50 border border-emerald-800 text-emerald-300 font-bold">{available} Available</span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-500 font-bold">{booked} Booked</span>
          {rac > 0 && <span className="px-2.5 py-1 rounded-lg bg-amber-900/50 border border-amber-800 text-amber-300 font-bold">{rac} RAC</span>}
          <span className="ml-auto text-slate-500">Total: {cfg.total} berths</span>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 mb-5 text-[10px]">
          {Object.entries(berthColor).map(([name, cls]) => (
            <div key={name} className="flex items-center space-x-1.5">
              <span className={`w-3 h-3 rounded border ${cls}`} />
              <span className="text-slate-400">{name}</span>
            </div>
          ))}
        </div>

        {/* Seat Grid */}
        <div className="grid grid-cols-8 gap-2 bg-slate-900/80 p-4 rounded-2xl border border-slate-800 mb-6">
          {seats.map(s => (
            <div
              key={s.seatNo}
              onMouseEnter={() => setHoveredSeat(s.seatNo)}
              onMouseLeave={() => setHoveredSeat(null)}
              className={`relative p-2 rounded-xl border text-center transition-all cursor-default ${
                s.status === 'Available'
                  ? `${berthColor[s.type] || 'bg-emerald-950/60 border-emerald-800'} hover:scale-110 hover:shadow-lg cursor-pointer`
                  : s.status === 'RAC'
                  ? 'bg-amber-950/60 border-amber-800 text-amber-300'
                  : 'bg-slate-900 border-slate-800 text-slate-700 opacity-40 cursor-not-allowed'
              }`}
            >
              <div className="text-[10px] font-mono font-bold text-slate-200">{s.seatNo}</div>
              <div className="text-[8px] uppercase font-semibold mt-0.5 text-slate-400 leading-tight">{s.type.replace(' ', '\n')}</div>
              {s.status === 'Booked' && <div className="absolute inset-0 flex items-center justify-center"><span className="text-[8px] text-slate-600 font-bold">●</span></div>}
              {hoveredSeat === s.seatNo && s.status === 'Available' && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-10 bg-slate-900 border border-slate-700 text-cyan-300 text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap shadow-xl">
                  Seat {s.seatNo} · {s.type}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <p className="text-[11px] text-slate-500 mb-4 text-center">
          Seat allocation is automatic based on your berth preference during booking.
        </p>

        {/* Actions */}
        <div className="flex justify-end space-x-3">
          <button onClick={onClose} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors">Close</button>
          <button onClick={onConfirmSelection} className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 font-bold text-xs rounded-xl shadow-md hover:from-cyan-400 hover:to-emerald-400 transition-all">
            Proceed to Booking
          </button>
        </div>
      </div>
    </div>
  );
};
