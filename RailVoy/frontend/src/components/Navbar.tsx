import React, { useState, useEffect } from 'react';
import { Train, Search, Ticket, Activity, Shield, User as UserIcon, LogOut, Phone, Clock } from 'lucide-react';
import { User } from '../types';

interface NavbarProps {
  user: User | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  activeTab: 'search' | 'live' | 'tickets' | 'admin';
  setActiveTab: (tab: 'search' | 'live' | 'tickets' | 'admin') => void;
  unreadAlertsCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onOpenAuth,
  onLogout,
  activeTab,
  setActiveTab,
  unreadAlertsCount
}) => {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' IST');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full shadow-md bg-white">
      {/* Top Official Railway Strip */}
      <div className="bg-slate-100 px-4 sm:px-8 py-1.5 border-b border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1.5 font-bold text-sky-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>CRIS &amp; NTES Integrated Network</span>
          </span>
          <span className="hidden md:inline text-slate-300">|</span>
          <span className="hidden md:inline text-slate-500 font-medium">
            Government of India &bull; Ministry of Railways
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5 text-sky-800 font-mono font-bold">
            <Clock className="w-3.5 h-3.5 text-sky-600" />
            <span>{timeStr || '12:00:00 IST'}</span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="hidden sm:flex items-center space-x-1 text-slate-700">
            <Phone className="w-3 h-3 text-orange-600" />
            <span>Helpline: <strong className="text-orange-600 font-mono">139</strong></span>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar — Where is My Train / IRCTC Blue Banner */}
      <div className="bg-gradient-to-r from-sky-700 via-sky-800 to-blue-900 border-b border-sky-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-18 flex items-center justify-between">
          
          {/* Brand Logo & IRCTC Badge */}
          <div 
            onClick={() => setActiveTab('search')} 
            className="flex items-center space-x-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-2xl bg-white p-0.5 shadow-md group-hover:scale-105 transition-all flex items-center justify-center">
              <div className="w-full h-full bg-sky-700 rounded-[14px] flex items-center justify-center">
                <Train className="w-5 h-5 text-amber-300" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl sm:text-2xl font-black tracking-wider text-white">
                  Rail<span className="text-amber-300">Voy</span>
                </span>
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 shadow-sm">
                  LIVE SYNC
                </span>
              </div>
              <p className="text-[10px] text-sky-200 font-medium hidden sm:block">National Railway Passenger Reservation System</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 sm:space-x-1.5 bg-sky-950/40 p-1.5 rounded-2xl border border-sky-600/50 backdrop-blur-sm">
            <button
              onClick={() => setActiveTab('search')}
              className={`flex items-center space-x-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'search'
                  ? 'bg-white text-sky-800 shadow-md'
                  : 'text-sky-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <Search className="w-4 h-4 text-amber-400" />
              <span>Book Ticket</span>
            </button>

            <button
              onClick={() => setActiveTab('live')}
              className={`flex items-center space-x-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all relative ${
                activeTab === 'live'
                  ? 'bg-white text-sky-800 shadow-md'
                  : 'text-sky-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>NTES Live Tracker</span>
              {unreadAlertsCount > 0 && (
                <span className="w-4 h-4 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse">
                  {unreadAlertsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('tickets')}
              className={`flex items-center space-x-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'tickets'
                  ? 'bg-white text-sky-800 shadow-md'
                  : 'text-sky-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <Ticket className="w-4 h-4 text-amber-300" />
              <span>e-Tickets &amp; PNR</span>
            </button>

            {user?.role === 'admin' && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`flex items-center space-x-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  activeTab === 'admin'
                    ? 'bg-white text-sky-800 shadow-md'
                    : 'text-sky-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <Shield className="w-4 h-4 text-purple-300" />
                <span className="hidden md:inline">Operations Centre</span>
              </button>
            )}
          </nav>

          {/* User Profile / Login Button */}
          <div className="flex items-center space-x-3">
            {user ? (
              <div className="flex items-center space-x-3 bg-white/10 border border-sky-400/40 px-3.5 py-1.5 rounded-2xl backdrop-blur-sm">
                <div className="w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center text-slate-900 text-xs font-black shadow-sm">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-xs font-bold text-white leading-tight">{user.name}</p>
                  <p className="text-[10px] text-emerald-300 font-semibold">Account verified</p>
                </div>
                <button
                  onClick={onLogout}
                  title="Logout"
                  className="p-1.5 text-sky-200 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-md transition-all hover:scale-105 active:scale-95"
              >
                <UserIcon className="w-4 h-4" />
                <span>Sign In / Register</span>
              </button>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};
