import React, { useState, useEffect } from 'react';
import {
  Shield, TrendingUp, Activity, AlertTriangle, Send, RefreshCw,
  CheckCircle2, Tag, Plus, Trash2, Power, Percent, Ticket,
  ChevronDown, ChevronUp, Users, IndianRupee, Train as TrainIcon,
  DollarSign, FileText, Check, Edit3, X, ArrowRightLeft, Layers,
  MapPin, GitBranch, Route, ArrowRight
} from 'lucide-react';
import axios from 'axios';
import { AdminAdjustment, FareRule, TrainAdmin, Station } from '../types';

// ─── Coupon Types ───────────────────────────────────────────────────────────
interface Coupon {
  _id: string;
  code: string;
  discountType: 'flat' | 'percentage';
  discountValue: number;
  couponType: 'food' | 'fare' | 'upgrade' | 'general';
  targetTier: string;
  description: string;
  minFare: number;
  maxDiscount: number;
  validUntil: string;
  isActive: boolean;
  createdAt: string;
}

interface NewCouponForm {
  code: string;
  discountType: 'flat' | 'percentage';
  discountValue: string;
  couponType: 'food' | 'fare' | 'upgrade' | 'general';
  description: string;
  minFare: string;
  maxDiscount: string;
  validDays: string;
}

const defaultCouponForm: NewCouponForm = {
  code: '', discountType: 'flat', discountValue: '', couponType: 'fare',
  description: '', minFare: '0', maxDiscount: '', validDays: '90'
};

const CouponTypeBadge = ({ type }: { type: string }) => {
  const map: Record<string, string> = {
    food: 'bg-amber-900/60 text-amber-300 border-amber-800',
    fare: 'bg-cyan-900/60 text-cyan-300 border-cyan-800',
    upgrade: 'bg-purple-900/60 text-purple-300 border-purple-800',
    general: 'bg-slate-700 text-slate-300 border-slate-600',
  };
  return (
    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${map[type] || map.general}`}>
      {type}
    </span>
  );
};

export const AdminDashboard: React.FC = () => {
  // Navigation tabs within Operations Centre
  const [adminTab, setAdminTab] = useState<'analytics' | 'trains' | 'stations' | 'connectivity' | 'ledger' | 'rules' | 'delays' | 'coupons'>('analytics');

  // Analytics & Delay States
  const [analytics, setAnalytics] = useState<any>(null);
  const [trains, setTrains] = useState<any[]>([]);
  const [selectedTrainNo, setSelectedTrainNo] = useState('');
  const [delayMinutes, setDelayMinutes] = useState(45);
  const [delayMsg, setDelayMsg] = useState('');
  const [loadingDelay, setLoadingDelay] = useState(false);

  // Train Management States
  const [adminTrains, setAdminTrains] = useState<TrainAdmin[]>([]);
  const [trainsLoading, setTrainsLoading] = useState(false);
  const [trainMsg, setTrainMsg] = useState('');
  const [showAddTrain, setShowAddTrain] = useState(false);
  const [newTrain, setNewTrain] = useState({
    trainNo: '', trainName: '', trainType: 'Superfast',
    source: '', destination: '', pantryAvailable: true, hasPantrycar: true
  });
  const [editingCoachTrain, setEditingCoachTrain] = useState<TrainAdmin | null>(null);
  const [coachList, setCoachList] = useState<any[]>([]);

  // Station Management States
  const [stationsList, setStationsList] = useState<Station[]>([]);
  const [stationsLoading, setStationsLoading] = useState(false);
  const [stationMsg, setStationMsg] = useState('');
  const [newStation, setNewStation] = useState({ stationCode: '', stationName: '', state: '', zone: 'NR' });
  const [stationSearch, setStationSearch] = useState('');

  // Route Graph Connectivity States
  const [connFrom, setConnFrom] = useState('NDLS');
  const [connTo, setConnTo] = useState('SBC');
  const [connResult, setConnResult] = useState<any>(null);
  const [connLoading, setConnLoading] = useState(false);
  const [connMsg, setConnMsg] = useState('');

  // Fare Adjustment Ledger States
  const [adjustments, setAdjustments] = useState<AdminAdjustment[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerSummary, setLedgerSummary] = useState({ overdue: 0, pendingCredits: 0 });
  const [ledgerMsg, setLedgerMsg] = useState('');

  // Fare Rules States
  const [fareRules, setFareRules] = useState<FareRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesMsg, setRulesMsg] = useState('');
  const [editingRule, setEditingRule] = useState<FareRule | null>(null);

  // Coupons State
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [couponMsg, setCouponMsg] = useState('');
  const [showCreateCoupon, setShowCreateCoupon] = useState(false);
  const [couponForm, setCouponForm] = useState<NewCouponForm>(defaultCouponForm);
  const [creatingCoupon, setCreatingCoupon] = useState(false);

  // ── Fetchers ─────────────────────────────────────────────────────────────────
  const fetchAnalytics = async () => {
    try {
      const res = await axios.get('/api/admin/traffic-analytics');
      setAnalytics(res.data);
    } catch (err) {
      console.error('Analytics Error:', err);
    }
  };

  const fetchTrains = async () => {
    try {
      const res = await axios.get('/api/trains');
      if (Array.isArray(res.data) && res.data.length > 0) {
        setTrains(res.data);
        if (!selectedTrainNo) setSelectedTrainNo(res.data[0].trainNo);
      }
    } catch (err) { console.error('Trains Error:', err); }
  };

  const fetchAdminTrains = async () => {
    setTrainsLoading(true);
    try {
      const res = await axios.get('/api/admin/trains');
      setAdminTrains(res.data.trains || []);
    } catch (err) {
      console.error('Admin trains fetch error:', err);
    } finally {
      setTrainsLoading(false);
    }
  };

  const fetchLedger = async () => {
    setLedgerLoading(true);
    try {
      const res = await axios.get('/api/admin/adjustment-ledger');
      setAdjustments(res.data.adjustments || []);
      setLedgerSummary({
        overdue: res.data.totalOverdueRefunds || 0,
        pendingCredits: res.data.totalPendingCredits || 0
      });
    } catch (err) {
      console.error('Ledger fetch error:', err);
    } finally {
      setLedgerLoading(false);
    }
  };

  const fetchFareRules = async () => {
    setRulesLoading(true);
    try {
      const res = await axios.get('/api/admin/fare-rules');
      setFareRules(res.data.fareRules || []);
    } catch (err) {
      console.error('Fare rules fetch error:', err);
    } finally {
      setRulesLoading(false);
    }
  };

  const fetchCoupons = async () => {
    setCouponsLoading(true);
    try {
      const res = await axios.get('/api/admin/coupons');
      setCoupons(res.data.coupons || []);
    } catch (err) {
      console.error('Coupons fetch error:', err);
    } finally {
      setCouponsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    fetchTrains();
  }, []);

  const fetchStations = async () => {
    setStationsLoading(true);
    try {
      const res = await axios.get('/api/admin/stations');
      setStationsList(res.data);
    } catch (err) {
      console.error('Fetch stations error:', err);
    } finally {
      setStationsLoading(false);
    }
  };

  const handleAddStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStation.stationCode || !newStation.stationName || !newStation.state) {
      setStationMsg('All fields are mandatory.');
      return;
    }
    try {
      const res = await axios.post('/api/admin/stations', newStation);
      setStationMsg(res.data.message || 'Station saved successfully.');
      setNewStation({ stationCode: '', stationName: '', state: '', zone: 'NR' });
      fetchStations();
    } catch (err: any) {
      setStationMsg(err.response?.data?.error || 'Failed to save station.');
    }
  };

  const handleDeleteStation = async (code: string) => {
    if (!window.confirm(`Permanently remove station ${code}?`)) return;
    try {
      await axios.delete(`/api/admin/stations/${code}`);
      setStationMsg(`Station ${code} removed.`);
      fetchStations();
    } catch (err: any) {
      setStationMsg('Failed to delete station.');
    }
  };

  const handleCheckConnectivity = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!connFrom.trim() || !connTo.trim()) {
      setConnMsg('Both origin and destination codes are required.');
      return;
    }
    setConnLoading(true);
    setConnMsg('');
    setConnResult(null);
    try {
      const res = await axios.get('/api/admin/route-connectivity', {
        params: { from: connFrom.trim().toUpperCase(), to: connTo.trim().toUpperCase() }
      });
      setConnResult(res.data);
    } catch (err: any) {
      setConnMsg(err.response?.data?.error || 'Failed to evaluate connectivity.');
    } finally {
      setConnLoading(false);
    }
  };

  useEffect(() => {
    if (adminTab === 'trains') fetchAdminTrains();
    if (adminTab === 'stations') fetchStations();
    if (adminTab === 'connectivity' && !connResult) handleCheckConnectivity();
    if (adminTab === 'ledger') fetchLedger();
    if (adminTab === 'rules') fetchFareRules();
    if (adminTab === 'coupons') fetchCoupons();
  }, [adminTab]);

  // ── Delay Handlers ───────────────────────────────────────────────────────────
  const handleUpdateDelay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrainNo) return;
    setLoadingDelay(true);
    setDelayMsg('');
    try {
      await axios.post('/api/admin/update-delay', {
        trainNo: selectedTrainNo,
        delayMinutes: Number(delayMinutes),
        status: Number(delayMinutes) > 0 ? `Delayed by ${delayMinutes} mins` : 'On Time'
      });
      setDelayMsg(`Successfully updated Train #${selectedTrainNo} delay to ${delayMinutes} minutes! Live alerts broadcast.`);
      fetchTrains();
      fetchAnalytics();
    } catch (err: any) {
      setDelayMsg('Failed to update train delay.');
    } finally {
      setLoadingDelay(false);
    }
  };

  // ── Train Handlers ───────────────────────────────────────────────────────────
  const handleAddTrain = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/admin/trains/add', newTrain);
      setTrainMsg(`Train #${newTrain.trainNo} added successfully.`);
      setShowAddTrain(false);
      setNewTrain({ trainNo: '', trainName: '', trainType: 'Superfast', source: '', destination: '', pantryAvailable: true, hasPantrycar: true });
      fetchAdminTrains();
    } catch (err: any) {
      setTrainMsg(err.response?.data?.error || 'Failed to add train.');
    }
  };

  const handleDeleteTrain = async (trainNo: string) => {
    if (!window.confirm(`Are you sure you want to delete Train #${trainNo}?`)) return;
    try {
      await axios.delete(`/api/admin/trains/${trainNo}`);
      setTrainMsg(`Train #${trainNo} deleted.`);
      fetchAdminTrains();
    } catch (err) {
      setTrainMsg('Failed to delete train.');
    }
  };

  const handleOpenCoachEditor = (train: TrainAdmin) => {
    setEditingCoachTrain(train);
    const existing = train.coachComposition || [
      { code: 'GS1', type: 'GS', position: 1, seats: 80, farePerPassenger: 0 },
      { code: 'S1',  type: 'SL', position: 2, seats: 72, farePerPassenger: 0 },
      { code: 'B1',  type: '3A', position: 3, seats: 72, farePerPassenger: 0 },
      { code: 'PC',  type: 'PC', position: 4, seats: 0, farePerPassenger: 0 },
      { code: 'A1',  type: '2A', position: 5, seats: 52, farePerPassenger: 0 },
      { code: 'H1',  type: '1A', position: 6, seats: 24, farePerPassenger: 0 }
    ];
    setCoachList(existing.map((c: any, i: number) => typeof c === 'string' ? { code: c, type: c, position: i + 1, seats: 72 } : c));
  };

  const handleSaveCoaches = async () => {
    if (!editingCoachTrain) return;

    // Compulsory Locomotive Engine verification
    const hasEngine = coachList.some(c => c.type === 'ENG' || (c.code || '').toUpperCase().startsWith('ENG') || (c.code || '').toUpperCase().startsWith('WAP') || (c.code || '').toUpperCase().startsWith('WDP'));
    let finalCoaches = [...coachList];
    if (!hasEngine) {
      // Compulsorily prepend lead locomotive engine
      finalCoaches.unshift({
        code: 'ENG-1',
        type: 'ENG',
        position: 1,
        seats: 0,
        farePerPassenger: 0
      });
      finalCoaches = finalCoaches.map((c, i) => ({ ...c, position: i + 1 }));
      setCoachList(finalCoaches);
    }

    // Optional Pantry Car check
    const hasPantry = finalCoaches.some(c => c.type === 'PC' || (c.code || '').toUpperCase().startsWith('PC'));

    try {
      await axios.post(`/api/admin/trains/${editingCoachTrain.trainNo}/coaches`, {
        coachComposition: finalCoaches,
        pantryAvailable: hasPantry
      });
      setTrainMsg(`Coach composition updated for Train #${editingCoachTrain.trainNo} — Locomotive: Connected (Compulsory) | Pantry Car: ${hasPantry ? 'Attached' : 'Not Attached (No Catering)'}`);
      setEditingCoachTrain(null);
      fetchAdminTrains();
    } catch (err: any) {
      setTrainMsg(err.response?.data?.error || 'Failed to update coach composition.');
    }
  };

  // ── Ledger Handlers ──────────────────────────────────────────────────────────
  const handleSettleAdjustment = async (id: string) => {
    try {
      await axios.patch(`/api/admin/adjustment/${id}/settle`, {
        settledBy: 'admin@railvoy.com',
        note: 'Settled by operations centre'
      });
      setLedgerMsg('Adjustment marked as settled.');
      fetchLedger();
    } catch (err) {
      setLedgerMsg('Settlement failed.');
    }
  };

  // ── Fare Rules Handlers ──────────────────────────────────────────────────────
  const handleSaveFareRule = async () => {
    if (!editingRule) return;
    try {
      await axios.patch('/api/admin/fare-rules', editingRule);
      setRulesMsg(`Fare rule updated for ${editingRule.trainType}`);
      setEditingRule(null);
      fetchFareRules();
    } catch (err) {
      setRulesMsg('Failed to update fare rule.');
    }
  };

  // ── Coupon Handlers ──────────────────────────────────────────────────────────
  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingCoupon(true);
    try {
      await axios.post('/api/admin/coupons/create', couponForm);
      setCouponMsg(`Coupon ${couponForm.code.toUpperCase()} created.`);
      setShowCreateCoupon(false);
      setCouponForm(defaultCouponForm);
      fetchCoupons();
    } catch (err: any) {
      setCouponMsg(err.response?.data?.error || 'Failed to create coupon.');
    } finally {
      setCreatingCoupon(false);
    }
  };

  const handleToggleCoupon = async (id: string, code: string, isActive: boolean) => {
    try {
      await axios.patch(`/api/admin/coupons/${id}/toggle`);
      setCouponMsg(`Coupon ${code} ${isActive ? 'deactivated' : 'activated'}.`);
      fetchCoupons();
    } catch (err) {
      setCouponMsg('Toggle failed.');
    }
  };

  const handleDeleteCoupon = async (id: string, code: string) => {
    if (!window.confirm(`Revoke coupon ${code}?`)) return;
    try {
      await axios.delete(`/api/admin/coupons/${id}`);
      setCouponMsg(`Coupon ${code} revoked.`);
      fetchCoupons();
    } catch (err) {
      setCouponMsg('Delete failed.');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-gradient-to-r from-slate-900 via-amber-950/40 to-slate-900 rounded-3xl border border-amber-900/40 shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-amber-400">
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-100 flex items-center space-x-2">
              <span>RailVoy National Operations Centre</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-900/60 text-amber-300 border border-amber-700">
                Admin Mode
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live Fleet Control · Fare Engine · Delay Management · Transfer Ledger
            </p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 text-xs">
          <button
            onClick={() => setAdminTab('analytics')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              adminTab === 'analytics' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Analytics
          </button>
          <button
            onClick={() => setAdminTab('trains')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              adminTab === 'trains' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Trains & Coaches
          </button>
          <button
            onClick={() => setAdminTab('stations')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              adminTab === 'stations' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Stations
          </button>
          <button
            onClick={() => setAdminTab('connectivity')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              adminTab === 'connectivity' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Route Graph
          </button>
          <button
            onClick={() => setAdminTab('ledger')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              adminTab === 'ledger' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Adjustment Ledger
          </button>
          <button
            onClick={() => setAdminTab('rules')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              adminTab === 'rules' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Fare Rules
          </button>
          <button
            onClick={() => setAdminTab('delays')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              adminTab === 'delays' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Delay Broadcast
          </button>
          <button
            onClick={() => setAdminTab('coupons')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              adminTab === 'coupons' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Coupons
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          TAB 1: ANALYTICS & TRAFFIC
      ════════════════════════════════════════════ */}
      {adminTab === 'analytics' && analytics && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800">
              <p className="text-[10px] text-slate-400 font-bold uppercase">Total Bookings</p>
              <p className="text-2xl font-black text-cyan-400 mt-1">{analytics.summary?.totalDailyBookings}</p>
            </div>
            <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800">
              <p className="text-[10px] text-slate-400 font-bold uppercase">Weekly Revenue</p>
              <p className="text-2xl font-black text-emerald-400 mt-1">₹{Number(analytics.summary?.totalWeeklyRevenue || 0).toLocaleString('en-IN')}</p>
            </div>
            <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800">
              <p className="text-[10px] text-slate-400 font-bold uppercase">Seat Recycling Rate</p>
              <p className="text-2xl font-black text-purple-400 mt-1">{analytics.summary?.seatRecyclingRate}</p>
            </div>
            <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800">
              <p className="text-[10px] text-slate-400 font-bold uppercase">AI Replans Issued</p>
              <p className="text-2xl font-black text-amber-400 mt-1">{analytics.summary?.aiReplansIssued}</p>
            </div>
          </div>

          {/* Popular Routes */}
          <div className="p-5 bg-slate-900/80 rounded-3xl border border-slate-800">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Popular Rail Corridors</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {analytics.routePopularity?.map((r: any, idx: number) => (
                <div key={idx} className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-200">{r.route}</span>
                  <span className="text-cyan-400 font-bold font-mono">{r.avgOccupancy} Occ.</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          TAB 2: TRAIN MANAGEMENT & COACH EDITOR
      ════════════════════════════════════════════ */}
      {adminTab === 'trains' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
              <TrainIcon className="w-4 h-4 text-amber-400" />
              <span>Fleet Inventory ({adminTrains.length} Trains)</span>
            </h3>
            <button
              onClick={() => setShowAddTrain(!showAddTrain)}
              className="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-all shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Train</span>
            </button>
          </div>

          {trainMsg && (
            <div className="p-3 bg-slate-900 border border-amber-800/60 rounded-xl text-amber-300 text-xs font-medium">
              {trainMsg}
            </div>
          )}

          {/* Add Train Modal/Drawer */}
          {showAddTrain && (
            <form onSubmit={handleAddTrain} className="p-5 bg-slate-900 rounded-2xl border border-amber-800/60 space-y-4 text-xs">
              <h4 className="font-bold text-slate-200 text-sm">Add New Train to Fleet</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Train Number (5-digit)</label>
                  <input
                    type="text" required placeholder="e.g. 12002"
                    value={newTrain.trainNo} onChange={e => setNewTrain({ ...newTrain, trainNo: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Train Name</label>
                  <input
                    type="text" required placeholder="e.g. Bhopal Shatabdi"
                    value={newTrain.trainName} onChange={e => setNewTrain({ ...newTrain, trainName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Train Type</label>
                  <select
                    value={newTrain.trainType} onChange={e => setNewTrain({ ...newTrain, trainType: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100"
                  >
                    <option value="Superfast">Superfast</option>
                    <option value="Rajdhani">Rajdhani</option>
                    <option value="Shatabdi">Shatabdi</option>
                    <option value="Vande Bharat">Vande Bharat</option>
                    <option value="Tejas">Tejas</option>
                    <option value="Garib Rath">Garib Rath</option>
                    <option value="Sachkhand">Sachkhand</option>
                    <option value="Express">Express</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Source Code</label>
                  <input
                    type="text" required placeholder="NDLS"
                    value={newTrain.source} onChange={e => setNewTrain({ ...newTrain, source: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Destination Code</label>
                  <input
                    type="text" required placeholder="BPL"
                    value={newTrain.destination} onChange={e => setNewTrain({ ...newTrain, destination: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono uppercase"
                  />
                </div>
                <div className="flex items-center space-x-3 pt-5">
                  <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox" checked={newTrain.pantryAvailable}
                      onChange={e => setNewTrain({ ...newTrain, pantryAvailable: e.target.checked, hasPantrycar: e.target.checked })}
                      className="rounded bg-slate-950 border-slate-700 text-cyan-500"
                    />
                    <span>Pantry Car Available</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowAddTrain(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl">
                  Create Train
                </button>
              </div>
            </form>
          )}

          {/* Coach Editor Modal */}
          {editingCoachTrain && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
              <div className="w-full max-w-2xl bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl space-y-4 text-xs">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <div>
                    <h4 className="text-base font-bold text-slate-100">Coach Composition Editor</h4>
                    <p className="text-slate-400">Train #{editingCoachTrain.trainNo} ({editingCoachTrain.trainName})</p>
                  </div>
                  <button onClick={() => setEditingCoachTrain(null)} className="p-1 text-slate-400 hover:text-slate-200">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {coachList.map((coach, idx) => (
                    <div key={idx} className="flex items-center space-x-3 p-2 bg-slate-950 rounded-xl border border-slate-800">
                      <span className="w-6 font-mono font-bold text-slate-500">{idx + 1}</span>
                      <input
                        type="text" value={coach.code} placeholder="Code"
                        onChange={e => {
                          const n = [...coachList];
                          n[idx].code = e.target.value.toUpperCase();
                          setCoachList(n);
                        }}
                        className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono uppercase"
                      />
                      <select
                        value={coach.type}
                        onChange={e => {
                          const n = [...coachList];
                          n[idx].type = e.target.value;
                          setCoachList(n);
                        }}
                        className="px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
                      >
                        <option value="1A">1A (First AC)</option>
                        <option value="2A">2A (Second AC)</option>
                        <option value="3A">3A (Third AC)</option>
                        <option value="SL">SL (Sleeper)</option>
                        <option value="CC">CC (Chair Car)</option>
                        <option value="EC">EC (Exec Chair)</option>
                        <option value="PC">PC (Pantry Car)</option>
                        <option value="GS">GS (General)</option>
                        <option value="ENG">ENG (Locomotive)</option>
                      </select>
                      <input
                        type="number" value={coach.seats || 0} placeholder="Seats"
                        onChange={e => {
                          const n = [...coachList];
                          n[idx].seats = Number(e.target.value);
                          setCoachList(n);
                        }}
                        className="w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
                      />
                      <input
                        type="number" min="0" value={coach.farePerPassenger || 0} placeholder="Fare"
                        onChange={e => {
                          const n = [...coachList];
                          n[idx].farePerPassenger = Number(e.target.value);
                          setCoachList(n);
                        }}
                        className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
                        title="Coach fare per passenger"
                      />
                      <button
                        onClick={() => setCoachList(coachList.filter((_, i) => i !== idx))}
                        className="p-1 text-rose-400 hover:bg-rose-950/40 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    onClick={() => setCoachList([...coachList, { code: 'B' + (coachList.length + 1), type: '3A', position: coachList.length + 1, seats: 72, farePerPassenger: 0 }])}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold rounded-lg flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Append Coach</span>
                  </button>
                  <div className="flex space-x-2">
                    <button onClick={() => setEditingCoachTrain(null)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl">
                      Cancel
                    </button>
                    <button onClick={handleSaveCoaches} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl">
                      Save Rake
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Trains Table */}
          {trainsLoading ? (
            <div className="py-8 text-center text-slate-400">Loading trains...</div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400 font-bold uppercase text-[10px]">
                    <th className="px-4 py-3">Train #</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Route</th>
                    <th className="px-4 py-3">Pantry Car</th>
                    <th className="px-4 py-3">Status / Delay</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminTrains.map(t => (
                    <tr key={t.trainNo} className="border-b border-slate-800/60 hover:bg-slate-800/20">
                      <td className="px-4 py-3 font-mono font-bold text-amber-300">{t.trainNo}</td>
                      <td className="px-4 py-3 font-semibold text-slate-200">{t.trainName}</td>
                      <td className="px-4 py-3 text-slate-400">{t.trainType}</td>
                      <td className="px-4 py-3 font-mono text-slate-300">{t.source} &rarr; {t.destination}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          t.pantryAvailable ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {t.pantryAvailable ? 'Pantry Onboard' : 'No Pantry'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {(t.currentDelayMinutes || 0) > 0 ? (
                          <span className="text-rose-400">+{t.currentDelayMinutes} min</span>
                        ) : (
                          <span className="text-emerald-400">On Time</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleOpenCoachEditor(t)}
                            title="Edit Coaches"
                            className="p-1.5 bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-300 rounded-lg"
                          >
                            <Layers className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTrain(t.trainNo)}
                            title="Delete"
                            className="p-1.5 bg-rose-900/40 hover:bg-rose-800/60 text-rose-400 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════
          TAB: STATIONS MANAGEMENT
      ════════════════════════════════════════════ */}
      {adminTab === 'stations' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-amber-400" />
                <span>Railway Stations Registry</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Register national junction hubs, terminal codes, and geographic rail nodes
              </p>
            </div>
            <button onClick={fetchStations} className="p-2 text-slate-400 hover:text-slate-200 self-start sm:self-auto">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {stationMsg && (
            <div className="p-3 bg-amber-950/40 border border-amber-800 rounded-xl text-xs text-amber-300">
              {stationMsg}
            </div>
          )}

          {/* Add Station Card */}
          <form onSubmit={handleAddStation} className="p-5 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-4 text-xs">
            <h4 className="font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Register New Station Node</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Station Code (e.g. NDLS)</label>
                <input
                  type="text" required maxLength={6} placeholder="NDLS"
                  value={newStation.stationCode}
                  onChange={e => setNewStation({ ...newStation, stationCode: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono font-bold uppercase"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Station Full Name</label>
                <input
                  type="text" required placeholder="New Delhi"
                  value={newStation.stationName}
                  onChange={e => setNewStation({ ...newStation, stationName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-semibold"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">State / Territory</label>
                <input
                  type="text" required placeholder="Delhi"
                  value={newStation.state}
                  onChange={e => setNewStation({ ...newStation, state: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-semibold"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Railway Zone</label>
                <select
                  value={newStation.zone}
                  onChange={e => setNewStation({ ...newStation, zone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-semibold"
                >
                  <option value="NR">Northern Railway (NR)</option>
                  <option value="CR">Central Railway (CR)</option>
                  <option value="WR">Western Railway (WR)</option>
                  <option value="SR">Southern Railway (SR)</option>
                  <option value="ER">Eastern Railway (ER)</option>
                  <option value="SWR">South Western (SWR)</option>
                  <option value="NCR">North Central (NCR)</option>
                  <option value="WCR">West Central (WCR)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-md transition-all"
              >
                Register Station
              </button>
            </div>
          </form>

          {/* Search Filter & Stations List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <input
                type="text"
                placeholder="Filter stations by code, name, or state..."
                value={stationSearch}
                onChange={e => setStationSearch(e.target.value)}
                className="w-full sm:w-80 px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 outline-none"
              />
              <span className="text-xs text-slate-400 font-semibold">
                Total Stations: {stationsList.length}
              </span>
            </div>

            {stationsLoading ? (
              <div className="py-8 text-center text-slate-400">Loading stations database...</div>
            ) : (
              <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-x-auto text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Station Name</th>
                      <th className="px-4 py-3">State</th>
                      <th className="px-4 py-3">Zone</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stationsList
                      .filter(s => {
                        const q = stationSearch.toLowerCase();
                        return (
                          (s.stationCode || '').toLowerCase().includes(q) ||
                          (s.stationName || '').toLowerCase().includes(q) ||
                          (s.state || '').toLowerCase().includes(q)
                        );
                      })
                      .map((s, idx) => (
                        <tr key={s.stationCode || idx} className="border-b border-slate-800/60 hover:bg-slate-800/20">
                          <td className="px-4 py-3 font-mono font-bold text-amber-400">{s.stationCode}</td>
                          <td className="px-4 py-3 font-semibold text-slate-200">{s.stationName}</td>
                          <td className="px-4 py-3 text-slate-400">{s.state}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 font-mono text-[10px] font-bold border border-slate-700">
                              {s.zone || 'NR'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleDeleteStation(s.stationCode)}
                              className="p-1.5 text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                              title="Delete Station"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          TAB: ROUTE & CONNECTIVITY GRAPH
      ════════════════════════════════════════════ */}
      {adminTab === 'connectivity' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                <GitBranch className="w-4 h-4 text-cyan-400" />
                <span>Railway Route Graph & Track Topology</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Inspect direct train lines, multi-hop BFS junction interchanges, and network distances
              </p>
            </div>
          </div>

          {/* Route Query Form */}
          <form onSubmit={handleCheckConnectivity} className="p-5 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5">
                <label className="block text-slate-400 mb-1 font-semibold">Origin Station Code</label>
                <input
                  type="text" required placeholder="NDLS"
                  value={connFrom}
                  onChange={e => setConnFrom(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono font-bold uppercase"
                />
              </div>
              <div className="sm:col-span-5">
                <label className="block text-slate-400 mb-1 font-semibold">Destination Station Code</label>
                <input
                  type="text" required placeholder="SBC"
                  value={connTo}
                  onChange={e => setConnTo(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono font-bold uppercase"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit" disabled={connLoading}
                  className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center space-x-1.5"
                >
                  {connLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Inspect Route</span>}
                </button>
              </div>
            </div>
          </form>

          {connMsg && (
            <div className="p-3 bg-rose-950/40 border border-rose-800 rounded-xl text-xs text-rose-300">
              {connMsg}
            </div>
          )}

          {/* Result View */}
          {connResult && (
            <div className="space-y-4">
              <div className="p-5 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-sm font-black text-amber-400">{connResult.from?.stationCode}</span>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <span className="font-mono text-sm font-black text-emerald-400">{connResult.to?.stationCode}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      connResult.connectionType === 'DIRECT'
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                        : connResult.connectionType === 'TRANSFER_JUNCTION'
                        ? 'bg-amber-950 text-amber-300 border-amber-800'
                        : 'bg-rose-950 text-rose-300 border-rose-800'
                    }`}>
                      {connResult.connectionType}
                    </span>
                  </div>
                  {connResult.totalDistanceKm && (
                    <span className="text-xs font-mono font-bold text-cyan-400">
                      Total Track Distance: {connResult.totalDistanceKm} km
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {connResult.summary}
                </p>

                {/* Direct Trains List */}
                {connResult.directTrains && connResult.directTrains.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h5 className="text-[11px] font-bold text-slate-400 uppercase">Direct Train Services:</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {connResult.directTrains.map((dt: any, i: number) => (
                        <div key={i} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-slate-200">{dt.trainName}</span>
                            <span className="font-mono text-cyan-400 ml-2 font-semibold">#{dt.trainNo}</span>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {dt.departureTime} → {dt.arrivalTime} ({dt.distanceKm} km)
                            </p>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {dt.trainType}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Multi-hop Route Segments */}
                {connResult.segments && connResult.segments.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h5 className="text-[11px] font-bold text-slate-400 uppercase">Multi-Hop Segment Breakdown:</h5>
                    <div className="space-y-2">
                      {connResult.segments.map((seg: any, idx: number) => (
                        <div key={idx} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-amber-400">Leg {seg.leg}:</span>
                            <span className="font-bold text-slate-200">{seg.from}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                            <span className="font-bold text-slate-200">{seg.to}</span>
                            <span className="text-slate-400 font-mono">({seg.distanceKm} km)</span>
                          </div>
                          <div className="text-[11px] text-cyan-300">
                            Trains: {seg.availableTrainNumbers?.join(', ') || 'Connected Rake'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════
          TAB 3: FARE ADJUSTMENT LEDGER (Delay Transfers)
      ════════════════════════════════════════════ */}
      {adminTab === 'ledger' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
                <span>Delayed Train Transfer Adjustments Ledger</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Financial audit log for passengers re-routed from delayed trains to faster alternates
              </p>
            </div>
            <button onClick={fetchLedger} className="p-2 text-slate-400 hover:text-slate-200">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Ledger Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-900/80 rounded-2xl border border-rose-900/40">
              <p className="text-[10px] uppercase font-bold text-slate-400">Total Overdue Refunds Owed to Passengers</p>
              <p className="text-2xl font-black text-rose-400 mt-1">₹{ledgerSummary.overdue.toLocaleString('en-IN')}</p>
              <p className="text-[11px] text-slate-500 mt-1">Passenger transferred to lower-cost service — refund pending</p>
            </div>
            <div className="p-4 bg-slate-900/80 rounded-2xl border border-emerald-900/40">
              <p className="text-[10px] uppercase font-bold text-slate-400">Total Pending Fare Upcharge Credits</p>
              <p className="text-2xl font-black text-emerald-400 mt-1">₹{ledgerSummary.pendingCredits.toLocaleString('en-IN')}</p>
              <p className="text-[11px] text-slate-500 mt-1">Passenger transferred to premium service</p>
            </div>
          </div>

          {ledgerMsg && (
            <div className="p-3 bg-slate-900 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs font-medium">
              {ledgerMsg}
            </div>
          )}

          {/* Adjustments Table */}
          {ledgerLoading ? (
            <div className="py-8 text-center text-slate-400">Loading ledger...</div>
          ) : adjustments.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-xs bg-slate-900/40 rounded-2xl border border-slate-800">
              No transfer fare adjustments recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400 font-bold uppercase text-[10px]">
                    <th className="px-4 py-3">PNR</th>
                    <th className="px-4 py-3">Passenger Email</th>
                    <th className="px-4 py-3">Old &rarr; New Train</th>
                    <th className="px-4 py-3">Fare Diff</th>
                    <th className="px-4 py-3">Adjustment Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map(adj => (
                    <tr key={adj._id || adj.id} className="border-b border-slate-800/60 hover:bg-slate-800/20">
                      <td className="px-4 py-3 font-mono font-bold text-cyan-300">{adj.bookingPnr}</td>
                      <td className="px-4 py-3 text-slate-300">{adj.userEmail}</td>
                      <td className="px-4 py-3 font-mono text-slate-200">#{adj.oldTrainNo} &rarr; #{adj.newTrainNo}</td>
                      <td className="px-4 py-3 font-bold text-slate-100">₹{adj.fareDiff}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          adj.direction === 'refund'
                            ? 'bg-rose-950 text-rose-300 border-rose-800'
                            : (adj.direction === 'charge' ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-slate-800 text-slate-400 border-slate-700')
                        }`}>
                          {adj.direction === 'refund' ? 'Refund Due to Passenger' : (adj.direction === 'charge' ? 'Upcharge Collected' : 'Even Transfer')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          adj.status === 'settled' ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-amber-950 text-amber-300 border-amber-800'
                        }`}>
                          {adj.status?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {adj.status !== 'settled' && (
                          <button
                            onClick={() => handleSettleAdjustment(adj._id || adj.id || adj.bookingPnr)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px]"
                          >
                            Mark Settled
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════
          TAB 4: FARE RULES ENGINE
      ════════════════════════════════════════════ */}
      {adminTab === 'rules' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
              <DollarSign className="w-4 h-4 text-cyan-400" />
              <span>National Fare Calculation Rules</span>
            </h3>
            <button onClick={fetchFareRules} className="p-2 text-slate-400 hover:text-slate-200">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {rulesMsg && (
            <div className="p-3 bg-slate-900 border border-cyan-800/60 rounded-xl text-cyan-300 text-xs font-medium">
              {rulesMsg}
            </div>
          )}

          {/* Edit Fare Rule Modal */}
          {editingRule && (
            <div className="p-5 bg-slate-900 rounded-2xl border border-cyan-800/60 space-y-4 text-xs">
              <h4 className="font-bold text-slate-200 text-sm">Editing Fare Rule: {editingRule.trainType}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Base Fare Per Km (₹)</label>
                  <input
                    type="number" step="0.05" value={editingRule.baseFarePerKm}
                    onChange={e => setEditingRule({ ...editingRule, baseFarePerKm: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Facility Multiplier</label>
                  <input
                    type="number" step="0.05" value={editingRule.facilityMultiplier}
                    onChange={e => setEditingRule({ ...editingRule, facilityMultiplier: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Reservation Charge (₹)</label>
                  <input
                    type="number" value={editingRule.reservationCharge}
                    onChange={e => setEditingRule({ ...editingRule, reservationCharge: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-2">
                <button onClick={() => setEditingRule(null)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl">Cancel</button>
                <button onClick={handleSaveFareRule} className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl">Save Changes</button>
              </div>
            </div>
          )}

          {rulesLoading ? (
            <div className="py-8 text-center text-slate-400">Loading fare rules...</div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400 font-bold uppercase text-[10px]">
                    <th className="px-4 py-3">Train Type</th>
                    <th className="px-4 py-3">Base Fare / Km</th>
                    <th className="px-4 py-3">Facility Multiplier</th>
                    <th className="px-4 py-3">Reservation Charge</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {fareRules.map(rule => (
                    <tr key={rule.trainType} className="border-b border-slate-800/60 hover:bg-slate-800/20">
                      <td className="px-4 py-3 font-bold text-slate-100">{rule.trainType}</td>
                      <td className="px-4 py-3 font-mono text-cyan-300">₹{rule.baseFarePerKm}</td>
                      <td className="px-4 py-3 font-mono text-slate-300">{rule.facilityMultiplier}x</td>
                      <td className="px-4 py-3 font-mono text-emerald-300">₹{rule.reservationCharge}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setEditingRule({ ...rule })}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg flex items-center space-x-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════
          TAB 5: DELAY BROADCAST
      ════════════════════════════════════════════ */}
      {adminTab === 'delays' && (
        <div className="p-6 bg-slate-900/80 rounded-3xl border border-slate-800 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
              <Activity className="w-4 h-4 text-amber-400" />
              <span>Broadcast Live Train Delay &amp; Trigger AI Replanning</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Broadcasting delays of 20+ minutes automatically triggers AI route scanners and offers passengers free transfers to faster trains.
            </p>
          </div>

          {delayMsg && (
            <div className="p-3.5 bg-emerald-950/80 border border-emerald-800 rounded-xl text-emerald-300 text-xs font-semibold flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{delayMsg}</span>
            </div>
          )}

          <form onSubmit={handleUpdateDelay} className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-400 font-bold mb-1">Select Train</label>
              <select
                value={selectedTrainNo} onChange={e => setSelectedTrainNo(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100"
              >
                {trains.map(t => (
                  <option key={t.trainNo} value={t.trainNo}>
                    #{t.trainNo} - {t.trainName} ({t.source} &rarr; {t.destination})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">Delay Duration (Minutes)</label>
              <input
                type="number" min="0" max="300"
                value={delayMinutes} onChange={e => setDelayMinutes(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit" disabled={loadingDelay}
                className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold rounded-xl shadow-md flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{loadingDelay ? 'Broadcasting...' : 'Broadcast Delay'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ════════════════════════════════════════════
          TAB 6: COUPONS
      ════════════════════════════════════════════ */}
      {adminTab === 'coupons' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
              <Tag className="w-4 h-4 text-purple-400" />
              <span>Promotional &amp; Food Coupon Registry</span>
            </h3>
            <button
              onClick={() => setShowCreateCoupon(!showCreateCoupon)}
              className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-all shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Issue New Coupon</span>
            </button>
          </div>

          {couponMsg && (
            <div className="p-3 bg-slate-900 border border-purple-800/60 rounded-xl text-purple-300 text-xs font-medium">
              {couponMsg}
            </div>
          )}

          {showCreateCoupon && (
            <form onSubmit={handleCreateCoupon} className="p-5 bg-slate-900 rounded-2xl border border-purple-800/60 space-y-4 text-xs">
              <h4 className="font-bold text-slate-200 text-sm">Issue New Discount Coupon</h4>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Coupon Code</label>
                  <input
                    type="text" required placeholder="e.g. FESTIVAL50"
                    value={couponForm.code} onChange={e => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Discount Type</label>
                  <select
                    value={couponForm.discountType} onChange={e => setCouponForm({ ...couponForm, discountType: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100"
                  >
                    <option value="flat">Flat Amount (₹)</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Discount Value</label>
                  <input
                    type="number" required placeholder="50"
                    value={couponForm.discountValue} onChange={e => setCouponForm({ ...couponForm, discountValue: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Applicability</label>
                  <select
                    value={couponForm.couponType} onChange={e => setCouponForm({ ...couponForm, couponType: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100"
                  >
                    <option value="food">Meal &amp; Catering Only</option>
                    <option value="fare">Ticket Fare Only</option>
                    <option value="general">All Charges</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-2">
                <button type="button" onClick={() => setShowCreateCoupon(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl">Cancel</button>
                <button type="submit" disabled={creatingCoupon} className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl">
                  {creatingCoupon ? 'Creating...' : 'Issue Coupon'}
                </button>
              </div>
            </form>
          )}

          {couponsLoading ? (
            <div className="py-8 text-center text-slate-400">Loading coupons...</div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400 font-bold uppercase text-[10px]">
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Value</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map(c => (
                    <tr key={c._id} className="border-b border-slate-800/60 hover:bg-slate-800/20">
                      <td className="px-4 py-3 font-mono font-bold text-purple-300">{c.code}</td>
                      <td className="px-4 py-3"><CouponTypeBadge type={c.couponType} /></td>
                      <td className="px-4 py-3 font-bold text-slate-200">
                        {c.discountType === 'flat' ? `₹${c.discountValue}` : `${c.discountValue}%`}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          c.isActive ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {c.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleToggleCoupon(c._id, c.code, c.isActive)}
                            className={`p-1.5 rounded-lg ${c.isActive ? 'bg-amber-900/40 text-amber-400' : 'bg-emerald-900/40 text-emerald-400'}`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCoupon(c._id, c.code)}
                            className="p-1.5 bg-rose-900/40 text-rose-400 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
