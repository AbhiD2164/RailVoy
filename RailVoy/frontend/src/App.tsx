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
  const [searchDate, setSearchDate] = useState<string>(new Date().toISOString().split('T')[0]);

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
  const [passengerRecommendation, setPassengerRecommendation] = useState<any>(null);

  // Hydrate user session & load stations
  useEffect(() => {
    // Restore session from localStorage across page refreshes
    const savedToken = localStorage.getItem('railvoy_token');
    if (savedToken) {
      axios.defaults.headers.common.Authorization = `Bearer ${savedToken}`;
      axios.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${savedToken}` }
      })
      .then(res => {
        if (res.data?.user) {
          setUser(res.data.user);
        }
      })
      .catch(() => {
        localStorage.removeItem('railvoy_token');
      });
    }

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

  // Suggestions are derived only from this passenger's persisted active tickets.
  // No booking-purpose or inferred personal intent is stored or sent.
  useEffect(() => {
    const activeBooking = userBookings.find(booking => ['Confirmed', 'RAC'].includes(booking.status));
    if (!activeBooking) {
      setPassengerRecommendation(null);
      return;
    }

    axios.get(`/api/trains/${activeBooking.trainNo}/live-status`)
      .then(res => {
        const replan = res.data?.aiReplan || res.data?.aiReplanning;
        if (replan?.recommendationAvailable && replan.alternativeTrains?.length) {
          setPassengerRecommendation({ booking: activeBooking, replan, train: res.data });
        } else {
          setPassengerRecommendation(null);
        }
      })
      .catch(() => setPassengerRecommendation(null));
  }, [userBookings]);

  // Handle Search
  const handleSearch = async (from: string, to: string, date: string, travelClass: string, trainNumber?: string) => {
    const cleanFrom = from.trim();
    const cleanTo = to.trim();
    const cleanDate = date.trim();

    if (!trainNumber && (!cleanFrom || !cleanTo)) {
      setHasSearched(true);
      setSearchResults([]);
      setSearchError('Please select both departure and arrival stations.');
      return;
    }

    if (!trainNumber && cleanFrom === cleanTo) {
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
    setSearchDate(cleanDate);
    try {
      const res = await axios.get('/api/trains/search', {
        params: { from: cleanFrom, to: cleanTo, trainNo: trainNumber, date: cleanDate, travelClass }
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

    // 2. Time Slot filter (Includes delayed trains still running in slot, excludes trains delayed past slot)
    if (selectedTimeSlot !== 'all') {
      const [schedH, schedM] = (train.departureTime || '00:00').split(':').map(Number);
      const scheduledMinutes = (schedH || 0) * 60 + (schedM || 0);
      const delayMins = Number(train.currentDelayMinutes || (train as any).delayMinutes || (train as any).delay || 0);
      // Effective actual departure time accounting for train delays
      const effectiveMinutes = (scheduledMinutes + delayMins) % (24 * 60);
      const effectiveHour = Math.floor(effectiveMinutes / 60);

      if (selectedTimeSlot === 'early-morning' && (effectiveHour < 0 || effectiveHour >= 6)) return false;
      if (selectedTimeSlot === 'morning' && (effectiveHour < 6 || effectiveHour >= 12)) return false;
      if (selectedTimeSlot === 'afternoon' && (effectiveHour < 12 || effectiveHour >= 18)) return false;
      if (selectedTimeSlot === 'night' && (effectiveHour < 18 || effectiveHour >= 24)) return false;
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
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('railvoy_token');
    delete axios.defaults.headers.common.Authorization;
  };

  const [bookingAuthWarning, setBookingAuthWarning] = useState('');

  // Booking Flow
  const handleBookNow = (train: TrainSearchResult) => {
    if (!user) {
      setBookingAuthWarning('Please sign in to access the reservation booking panel. You can sign in using your universal Railway User ID or Google.');
      setIsAuthOpen(true);
      return;
    }
    setBookingAuthWarning('');
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
          const refundRes = await axios.post('/api/banking/refund', {
            email: bookingFormData.userEmail,
            amount: paymentResult.bankDeduction.deducted,
            // Pass wallet identifier so the gateway can locate the exact wallet to credit
            walletIdentifier: paymentResult.identifier || bookingFormData.payWalletId || bookingFormData.userEmail,
            reason: 'Booking creation failed — automatic refund'
          });
          const refundMsg = refundRes.data?.walletCredited
            ? `₹${paymentResult.bankDeduction.deducted} has been automatically refunded to your RailVoy Pay wallet.`
            : `Your refund of ₹${paymentResult.bankDeduction.deducted} is being processed and will appear shortly.`;
          setBookingError(
            `Booking could not be confirmed. ${refundMsg} ` +
            (err.response?.data?.error || 'Please try again.')
          );
        } catch (refundErr) {
          setBookingError(
            `Booking failed. Refund of ₹${paymentResult.bankDeduction.deducted} is being processed. ` +
            'Please check your RailVoy Pay balance or contact support if not credited within 24 hours.'
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
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans">
      
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
        <div className="bg-gradient-to-r from-amber-500 to-rose-600 text-white text-xs font-bold py-2.5 px-4 text-center flex items-center justify-center space-x-2 shadow-sm">
          <AlertCircle className="w-4 h-4" />
          <span>{socketAlert}</span>
        </div>
      )}

      {passengerRecommendation && (
        <div className="mx-auto mt-4 w-[calc(100%-2rem)] max-w-7xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-extrabold text-amber-950">
                  Train #{passengerRecommendation.booking.trainNo} has a delay of {passengerRecommendation.replan.delayMinutes} minutes.
                </p>
                <p className="text-xs text-amber-800">
                  AI found {passengerRecommendation.replan.alternativeTrains.length} same-route option(s) with seats in the simulated timetable.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('live')}
              className="rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-amber-700"
            >
              Review options
            </button>
          </div>
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
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
                    {searchError}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-lg font-extrabold text-slate-900">
                      Available Trains &amp; Dynamic Fares ({sortedSearchResults.length}{searchResults.length !== sortedSearchResults.length ? ` / ${searchResults.length}` : ''})
                    </h3>
                    {(selectedTrainType !== 'all' || selectedTimeSlot !== 'all') && (
                      <button
                        onClick={() => { setSelectedTrainType('all'); setSelectedTimeSlot('all'); }}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-sky-700 text-xs font-bold border border-slate-300 shadow-sm transition-colors"
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
                      <div className="flex items-center space-x-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-300 shadow-sm text-xs">
                        <Filter className="w-3.5 h-3.5 text-sky-600" />
                        <span className="text-slate-600 font-semibold hidden sm:inline">Type:</span>
                        <select
                          value={selectedTrainType}
                          onChange={e => setSelectedTrainType(e.target.value)}
                          className="bg-transparent text-slate-900 font-semibold focus:outline-none cursor-pointer"
                        >
                          <option value="all">All Train Types</option>
                          <option value="Vande Bharat">Vande Bharat</option>
                          <option value="Rajdhani">Rajdhani Express</option>
                          <option value="Tejas">Tejas Express</option>
                          <option value="Garib Rath">Garib Rath</option>
                          <option value="Shatabdi">Shatabdi Express</option>
                          <option value="Sachkhand">Sachkhand Express</option>
                          <option value="Superfast">Superfast</option>
                        </select>
                      </div>

                      {/* Departure Time Selector */}
                      <div className="flex items-center space-x-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-300 shadow-sm text-xs">
                        <span className="text-slate-600 font-semibold hidden sm:inline">Time:</span>
                        <select
                          value={selectedTimeSlot}
                          onChange={e => setSelectedTimeSlot(e.target.value)}
                          className="bg-transparent text-slate-900 font-semibold focus:outline-none cursor-pointer"
                        >
                          <option value="all">All Departure Times</option>
                          <option value="early-morning">Early Morning (00-06)</option>
                          <option value="morning">Morning (06-12)</option>
                          <option value="afternoon">Afternoon (12-18)</option>
                          <option value="night">Night (18-24)</option>
                        </select>
                      </div>

                      {/* Sort Controls */}
                      <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border border-slate-300 shadow-sm text-xs">
                        <span className="text-slate-600 font-semibold px-2 flex items-center space-x-1">
                          <ArrowUpDown className="w-3.5 h-3.5 text-sky-600" />
                          <span className="hidden sm:inline">Sort:</span>
                        </span>
                        <button
                          onClick={() => setSortBy('earliest')}
                          className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                            sortBy === 'earliest' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          Earliest
                        </button>
                        <button
                          onClick={() => setSortBy('fare')}
                          className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                            sortBy === 'fare' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          Lowest Fare
                        </button>
                        <button
                          onClick={() => setSortBy('odds')}
                          className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                            sortBy === 'odds' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          Highest Odds
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {searchResults.length === 0 ? (
                  <div className="bg-white p-12 text-center rounded-3xl border border-slate-200 shadow-sm">
                    <p className="text-slate-600 font-medium">No direct trains found for selected route.</p>
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
          user && user.role === 'admin' ? (
            <AdminDashboard />
          ) : (
            <div className="max-w-md mx-auto my-12 bg-white p-8 rounded-3xl border border-slate-200 shadow-xl text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Restricted Administration Operations</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Only authorized Indian Railway administrators with the admin role can access train scheduling, coach composition, and pantry car configuration.
                </p>
              </div>
              <button
                onClick={() => setIsAuthOpen(true)}
                className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
              >
                Sign In with Administrator Clearance
              </button>
            </div>
          )
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
        travelDate={searchDate}
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
        travelDate={searchDate}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl p-7 animate-in fade-in zoom-in-95 duration-200 text-slate-900">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-400 mb-3">
                <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 className="text-xl font-black text-slate-900">Booking Confirmed!</h3>
              <p className="text-xs text-slate-500 mt-1">Your official e-ticket has been generated. Save your credentials below.</p>
            </div>

            {/* PNR + Passcode */}
            <div className="space-y-3 mb-5">
              <div className="bg-sky-50/80 rounded-2xl border border-sky-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-600 uppercase font-bold tracking-wider">PNR Number</span>
                  <span className="text-xs text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">Guaranteed</span>
                </div>
                <div className="text-2xl font-black text-sky-800 font-mono tracking-widest">{latestBooking.pnr}</div>
              </div>
              <div className="bg-amber-50/80 rounded-2xl border border-amber-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-600 uppercase font-bold tracking-wider">Security Passcode</span>
                  <span className="text-xs text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded-full">Save This</span>
                </div>
                <div className="text-3xl font-black text-amber-900 font-mono tracking-[0.35em]">{latestPasscode}</div>
                <p className="text-[11px] text-slate-500 mt-2">Required to view &amp; print your ticket. Also sent to your registered email.</p>
              </div>
            </div>

            {/* Journey summary */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-3.5 mb-5 text-xs flex items-center justify-between">
              <div><span className="text-slate-500 block text-[10px] uppercase font-bold">From</span><div className="font-extrabold text-slate-800">{latestBooking.fromStation}</div></div>
              <div className="flex-1 border-t-2 border-dashed border-slate-300 mx-3" />
              <div className="text-center"><span className="text-slate-500 block text-[10px] uppercase font-bold">Status</span><div className={`font-extrabold ${latestBooking.status === 'Confirmed' ? 'text-emerald-700' : 'text-amber-700'}`}>{latestBooking.status}</div></div>
              <div className="flex-1 border-t-2 border-dashed border-slate-300 mx-3" />
              <div className="text-right"><span className="text-slate-500 block text-[10px] uppercase font-bold">To</span><div className="font-extrabold text-slate-800">{latestBooking.toStation}</div></div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => { setIsBookingConfirmOpen(false); setActiveTab('tickets'); }}
                className="flex-1 py-3 bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-sm rounded-xl shadow-md transition-all"
              >
                View &amp; Download Ticket
              </button>
              <button
                onClick={() => setIsBookingConfirmOpen(false)}
                className="px-4 py-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-sm font-bold text-slate-700 transition-colors"
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
          <div className="bg-white border border-rose-300 rounded-2xl p-4 shadow-xl flex items-start space-x-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <svg className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            <div className="flex-1">
              <p className="text-sm font-bold text-rose-800 mb-0.5">Booking Notice</p>
              <p className="text-xs text-slate-600 leading-relaxed">{bookingError}</p>
            </div>
            <button onClick={() => setBookingError('')} className="text-slate-400 hover:text-slate-700 text-xl leading-none">&times;</button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500 shadow-inner">
        <p className="font-medium">&copy; {new Date().getFullYear()} RailVoy — Indian Railways Transit &amp; AI Decision Platform.</p>
        <p className="text-[11px] text-slate-400 mt-1">Inspired by IRCTC, NTES &amp; Where is My Train. Engineered for fast, reliable railway travel.</p>
      </footer>

    </div>
  );
};
