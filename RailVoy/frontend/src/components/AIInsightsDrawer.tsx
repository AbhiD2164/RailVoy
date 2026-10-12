import React from 'react';
import { X, Sparkles, Brain, DollarSign, TrendingUp, Cpu, ShieldCheck } from 'lucide-react';

interface AIInsightsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  explanationText: string;
}

export const AIInsightsDrawer: React.FC<AIInsightsDrawerProps> = ({
  isOpen,
  onClose,
  explanationText
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm">
      <div className="w-full max-w-md h-full bg-white border-l border-slate-200 p-6 sm:p-8 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto">
        
        <div>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-sky-50 text-sky-700 border border-sky-200">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Fare & Seat Intelligence</h3>
                <p className="text-[11px] text-slate-500">Demand-based fare and seat confirmation analysis</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 rounded-xl">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Main Rationale Card */}
          <div className="p-4 bg-sky-50 rounded-2xl border border-sky-200 space-y-3 mb-6">
            <div className="flex items-center space-x-2 text-sky-700 text-xs font-bold">
              <Sparkles className="w-4 h-4" />
              <span>Plain Language Explanation</span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed font-sans">
              {explanationText || 'RailVoy AI analyzed route demand, seat cancellation velocity, and configured fare boundaries.'}
            </p>
          </div>

          {/* Engine Highlights */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fleet Optimization Intelligence</h4>

            <div className="p-3.5 bg-white rounded-xl border border-slate-200 flex items-start space-x-3">
              <Cpu className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-slate-800">Waitlist Confirmation Predictor</span>
                <p className="text-[11px] text-slate-500 mt-0.5">Uses historical cancellation trends and class-based seat allocation data.</p>
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-slate-200 flex items-start space-x-3">
              <DollarSign className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-slate-800">Configured Fare Policy</span>
                <p className="text-[11px] text-slate-500 mt-0.5">The server applies train-specific fare rules, quota, demand, and calendar signals.</p>
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-slate-200 flex items-start space-x-3">
              <ShieldCheck className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-slate-800">Network Seat Recycling</span>
                <p className="text-[11px] text-slate-500 mt-0.5">Cancelled and transferred seats are reallocated through the inventory service.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-200">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
