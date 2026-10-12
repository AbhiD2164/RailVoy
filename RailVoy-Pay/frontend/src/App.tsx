import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Wallet, ShieldCheck, ArrowRight, CheckCircle2, Lock, Smartphone,
  CreditCard, RefreshCw, Eye, EyeOff, Copy, Check, LogOut, PlusCircle,
  TrendingDown, TrendingUp, Sparkles, ExternalLink, AlertCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface PayUser {
  userId: string;
  name: string;
  phone: string;
  upiId: string;
  bankName: string;
  balance: number;
}

interface Transaction {
  txnId: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  merchantRef: string;
  description: string;
  timestamp: string;
  status: string;
}

export default function App() {
  const [screen, setScreen] = useState<'landing' | 'register' | 'login' | 'dashboard'>('landing');
  const [user, setUser] = useState<PayUser | null>(null);
  const [token, setToken] = useState<string>(localStorage.getItem('rvpay_token') || '');

  // Register Form
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regUpi, setRegUpi] = useState('');
  const [regMpin, setRegMpin] = useState('');
  const [regConfirmMpin, setRegConfirmMpin] = useState('');
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  // Login Form
  const [loginId, setLoginId] = useState('');
  const [loginMpin, setLoginMpin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Dashboard
  const [showBalance, setShowBalance] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [copiedId, setCopiedId] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Check auth
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
      fetchBalance();
      fetchTransactions();
      setScreen('dashboard');
    }
  }, [token]);

  const fetchBalance = async () => {
    setRefreshing(true);
    try {
      const res = await axios.get('/api/pay/balance');
      setUser(prev => ({ ...(prev || {}), ...res.data }));
    } catch (err) {
      handleLogout();
    } finally {
      setRefreshing(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      const res = await axios.get('/api/pay/transactions');
      setTransactions(res.data);
    } catch (e) {}
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    if (regMpin.length !== 4) {
      setRegError('MPIN must be exactly 4 digits');
      return;
    }
    if (regMpin !== regConfirmMpin) {
      setRegError('MPINs do not match');
      return;
    }

    setRegLoading(true);
    try {
      const res = await axios.post('/api/pay/register', {
        name: regName,
        phone: regPhone,
        upiId: regUpi || undefined,
        mpin: regMpin
      });

      setUser(res.data.user);
      setToken(res.data.token);
      localStorage.setItem('rvpay_token', res.data.token);
      axios.defaults.headers.common.Authorization = `Bearer ${res.data.token}`;
      setScreen('dashboard');
      confetti({ particleCount: 80, spread: 70 });
    } catch (err: any) {
      setRegError(err.response?.data?.error || 'Registration failed. Try again.');
    } finally {
      setRegLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (loginMpin.length !== 4) {
      setLoginError('MPIN must be 4 digits');
      return;
    }
    setLoginLoading(true);
    try {
      const res = await axios.post('/api/pay/login', {
        identifier: loginId,
        mpin: loginMpin
      });
      setUser(res.data.user);
      setToken(res.data.token);
      localStorage.setItem('rvpay_token', res.data.token);
      axios.defaults.headers.common.Authorization = `Bearer ${res.data.token}`;
      setScreen('dashboard');
    } catch (err: any) {
      setLoginError(err.response?.data?.error || 'Invalid credentials. Please verify your MPIN.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken('');
    localStorage.removeItem('rvpay_token');
    delete axios.defaults.headers.common.Authorization;
    setScreen('landing');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-emerald-900 text-white border-b border-emerald-800 shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div
            onClick={() => setScreen(token ? 'dashboard' : 'landing')}
            className="flex items-center space-x-3 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-black tracking-tight text-white">RailVoy Pay</span>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-800 text-emerald-300 border border-emerald-700">
                  Railway UPI Gateway
                </span>
              </div>
              <p className="text-[11px] text-emerald-200">Standalone Railway Payment &amp; Wallet Ecosystem</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {screen === 'dashboard' && user ? (
              <div className="flex items-center space-x-3">
                <span className="hidden sm:inline text-xs font-semibold text-emerald-100">
                  Hi, {user.name.split(' ')[0]}
                </span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setScreen('login')}
                  className="px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 rounded-xl text-xs font-bold transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => setScreen('register')}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black rounded-xl text-xs shadow-sm transition-all"
                >
                  Open Wallet
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-center">

        {/* 1. LANDING SCREEN */}
        {screen === 'landing' && (
          <div className="space-y-8 py-6">
            <div className="bg-gradient-to-br from-emerald-900 via-teal-900 to-slate-900 text-white rounded-3xl p-8 sm:p-12 shadow-xl border border-emerald-800/60 relative overflow-hidden text-center sm:text-left">
              <div className="max-w-xl space-y-4">
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>256-Bit Encrypted Multi-App Railway Wallet</span>
                </div>
                <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
                  One Wallet for All Your Indian Railway Journeys
                </h1>
                <p className="text-sm sm:text-base text-emerald-100 leading-relaxed">
                  Keep your bank balance secure and separated from reservation apps. Create your unique RailVoy Pay ID &amp; 4-digit MPIN here, then authorize tickets across RailVoy with zero exposure of your actual banking secrets.
                </p>
                <div className="flex flex-wrap gap-3 pt-3 justify-center sm:justify-start">
                  <button
                    onClick={() => setScreen('register')}
                    className="px-6 py-3.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-sm rounded-2xl shadow-lg shadow-emerald-950/40 flex items-center space-x-2 transition-all hover:scale-105"
                  >
                    <span>Create RailVoy Pay Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setScreen('login')}
                    className="px-6 py-3.5 bg-white/10 hover:bg-white/20 text-white font-bold text-sm rounded-2xl border border-white/20 transition-colors"
                  >
                    Access Existing Wallet
                  </button>
                </div>
              </div>
            </div>

            {/* Feature Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <CreditCard className="w-6 h-6" />
                </div>
                <h3 className="font-extrabold text-slate-900 text-base">Dedicated Payment ID</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Receive a unique <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-emerald-700">RVPAY-XXXXXX</code> identifier to use across booking apps.
                </p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center font-bold">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="font-extrabold text-slate-900 text-base">4-Digit MPIN Security</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Set a private 4-digit MPIN. RailVoy checks your PIN via encrypted backend API — your MPIN is never exposed on booking screens!
                </p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="font-extrabold text-slate-900 text-base">Fast Refunds &amp; Top-Ups</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Cancelled bookings and uncommitted locks are refunded immediately into your RailVoy Pay wallet without multi-day bank hold times.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 2. REGISTRATION SCREEN */}
        {screen === 'register' && (
          <div className="max-w-md mx-auto w-full bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xl space-y-6">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-2">
                <Wallet className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black text-slate-900">Create RailVoy Pay Wallet</h2>
              <p className="text-xs text-slate-500">Your independent railway payment account with UPI &amp; MPIN</p>
            </div>

            {regError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-700 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{regError}</span>
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 uppercase mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-emerald-600 focus:bg-white text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-700 uppercase mb-1">10-Digit Mobile Number</label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  placeholder="9876543210"
                  value={regPhone}
                  onChange={e => setRegPhone(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-emerald-600 focus:bg-white text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 uppercase mb-1">
                  Custom UPI ID <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. ramesh@railvoy"
                  value={regUpi}
                  onChange={e => setRegUpi(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-emerald-600 focus:bg-white text-sm font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1 font-normal">Defaults to your phone@railvoy</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 uppercase mb-1">4-Digit MPIN</label>
                  <input
                    type="password"
                    required
                    maxLength={4}
                    placeholder="••••"
                    value={regMpin}
                    onChange={e => setRegMpin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-emerald-600 focus:bg-white text-center text-lg font-mono tracking-widest font-black"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 uppercase mb-1">Confirm MPIN</label>
                  <input
                    type="password"
                    required
                    maxLength={4}
                    placeholder="••••"
                    value={regConfirmMpin}
                    onChange={e => setRegConfirmMpin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-emerald-600 focus:bg-white text-center text-lg font-mono tracking-widest font-black"
                  />
                </div>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-[11px] text-emerald-800 font-normal">
                🔒 Your 4-digit MPIN is encrypted with bcrypt and never visible on RailVoy or checkout screens.
              </div>

              <button
                type="submit"
                disabled={regLoading}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-xl shadow-md transition-all disabled:opacity-50 cursor-pointer"
              >
                {regLoading ? 'Setting Up Wallet...' : 'Activate RailVoy Pay Account'}
              </button>
            </form>

            <div className="text-center text-xs text-slate-500">
              Already have an account?{' '}
              <button onClick={() => setScreen('login')} className="text-emerald-700 font-bold hover:underline">
                Sign In
              </button>
            </div>
          </div>
        )}

        {/* 3. LOGIN SCREEN */}
        {screen === 'login' && (
          <div className="max-w-md mx-auto w-full bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xl space-y-6">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-2">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black text-slate-900">Sign In to RailVoy Pay</h2>
              <p className="text-xs text-slate-500">Enter your Mobile / User ID and 4-digit MPIN</p>
            </div>

            {loginError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-700 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 uppercase mb-1">Mobile / User ID / UPI ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 9876543210 or RVPAY-DEMO1001"
                  value={loginId}
                  onChange={e => setLoginId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-emerald-600 focus:bg-white text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-700 uppercase mb-1">4-Digit MPIN</label>
                <input
                  type="password"
                  required
                  maxLength={4}
                  placeholder="••••"
                  value={loginMpin}
                  onChange={e => setLoginMpin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-emerald-600 focus:bg-white text-center text-lg font-mono tracking-widest font-black"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 font-normal">
                Demo Test Wallet: <code className="font-bold text-emerald-800">RVPAY-DEMO1001</code> / MPIN: <code className="font-bold text-emerald-800">1234</code>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-xl shadow-md transition-all disabled:opacity-50 cursor-pointer"
              >
                {loginLoading ? 'Authenticating...' : 'Access Wallet'}
              </button>
            </form>

            <div className="text-center text-xs text-slate-500">
              Need a RailVoy Pay wallet?{' '}
              <button onClick={() => setScreen('register')} className="text-emerald-700 font-bold hover:underline">
                Create One
              </button>
            </div>
          </div>
        )}

        {/* 4. DASHBOARD */}
        {screen === 'dashboard' && user && (
          <div className="space-y-6">

            {/* Virtual Card & Balance Header */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

              {/* Digital Wallet Card */}
              <div className="md:col-span-7 bg-gradient-to-br from-emerald-800 via-teal-900 to-slate-900 text-white p-6 sm:p-7 rounded-3xl shadow-xl border border-emerald-700 relative overflow-hidden flex flex-col justify-between min-h-[220px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Wallet className="w-5 h-5 text-emerald-300" />
                    <span className="font-black tracking-wider text-sm text-emerald-200 uppercase">RailVoy Pay Platinum</span>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/30">
                    UPI Active
                  </span>
                </div>

                <div className="py-4">
                  <span className="text-[11px] text-emerald-300 uppercase tracking-widest font-semibold block">Available Rail Balance</span>
                  <div className="flex items-center space-x-3 mt-1">
                    <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight">
                      {showBalance ? `₹${(user.balance || 0).toLocaleString('en-IN')}` : '₹ ••••••••'}
                    </span>
                    <button
                      onClick={() => setShowBalance(!showBalance)}
                      className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-emerald-200"
                      title={showBalance ? 'Hide Balance' : 'Reveal Balance'}
                    >
                      {showBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-end justify-between border-t border-emerald-700/60 pt-3">
                  <div>
                    <span className="text-[10px] text-emerald-400 uppercase font-semibold">Account Holder</span>
                    <p className="text-xs font-bold text-white">{user.name}</p>
                  </div>
                  <div className="text-right font-mono text-xs text-emerald-200">
                    {user.upiId}
                  </div>
                </div>
              </div>

              {/* User ID & RailVoy Integration Info Card */}
              <div className="md:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Your RailVoy Pay ID</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Ready to Link</span>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                    <span className="font-mono text-lg font-black text-emerald-900 tracking-wider">
                      {user.userId}
                    </span>
                    <button
                      onClick={() => copyToClipboard(user.userId)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1 shadow-sm transition-all"
                    >
                      {copiedId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="p-3.5 bg-sky-50 rounded-2xl border border-sky-200 text-xs text-sky-900 space-y-1">
                  <p className="font-bold flex items-center space-x-1">
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>How to use in RailVoy App:</span>
                  </p>
                  <p className="text-[11px] text-slate-600 leading-relaxed font-normal">
                    1. When booking a train in RailVoy, choose <strong>RailVoy Pay</strong> at payment.<br />
                    2. Enter your User ID <code className="font-bold text-emerald-800">{user.userId}</code> or UPI ID.<br />
                    3. Authenticate with your 4-digit MPIN securely without exposing bank PINs.
                  </p>
                </div>
              </div>

            </div>

            {/* Recent Wallet Transactions */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-extrabold text-slate-900 text-base">Wallet Activity &amp; Booking Debits</h3>
                </div>
                <button
                  onClick={() => { fetchBalance(); fetchTransactions(); }}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                  title="Refresh Activity"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-600' : ''}`} />
                </button>
              </div>

              {transactions.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs font-medium">
                  No debit or credit transactions recorded yet. Use this wallet on RailVoy to see live debits.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {transactions.slice(0, 8).map(txn => (
                    <div key={txn.txnId} className="py-3 flex items-center justify-between text-xs">
                      <div className="flex items-start space-x-3">
                        <div className={`p-2 rounded-xl mt-0.5 ${
                          txn.type === 'DEBIT' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                        }`}>
                          {txn.type === 'DEBIT' ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="font-extrabold text-slate-900">{txn.merchantRef || txn.description}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{txn.txnId} &bull; {new Date(txn.timestamp).toLocaleString('en-IN')}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`font-mono text-sm font-black ${
                          txn.type === 'DEBIT' ? 'text-rose-600' : 'text-emerald-600'
                        }`}>
                          {txn.type === 'DEBIT' ? '-' : '+'}₹{txn.amount.toLocaleString('en-IN')}
                        </span>
                        <span className="block text-[10px] text-slate-400 uppercase font-semibold">{txn.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} RailVoy Pay &bull; Independent Railway Payment Ecosystem &bull; Compliant with NPCI/UPI Standards
      </footer>
    </div>
  );
}
