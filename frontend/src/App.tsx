import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Navbar } from './components/Navbar';
import { AuthModal } from './components/AuthModal';
import { TrainSearch } from './components/TrainSearch';
import { TrainCard } from './components/TrainCard';
import { SeatMatrixModal } from './components/SeatMatrixModal';
import { BookingModal } from './components/BookingModal';
import { PaymentModal } from './components/PaymentModal';
import { TicketViewer } from './components/TicketViewer';
import { LiveTracker } from './components/LiveTracker';
import { AIInsightsDrawer } from './components/AIInsightsDrawer';
import { AdminDashboard } from './components/AdminDashboard';
import { Station, TrainSearchResult, User, Booking } from './types';
import { Sparkles, AlertCircle, ArrowUpDown, Filter, RotateCcw } from 'lucide-react';

export const App: React.FC = () => {
  // Navigation & User State
  const [activeTab, setActiveTab] = useState<'search' | 'live' | 'tickets' | 'admin'>('search');
  const [user, setUser] = useState<User | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Data & Search States
  const [stations, setStations] = useState<Station[]>([]);
  const [searchResults, setSearchResults] = useState<TrainSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [sortBy, setSortBy] = useState<'earliest' | 'fare' | 'odds' | 'fastest'>('earliest');
  const [selectedTrainType, setSelectedTrainType] = useState<string>('all');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('all');

  // Modal States
  const [selectedTrain, setSelectedTrain] = useState<TrainSearchResult | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>('3A');
  const [isSeatModalOpen, setIsSeatModalOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [bookingFormData, setBookingFormData] = useState<any>(null);

  // Ticket & Security States
  const [latestBooking, setLatestBooking] = useState<Booking | null>(null);
  const [latestPasscode, setLatestPasscode] = useState<string>('');
  const [userBookings, setUserBookings] = useState<Booking[]>([]);
  const [bookingError, setBookingError] = useState<string>('');
  const [isBookingConfirmOpen, setIsBookingConfirmOpen] = useState(false);

  // AI & Live Socket States
  const [aiExplanation, setAiExplanation] = useState<string>('');
  const [isAIDrawerOpen, setIsAIDrawerOpen] = useState(false);
  const [socketAlert, setSocketAlert] = useState<string>('');

  // Hydrate user session & load stations
  useEffect(() => {
    // Fetch Stations
    axios.get('/api/trains/stations')
      .then(res => setStations(res.data))
      .catch(err => console.error('Failed to load stations:', err));

    // Connect Socket.IO
    const socket = io();
    socket.on('delay_alert', (data: any) => {
      setSocketAlert(`Live Alert: Train #${data.trainNo} is ${data.status}`);
      setTimeout(() => setSocketAlert(''), 8000);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Fetch bookings when user logs in or switches to tickets tab
  useEffect(() => {
    if (user?.email) {
      axios.get('/api/bookings/my-bookings', { params: { email: user.email } })
        .then(res => setUserBookings(res.data))
        .catch(() => setUserBookings([]));
    }
  }, [user, activeTab]);

  // Handle Search
  const handleSearch = async (from: string, to: string, date: string, travelClass: string) => {
    const cleanFrom = from.trim();
    const cleanTo = to.trim();
    const cleanDate = date.trim();

    if (!cleanFrom || !cleanTo) {
      setHasSearched(true);
      setSearchResults([]);
      setSearchError('Please select both departure and arrival stations.');
      return;
    }

    if (cleanFrom === cleanTo) {
      setHasSearched(true);
      setSearchResults([]);
      setSearchError('Departure and arrival stations must be different.');
      return;
    }

    if (!cleanDate) {
      setHasSearched(true);
      setSearchResults([]);
      setSearchError('Please choose a valid travel date.');
      return;
    }

    const selectedDate = new Date(`${cleanDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      setHasSearched(true);
      setSearchResults([]);
      setSearchError('Travel date cannot be in the past.');
      return;
    }

    setSearchLoading(true);
    setHasSearched(true);
    setSearchError('');
    try {
      const res = await axios.get('/api/trains/search', {
        params: { from: cleanFrom, to: cleanTo, date: cleanDate, travelClass }
      });
      setSearchResults(res.data.trains || []);
      if ((res.data.trains || []).length === 0) {
        setSearchError('No direct trains found for the selected route. Try another station pair or date.');
      }
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResults([]);
      setSearchError('Search failed. Please try again in a moment.');
    } finally {
      setSearchLoading(false);
    }
  };

  // Filtered search results by Train Type and Departure Time Slot
  const filteredSearchResults = searchResults.filter(train => {
    // 1. Train Type filter
    if (selectedTrainType !== 'all') {
      const typeStr = (train.trainType || '').toLowerCase();
      const nameStr = (train.trainName || '').toLowerCase();
      const target = selectedTrainType.toLowerCase();
      if (!typeStr.includes(target) && !nameStr.includes(target)) {
        return false;
      }
    }

    // 2. Time Slot filter
    if (selectedTimeSlot !== 'all') {
      const hour = parseInt((train.departureTime || '00:00').split(':')[0], 10);
      if (selectedTimeSlot === 'early-morning' && (hour < 0 || hour >= 6)) return false;
      if (selectedTimeSlot === 'morning' && (hour < 6 || hour >= 12)) return false;
      if (selectedTimeSlot === 'afternoon' && (hour < 12 || hour >= 18)) return false;
      if (selectedTimeSlot === 'night' && hour < 18) return false;
    }

    return true;
  });

  // Sorted search results
  const sortedSearchResults = [...filteredSearchResults].sort((a, b) => {
    if (sortBy === 'fare') return (a.fare?.finalFare || 0) - (b.fare?.finalFare || 0);
    if (sortBy === 'odds') return (b.confirmationProbability || 0) - (a.confirmationProbability || 0);
    if (sortBy === 'fastest') return (a.distanceKm || 0) - (b.distanceKm || 0);
    return (a.departureTime || '').localeCompare(b.departureTime || '');
  });

  // Auth Handlers
  const handleLoginSuccess = (userData: User, token: string) => {
    setUser(userData);
    localStorage.setItem('railvoy_token', token);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('railvoy_token');
  };

  // Booking Flow
  const handleBookNow = (train: TrainSearchResult) => {
    setSelectedTrain(train);
    setIsBookingModalOpen(true);
  };

  const handleProceedToPayment = (formData: any) => {
    setBookingFormData(formData);
    setIsBookingModalOpen(false);
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSuccess = async (paymentResult: any) => {
    setIsPaymentModalOpen(false);
    setBookingError('');
    try {
      const payload = {
        ...bookingFormData,
        paymentGateway: paymentResult.transactionId ? 'RailVoy Pay' : (paymentResult.gateway || 'RailVoy Pay'),
        transactionId: paymentResult.transactionId
      };
      const res = await axios.post('/api/bookings/create', payload);

      setLatestBooking(res.data.booking);
      setLatestPasscode(res.data.securityPasscode);
      setIsBookingConfirmOpen(true);
      setActiveTab('tickets');

      // Refresh user bookings list
      if (user?.email) {
        axios.get('/api/bookings/my-bookings', { params: { email: user.email } })
          .then(r => setUserBookings(r.data))
          .catch(() => {});
      }
    } catch (err: any) {
      console.error('Booking Creation Failed:', err);
      // Auto-refund if payment was already deducted
      if (paymentResult?.bankDeduction?.deducted && bookingFormData?.userEmail) {
        try {
          await axios.post('/api/banking/refund', {
            email: bookingFormData.userEmail,
            amount: paymentResult.bankDeduction.deducted,
            reason: 'Booking creation failed — automatic refund'
          });
          setBookingError(
            `Booking failed and ₹${paymentResult.bankDeduction.deducted} has been automatically refunded to your account. ` +
            (err.response?.data?.error || 'Please try again.')
          );
        } catch (refundErr) {
          setBookingError(
            `Booking failed. Refund of ₹${paymentResult.bankDeduction.deducted} is being processed. ` +
            'Please contact support if not credited within 24 hours.'
          );
        }
      } else {
        const msg = err.response?.data?.error || '';
        if (!navigator.onLine) {
          setBookingError('Network error: No internet connection. Please check your connection and try again.');
        } else if (err.code === 'ECONNABORTED') {
          setBookingError('Request timed out. Please try again.');
        } else {
          setBookingError(msg || 'Booking failed. Please try again or contact support.');
        }
      }
      setIsBookingConfirmOpen(false);
      setIsPaymentModalOpen(true); // re-open payment for retry info
    }
  };

  const handleShowAIExplanation = (exp: string) => {
    setAiExplanation(exp);
    setIsAIDrawerOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Navbar */}
      <Navbar
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unreadAlertsCount={socketAlert ? 1 : 0}
      />

      {/* Socket.IO Live Banner Alert */}
      {socketAlert && (
        <div className="bg-gradient-to-r from-amber-600 to-rose-600 text-white text-xs font-bold py-2 px-4 text-center flex items-center justify-center space-x-2 animate-bounce">
          <AlertCircle className="w-4 h-4" />
          <span>{socketAlert}</span>
        </div>
      )}

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* TAB 1: SEARCH & BOOKING */}
        {activeTab === 'search' && (
          <div className="space-y-8">
            
            {/* Search Box */}
            <TrainSearch
              stations={stations}
              onSearch={handleSearch}
              loading={searchLoading}
              selectedTrainType={selectedTrainType}
              onSelectTrainType={setSelectedTrainType}
              selectedTimeSlot={selectedTimeSlot}
              onSelectTimeSlot={setSelectedTimeSlot}
            />

            {/* Results Section */}
            {hasSearched && (
              <div className="space-y-4">
                {searchError && (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    {searchError}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-lg font-bold text-slate-200">
                      Available Trains &amp; Dynamic Fares ({sortedSearchResults.length}{searchResults.length !== sortedSearchResults.length ? ` / ${searchResults.length}` : ''})
                    </h3>
                    {(selectedTrainType !== 'all' || selectedTimeSlot !== 'all') && (
                      <button
                        onClick={() => { setSelectedTrainType('all'); setSelectedTimeSlot('all'); }}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold border border-slate-700 transition-colors"
                        title="Clear filters"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset Filters</span>
                      </button>
                    )}
                  </div>

                  {/* Filter & Sort Controls */}
                  {searchResults.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Train Type Filter Selector */}
                      <div className="flex items-center space-x-1.5 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
                        <Filter className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-slate-400 font-semibold hidden sm:inline">Type:</span>
                        <select
                          value={selectedTrainType}
                          onChange={e => setSelectedTrainType(e.target.value)}
                          className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer"
                        >
                          <option value="all" className="bg-slate-900">All Train Types</option>
                          <option value="Vande Bharat" className="bg-slate-900">Vande Bharat</option>
                          <option value="Rajdhani" className="bg-slate-900">Rajdhani Express</option>
                          <option value="Tejas" className="bg-slate-900">Tejas Express</option>
                          <option value="Garib Rath" className="bg-slate-900">Garib Rath</option>
                          <option value="Shatabdi" className="bg-slate-900">Shatabdi Express</option>
                          <option value="Sachkhand" className="bg-slate-900">Sachkhand Express</option>
                          <option value="Superfast" className="bg-slate-900">Superfast</option>
                        </select>
                      </div>

                      {/* Departure Time Selector */}
                      <div className="flex items-center space-x-1.5 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
                        <span className="text-slate-400 font-semibold hidden sm:inline">Time:</span>
                        <select
                          value={selectedTimeSlot}
                          onChange={e => setSelectedTimeSlot(e.target.value)}
                          className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer"
                        >
                          <option value="all" className="bg-slate-900">All Departure Times</option>
                          <option value="early-morning" className="bg-slate-900">Early Morning (00-06)</option>
                          <option value="morning" className="bg-slate-900">Morning (06-12)</option>
                          <option value="afternoon" className="bg-slate-900">Afternoon (12-18)</option>
                          <option value="night" className="bg-slate-900">Night (18-24)</option>
                        </select>
                      </div>

                      {/* Sort Controls */}
                      <div className="flex items-center space-x-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs">
                        <span className="text-slate-400 font-semibold px-2 flex items-center space-x-1">
                          <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400" />
                          <span className="hidden sm:inline">Sort:</span>
                        </span>
                        <button
                          onClick={() => setSortBy('earliest')}
                          className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                            sortBy === 'earliest' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Earliest
                        </button>
                        <button
                          onClick={() => setSortBy('fare')}
                          className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                            sortBy === 'fare' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Lowest Fare
                        </button>
                        <button
                          onClick={() => setSortBy('odds')}
                          className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                            sortBy === 'odds' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Highest Odds
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {searchResults.length === 0 ? (
                  <div className="glass-panel p-12 text-center rounded-3xl border border-slate-800">
                    <p className="text-slate-400 font-medium">No direct trains found for selected route.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sortedSearchResults.map(train => (
                      <TrainCard
                        key={train.trainNo}
                        train={train}
                        onSelectSeats={(t) => {
                          setSelectedTrain(t);
                          setSelectedClass((t as any).travelClass || '3A');
                          setIsSeatModalOpen(true);
                        }}
                        onBookNow={handleBookNow}
                        onShowAIExplanation={handleShowAIExplanation}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* TAB 2: WHERE IS MY TRAIN / LIVE TRACKER */}
        {activeTab === 'live' && (
          <LiveTracker
            trainNo={selectedTrain?.trainNo || ''}
            onTransferTicket={(pnr, newTrainNo, newTrainName) => {
              setActiveTab('tickets');
            }}
            activePnr={latestBooking?.pnr}
          />
        )}

        {/* TAB 3: e-TICKETS & PNR PORTAL */}
        {activeTab === 'tickets' && (
          <TicketViewer newBooking={latestBooking} newPasscode={latestPasscode} />
        )}

        {/* TAB 4: ADMIN DASHBOARD */}
        {activeTab === 'admin' && (
          <AdminDashboard />
        )}

      </main>

      {/* Modals & Drawers */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      <SeatMatrixModal
        train={selectedTrain}
        selectedClass={selectedClass}
        isOpen={isSeatModalOpen}
        onClose={() => setIsSeatModalOpen(false)}
        onConfirmSelection={() => {
          setIsSeatModalOpen(false);
          if (selectedTrain) handleBookNow(selectedTrain);
        }}
      />

      <BookingModal
        train={selectedTrain}
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        onProceedToPayment={handleProceedToPayment}
        userEmail={user?.email || ''}
      />

      <PaymentModal
        bookingData={bookingFormData}
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onPaymentSuccess={handlePaymentSuccess}
        userEmail={user?.email || ''}
      />

      <AIInsightsDrawer
        isOpen={isAIDrawerOpen}
        onClose={() => setIsAIDrawerOpen(false)}
        explanationText={aiExplanation}
      />

      {/* ── Booking Confirmation Modal ── */}
      {isBookingConfirmOpen && latestBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-lg">
          <div className="relative w-full max-w-md bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl border border-emerald-500/30 shadow-2xl p-7 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 mb-3">
                <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 className="text-xl font-black text-emerald-400">Booking Confirmed!</h3>
              <p className="text-xs text-slate-400 mt-1">Your e-ticket has been generated. Save your credentials below.</p>
            </div>

            {/* PNR + Passcode */}
            <div className="space-y-3 mb-5">
              <div className="bg-slate-800/70 rounded-2xl border border-slate-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider">PNR Number</span>
                  <span className="text-xs text-emerald-400 font-semibold">Save this!</span>
                </div>
                <div className="text-2xl font-black text-cyan-300 font-mono tracking-widest">{latestBooking.pnr}</div>
              </div>
              <div className="bg-slate-800/70 rounded-2xl border border-amber-600/30 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider">Security Passcode</span>
                  <span className="text-xs text-amber-400 font-semibold">Shown once only</span>
                </div>
                <div className="text-3xl font-black text-amber-300 font-mono tracking-[0.4em]">{latestPasscode}</div>
                <p className="text-[10px] text-slate-500 mt-2">Required to download your ticket later. Also sent to your email.</p>
              </div>
            </div>

            {/* Journey summary */}
            <div className="bg-slate-800/40 rounded-xl border border-slate-700/60 p-3 mb-5 text-xs flex items-center justify-between">
              <div><span className="text-slate-400">From</span><div className="font-bold text-slate-200">{latestBooking.fromStation}</div></div>
              <div className="flex-1 border-t-2 border-dashed border-slate-600 mx-3" />
              <div className="text-center"><span className="text-slate-400">Status</span><div className={`font-bold ${latestBooking.status === 'Confirmed' ? 'text-emerald-400' : 'text-amber-400'}`}>{latestBooking.status}</div></div>
              <div className="flex-1 border-t-2 border-dashed border-slate-600 mx-3" />
              <div className="text-right"><span className="text-slate-400">To</span><div className="font-bold text-slate-200">{latestBooking.toStation}</div></div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => { setIsBookingConfirmOpen(false); setActiveTab('tickets'); }}
                className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-sm rounded-xl transition-all"
              >
                View & Download Ticket
              </button>
              <button
                onClick={() => setIsBookingConfirmOpen(false)}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm text-slate-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Booking Error Banner ── */}
      {bookingError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
          <div className="bg-rose-950 border border-rose-700 rounded-2xl p-4 shadow-2xl flex items-start space-x-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <svg className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            <div className="flex-1">
              <p className="text-sm font-bold text-rose-300 mb-0.5">Booking Error</p>
              <p className="text-xs text-rose-400/80 leading-relaxed">{bookingError}</p>
            </div>
            <button onClick={() => setBookingError('')} className="text-rose-500 hover:text-rose-300 text-xl leading-none">&times;</button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} RailVoy — Intelligent Railway Transit &amp; Ticket Reservation Platform. All rights reserved.</p>
      </footer>

    </div>
  );
};
