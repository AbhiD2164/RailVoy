import React, { useState } from 'react';
import { Clock, ArrowRight, ShieldCheck, Zap, Info, ChevronRight, Sparkles, Eye } from 'lucide-react';
import { TrainSearchResult } from '../types';

interface TrainCardProps {
  train: TrainSearchResult;
  onSelectSeats: (train: TrainSearchResult) => void;
  onBookNow: (train: TrainSearchResult) => void;
  onShowAIExplanation: (explanation: string) => void;
}

export const TrainCard: React.FC<TrainCardProps> = ({
  train,
  onSelectSeats,
  onBookNow,
  onShowAIExplanation
}) => {
  const [showFare, setShowFare] = useState(false);

  const getStatusBadge = () => {
    if (train.seatStatus === 'Available') {
      return (
        <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>AVAILABLE ({train.availableSeats} Seats)</span>
        </span>
      );
    } else if (train.seatStatus === 'RAC') {
      return (
        <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-amber-950/80 border border-amber-800/80 text-amber-300 text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          <span>RAC (Position #{train.waitlistPosition})</span>
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-300 text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-rose-400"></span>
          <span>WAITLIST (WL #{train.waitlistPosition})</span>
        </span>
      );
    }
  };

  return (
    <div className="w-full glass-card p-5 sm:p-6 rounded-2xl border border-slate-800/80 hover:border-slate-700/80 transition-all hover:shadow-xl hover:shadow-cyan-950/20 group">
      
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-4 mb-4">
        <div>
          <div className="flex items-center space-x-3">
            <h3 className="text-base sm:text-lg font-bold text-slate-100 group-hover:text-cyan-300 transition-colors">
              {train.trainName}
            </h3>
            <span className="font-mono text-xs px-2.5 py-0.5 rounded-lg bg-slate-800 text-cyan-400 font-semibold">
              #{train.trainNo}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{train.trainType} Express Service</p>
        </div>

        <div className="flex items-center space-x-2">
          {getStatusBadge()}
        </div>
      </div>

      {/* Route & Timings */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center mb-6">
        
        {/* Departure */}
        <div className="md:col-span-4">
          <span className="text-2xl font-black text-slate-100">{train.departureTime}</span>
          <p className="text-xs font-bold text-slate-300 mt-0.5">{train.fromStation}</p>
        </div>

        {/* Duration & Distance */}
        <div className="md:col-span-4 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] font-semibold text-slate-400 flex items-center space-x-1">
            <Clock className="w-3 h-3 text-cyan-400" />
            <span>{train.distanceKm} km</span>
          </span>
          <div className="w-full max-w-[140px] flex items-center space-x-2 my-1">
            <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
            <div className="flex-1 border-t-2 border-dashed border-slate-700"></div>
            <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
          </div>
          <span className="text-[10px] text-slate-500 font-medium">Direct Route</span>
        </div>

        {/* Arrival */}
        <div className="md:col-span-4 text-left md:text-right">
          <span className="text-2xl font-black text-slate-100">{train.arrivalTime}</span>
          <p className="text-xs font-bold text-slate-300 mt-0.5">{train.toStation}</p>
        </div>

      </div>

      {/* AI Decision & Pricing Footer */}
      <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        
        {/* Waitlist Probability & Rationale */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-200">Confirmation Probability:</span>
              <span className={`text-sm font-extrabold ${train.confirmationProbability >= 75 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {train.confirmationProbability}%
              </span>
            </div>
            <button
              onClick={() => onShowAIExplanation(train.aiExplanation || train.fare.explanation)}
              className="text-[11px] text-cyan-400 hover:underline flex items-center space-x-1 mt-0.5"
            >
              <Info className="w-3 h-3" />
              <span>View Fare &amp; Seat Intelligence</span>
            </button>
          </div>
        </div>

        {/* Fare & Booking Button */}
        {!showFare ? (
          <div className="flex items-center space-x-3">
            <button
              onClick={() => onSelectSeats(train)}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
            >
              Seat Layout
            </button>
            <button
              onClick={() => setShowFare(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-cyan-500/20 transition-all flex items-center space-x-1.5 group/btn"
            >
              <Eye className="w-3.5 h-3.5 text-slate-900" />
              <span>View Fare / Plan Journey</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" />
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-4 animate-in fade-in duration-200">
            <div className="text-right">
              <div className="flex items-center justify-end space-x-1">
                <span className="text-xs text-slate-400">Ticket Fare:</span>
                <span className="text-xl font-black text-emerald-400">&#8377;{train.fare.finalFare}</span>
              </div>
              {train.fare.surgePercentage > 0 ? (
                <span className="text-[10px] text-amber-400 font-semibold">
                  +{train.fare.surgePercentage}% Demand Surge Applied
                </span>
              ) : (
                <span className="text-[10px] text-emerald-400 font-semibold">Base Government Tariff</span>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => onSelectSeats(train)}
                className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
              >
                Seat Layout
              </button>
              <button
                onClick={() => onBookNow(train)}
                className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-cyan-500/20 transition-all flex items-center space-x-1"
              >
                <span>Book Ticket</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
