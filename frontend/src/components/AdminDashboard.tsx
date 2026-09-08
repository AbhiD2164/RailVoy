import React, { useState, useEffect } from 'react';
import {
  Shield, TrendingUp, Activity, AlertTriangle, Send, RefreshCw,
  CheckCircle2, Tag, Plus, Trash2, Power, Percent, Ticket,
  ChevronDown, ChevronUp, Users, IndianRupee
} from 'lucide-react';
import axios from 'axios';

// ─── Types ──────────────────────────────────────────────────────────────────
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

const defaultForm: NewCouponForm = {
  code: '', discountType: 'flat', discountValue: '', couponType: 'fare',
  description: '', minFare: '0', maxDiscount: '', validDays: '90'
};

// ─── Coupon Type Badge ──────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────────────────────
export const AdminDashboard: React.FC = () => {
  const [analytics, setAnalytics] = useState<any>(null);
  const [trains, setTrains] = useState<any[]>([]);
  const [selectedTrainNo, setSelectedTrainNo] = useState('');
  const [delayMinutes, setDelayMinutes] = useState(45);
  const [delayMsg, setDelayMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Coupons state
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [couponMsg, setCouponMsg] = useState('');
  const [couponMsgType, setCouponMsgType] = useState<'success' | 'error'>('success');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<NewCouponForm>(defaultForm);
  const [creating, setCreating] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(true);

  // ── Fetch analytics ────────────────────────────────────────────────────────
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
        setSelectedTrainNo(res.data[0].trainNo);
      }
    } catch (err) { console.error('Trains Error:', err); }
  };

  const fetchCoupons = async () => {
    setCouponsLoading(true);
    try {
      const res = await axios.get('/api/admin/coupons');
      setCoupons(res.data.coupons || []);
    } catch (err) {
      console.error('Coupons Error:', err);
    } finally {
      setCouponsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    fetchTrains();
    fetchCoupons();
  }, []);

  // ── Delay Update ────────────────────────────────────────────────────────────
  const handleUpdateDelay = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanTrainNo = selectedTrainNo.trim();
    const safeDelay = Number(delayMinutes);

    if (!cleanTrainNo) {
      setDelayMsg('Select a train before broadcasting a delay alert.');
      return;
    }

    if (!Number.isFinite(safeDelay) || safeDelay < 0 || safeDelay > 300) {
      setDelayMsg('Delay must be a value between 0 and 300 minutes.');
      return;
    }

    setLoading(true);
    try {
      await axios.post('/api/admin/update-delay', { trainNo: cleanTrainNo, delayMinutes: safeDelay });
      setDelayMsg(`✓ Train #${cleanTrainNo} delay updated to ${safeDelay} min. Alerts broadcasted.`);
    } catch (err: any) {
      setDelayMsg(err.response?.data?.error || 'Delay update failed. Check the server.');
    } finally {
      setLoading(false);
      setTimeout(() => setDelayMsg(''), 5000);
    }
  };

  // ── Coupon Actions ──────────────────────────────────────────────────────────
  const showCouponMsg = (msg: string, type: 'success' | 'error' = 'success') => {
    setCouponMsg(msg);
    setCouponMsgType(type);
    setTimeout(() => setCouponMsg(''), 5000);
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code || !form.discountValue) return showCouponMsg('Code and discount value are required.', 'error');
    setCreating(true);
    try {
      const res = await axios.post('/api/admin/coupons/create', {
        code: form.code.toUpperCase().trim(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        couponType: form.couponType,
        description: form.description,
        minFare: Number(form.minFare) || 0,
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
        validDays: Number(form.validDays) || 90,
      });
      showCouponMsg(res.data.message || 'Coupon created!');
      setForm(defaultForm);
      setShowCreateForm(false);
      fetchCoupons();
    } catch (err: any) {
      showCouponMsg(err.response?.data?.error || 'Create failed.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleCoupon = async (id: string, code: string, isActive: boolean) => {
    try {
      const res = await axios.patch(`/api/admin/coupons/${id}/toggle`);
      showCouponMsg(res.data.message || `${code} ${isActive ? 'deactivated' : 'activated'}.`);
      fetchCoupons();
    } catch {
      showCouponMsg('Toggle failed.', 'error');
    }
  };

  const handleDeleteCoupon = async (id: string, code: string) => {
    if (!confirm(`Permanently revoke coupon "${code}"?`)) return;
    try {
      const res = await axios.delete(`/api/admin/coupons/${id}`);
      showCouponMsg(res.data.message || `${code} deleted.`);
      fetchCoupons();
    } catch {
      showCouponMsg('Delete failed.', 'error');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-6xl mx-auto space-y-7">

      {/* Top Banner */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-amber-900/60 shadow-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400"><Shield className="w-6 h-6" /></div>
          <div>
            <h2 className="text-xl font-extrabold text-slate-100">Operations Control & Traffic Analytics</h2>
            <p className="text-xs text-slate-400">Monitor booking volumes, revenue, manage coupons and broadcast real-time delay alerts</p>
          </div>
        </div>
        <button onClick={() => { fetchAnalytics(); fetchCoupons(); }} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-colors">
          <RefreshCw className="w-4 h-4" />
          <span>Refresh All</span>
        </button>
      </div>

      {/* KPI Cards */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Bookings', value: analytics.summary.totalDailyBookings, color: 'text-slate-100', sub: `${analytics.summary.confirmedBookings} confirmed`, icon: <Ticket className="w-4 h-4 text-cyan-400" /> },
            { label: 'Weekly Revenue', value: `₹${Number(analytics.summary.totalWeeklyRevenue).toLocaleString('en-IN')}`, color: 'text-emerald-400', sub: 'Floor-surge protected', icon: <IndianRupee className="w-4 h-4 text-emerald-400" /> },
            { label: 'Seat Recycling', value: analytics.summary.seatRecyclingRate, color: 'text-cyan-400', sub: 'Vacated reallocated', icon: <Activity className="w-4 h-4 text-cyan-400" /> },
            { label: 'AI Replans', value: analytics.summary.aiReplansIssued, color: 'text-amber-400', sub: 'Transfer alternatives', icon: <TrendingUp className="w-4 h-4 text-amber-400" /> },
          ].map((card, i) => (
            <div key={i} className="glass-card p-5 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-500 font-bold uppercase">{card.label}</span>
                {card.icon}
              </div>
              <div className={`text-2xl font-black ${card.color}`}>{card.value}</div>
              <span className="text-[10px] text-slate-500">{card.sub}</span>
            </div>
          ))}
        </div>
      )}

      {/* Booking Status Breakdown */}
      {analytics?.summary && (
        <div className="glass-card p-6 rounded-3xl border border-slate-800">
          <h3 className="text-sm font-bold text-slate-100 mb-4 flex items-center space-x-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <span>Booking Status Breakdown</span>
          </h3>
          <div className="flex items-center space-x-3 text-xs">
            {[
              { label: 'Confirmed', count: analytics.summary.confirmedBookings, color: 'bg-emerald-500' },
              { label: 'Waitlisted', count: analytics.summary.waitlistBookings, color: 'bg-amber-500' },
              { label: 'Cancelled', count: analytics.summary.cancelledBookings, color: 'bg-rose-500' },
            ].map((item, i) => {
              const total = (analytics.summary.confirmedBookings || 0) + (analytics.summary.waitlistBookings || 0) + (analytics.summary.cancelledBookings || 0);
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
              return (
                <div key={i} className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-400">{item.label}</span>
                    <span className="font-bold text-slate-200">{item.count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily Traffic Bar Chart */}
      {analytics?.dailyTraffic && (
        <div className="glass-card p-6 sm:p-8 rounded-3xl border border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold text-slate-100">Daily Booking Traffic & Demand Curves</h3>
            <button onClick={() => setShowAnalytics(!showAnalytics)} className="text-slate-500 hover:text-slate-300 transition-colors">
              {showAnalytics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
          {showAnalytics && (
            <div className="grid grid-cols-7 gap-3 items-end h-44 pt-6 pb-2 px-2 border-b border-slate-800">
              {analytics.dailyTraffic.map((item: any, idx: number) => {
                const maxBookings = Math.max(...analytics.dailyTraffic.map((d: any) => d.bookings), 1);
                const heightPct = Math.round((item.bookings / maxBookings) * 100);
                return (
                  <div key={idx} className="flex flex-col items-center h-full justify-end group">
                    <div style={{ height: `${heightPct}%` }} className="w-full bg-gradient-to-t from-cyan-700 to-teal-400 rounded-t-xl group-hover:from-cyan-500 group-hover:to-emerald-400 transition-all relative min-h-[6px]">
                      <span className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] bg-slate-900 text-cyan-300 font-bold px-2 py-1 rounded border border-slate-700 whitespace-nowrap shadow-xl">
                        {item.bookings} bkgs · ₹{(item.revenue/1000).toFixed(0)}K
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-bold mt-2">{item.day}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Route Popularity */}
      {analytics?.routePopularity?.length > 0 && (
        <div className="glass-card p-6 rounded-3xl border border-slate-800">
          <h3 className="text-sm font-bold text-slate-100 mb-4">Top Routes by Demand</h3>
          <div className="space-y-3">
            {analytics.routePopularity.slice(0, 5).map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium flex-1 truncate">{r.route}</span>
                <div className="flex items-center space-x-3 ml-2">
                  <span className="text-slate-500">{r.bookings} bkgs</span>
                  <span className={`font-bold ${parseInt(r.avgOccupancy) >= 90 ? 'text-rose-400' : parseInt(r.avgOccupancy) >= 75 ? 'text-amber-400' : 'text-emerald-400'}`}>{r.avgOccupancy}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Train Delay Simulator */}
      <div className="glass-card p-6 sm:p-8 rounded-3xl border border-slate-800">
        <h3 className="text-base font-bold text-slate-100 mb-2 flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <span>Broadcast Train Delay Alert</span>
        </h3>
        <p className="text-xs text-slate-400 mb-6">Update running status and push real-time delay notifications to connected passengers.</p>

        <form onSubmit={handleUpdateDelay} className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
          <div className="sm:col-span-5">
            <label className="block text-xs font-semibold text-slate-400 mb-1">Select Train</label>
            <select value={selectedTrainNo} onChange={e => setSelectedTrainNo(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-cyan-300 focus:outline-none focus:border-cyan-600">
              {trains.length === 0
                ? <option value="">Loading trains...</option>
                : trains.map(t => <option key={t.trainNo} value={t.trainNo}>{t.trainNo} – {t.trainName}</option>)
              }
            </select>
          </div>
          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-slate-400 mb-1">Delay (Minutes)</label>
            <input type="number" min={0} max={300} value={delayMinutes} onChange={e => setDelayMinutes(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-slate-100 focus:outline-none focus:border-amber-600" />
          </div>
          <div className="sm:col-span-3">
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-md flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-50">
              <Send className="w-4 h-4" />
              <span>Broadcast Alert</span>
            </button>
          </div>
        </form>

        {delayMsg && (
          <div className="mt-4 p-3 bg-amber-950/60 border border-amber-800/80 rounded-xl text-amber-300 text-xs font-medium flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{delayMsg}</span>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════
          COUPON MANAGEMENT
      ════════════════════════════════════════════════════ */}
      <div className="glass-card p-6 sm:p-8 rounded-3xl border border-purple-900/60">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400"><Tag className="w-5 h-5" /></div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Coupon Management</h3>
              <p className="text-xs text-slate-400">Create, activate, deactivate and revoke promotional coupons</p>
            </div>
          </div>
          <button onClick={() => setShowCreateForm(f => !f)}
            className="px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-colors">
            <Plus className="w-4 h-4" />
            <span>{showCreateForm ? 'Cancel' : 'New Coupon'}</span>
          </button>
        </div>

        {/* Global Coupon Status Message */}
        {couponMsg && (
          <div className={`mb-4 p-3 rounded-xl text-xs font-medium flex items-center space-x-2 border ${
            couponMsgType === 'success'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}>
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{couponMsg}</span>
          </div>
        )}

        {/* ── Create Coupon Form ─────────────────────────────────────────── */}
        {showCreateForm && (
          <form onSubmit={handleCreateCoupon} className="mb-6 p-5 bg-slate-900/80 rounded-2xl border border-purple-800/40 space-y-4">
            <h4 className="text-sm font-bold text-purple-300 mb-2">New Coupon Details</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Coupon Code *</label>
                <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. RAIL200"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Discount Type *</label>
                <select value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value as any }))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500">
                  <option value="flat">Flat (₹)</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Discount Value *</label>
                <input type="number" min="1" value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
                  placeholder={form.discountType === 'flat' ? '₹ amount' : '% value'}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Coupon Type</label>
                <select value={form.couponType} onChange={e => setForm(f => ({ ...f, couponType: e.target.value as any }))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500">
                  <option value="fare">Fare Discount</option>
                  <option value="food">Food/Meal</option>
                  <option value="upgrade">Class Upgrade</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Min. Fare (₹)</label>
                <input type="number" min="0" value={form.minFare} onChange={e => setForm(f => ({ ...f, minFare: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Max Discount (₹)</label>
                <input type="number" min="0" value={form.maxDiscount} onChange={e => setForm(f => ({ ...f, maxDiscount: e.target.value }))}
                  placeholder="Optional cap"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Valid For (Days)</label>
                <input type="number" min="1" max="365" value={form.validDays} onChange={e => setForm(f => ({ ...f, validDays: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-purple-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Short description shown to users"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-purple-500" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 pt-2">
              <button type="button" onClick={() => { setShowCreateForm(false); setForm(defaultForm); }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={creating}
                className="px-5 py-2 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center space-x-2 transition-all disabled:opacity-50">
                {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>{creating ? 'Creating...' : 'Create Coupon'}</span>
              </button>
            </div>
          </form>
        )}

        {/* ── Existing Coupons Table ──────────────────────────────────────── */}
        {couponsLoading ? (
          <div className="text-center py-8 text-slate-500 text-xs flex items-center justify-center space-x-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Loading coupons...</span>
          </div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-sm">No coupons found. Create one above.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  <th className="px-4 py-3 text-slate-400 font-bold uppercase text-[10px]">Code</th>
                  <th className="px-4 py-3 text-slate-400 font-bold uppercase text-[10px]">Type</th>
                  <th className="px-4 py-3 text-slate-400 font-bold uppercase text-[10px]">Discount</th>
                  <th className="px-4 py-3 text-slate-400 font-bold uppercase text-[10px]">Min Fare</th>
                  <th className="px-4 py-3 text-slate-400 font-bold uppercase text-[10px]">Expires</th>
                  <th className="px-4 py-3 text-slate-400 font-bold uppercase text-[10px]">Status</th>
                  <th className="px-4 py-3 text-slate-400 font-bold uppercase text-[10px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map(coupon => (
                  <tr key={coupon._id} className={`border-b border-slate-800/60 transition-colors ${coupon.isActive ? 'hover:bg-slate-800/30' : 'opacity-50 hover:bg-slate-800/20'}`}>
                    <td className="px-4 py-3 font-mono font-black text-purple-300">{coupon.code}</td>
                    <td className="px-4 py-3"><CouponTypeBadge type={coupon.couponType} /></td>
                    <td className="px-4 py-3 font-bold text-slate-200">
                      {coupon.discountType === 'flat' ? `₹${coupon.discountValue}` : `${coupon.discountValue}%`}
                      {coupon.maxDiscount ? <span className="text-slate-500 font-normal"> (max ₹{coupon.maxDiscount})</span> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{coupon.minFare ? `₹${coupon.minFare}` : '—'}</td>
                    <td className="px-4 py-3 text-slate-400">
                      {coupon.validUntil ? new Date(coupon.validUntil).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                        coupon.isActive ? 'bg-emerald-900/60 border-emerald-800 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-500'
                      }`}>{coupon.isActive ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleToggleCoupon(coupon._id, coupon.code, coupon.isActive)}
                          title={coupon.isActive ? 'Deactivate' : 'Activate'}
                          className={`p-1.5 rounded-lg transition-colors ${coupon.isActive ? 'bg-amber-900/40 hover:bg-amber-900/70 text-amber-400' : 'bg-emerald-900/40 hover:bg-emerald-900/70 text-emerald-400'}`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteCoupon(coupon._id, coupon.code)}
                          title="Revoke permanently"
                          className="p-1.5 rounded-lg bg-rose-900/40 hover:bg-rose-900/70 text-rose-400 transition-colors"
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

    </div>
  );
};
