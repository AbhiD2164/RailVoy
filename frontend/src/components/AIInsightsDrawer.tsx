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
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm">
      <div className="w-full max-w-md h-full glass-panel border-l border-slate-800 p-6 sm:p-8 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto">
        
        <div>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-100">Fare & Seat Intelligence</h3>
                <p className="text-[11px] text-slate-400">Demand-based dynamic pricing & real-time seat confirmation analytics</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-200 rounded-xl">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Main Rationale Card */}
          <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-3 mb-6">
            <div className="flex items-center space-x-2 text-cyan-400 text-xs font-bold">
              <Sparkles className="w-4 h-4" />
              <span>Plain Language Explanation</span>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed font-sans">
              {explanationText || "RailVoy AI analyzed route demand, seat cancellation velocity, and floor-protected pricing boundaries. All decisions keep the passenger in full control."}
            </p>
          </div>

          {/* Engine Highlights */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fleet Optimization Intelligence</h4>

            <div className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-800 flex items-start space-x-3">
              <Cpu className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-slate-200">Waitlist Confirmation Predictor</span>
                <p className="text-[11px] text-slate-400 mt-0.5">Predicts confirmation probability using historical cancellation trends and class-based seat allocation data.</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-800 flex items-start space-x-3">
              <DollarSign className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-slate-200">Government-Regulated Dynamic Pricing</span>
                <p className="text-[11px] text-slate-400 mt-0.5">Demand-based surge pricing capped strictly by the Ministry of Railways base fare floor rates.</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-800 flex items-start space-x-3">
              <ShieldCheck className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-slate-200">Network Seat Recycling</span>
                <p className="text-[11px] text-slate-400 mt-0.5">Cancelled and transferred seats are instantly reallocated to next-in-queue waitlist passengers.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-800">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
