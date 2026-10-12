import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Train, ShieldCheck, ArrowRight, CheckCircle2, User, Key, Lock,
  Mail, Phone, Calendar, MapPin, Copy, Check, LogOut, ExternalLink,
  AlertCircle, Sparkles, Building2, Fingerprint, Award, RefreshCw, Eye
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface Account {
  railwayUserId: string;
  name: string;
  email: string;
  phone: string;
  gender: string;
  dob: string;
  address?: string;
  aadhaarLast4?: string;
  linkedApps?: string[];
  alerts?: any[];
}

export default function App() {
  const [screen, setScreen] = useState<'landing' | 'register' | 'login' | 'dashboard'>('landing');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [account, setAccount] = useState<Account | null>(null);
  const [token, setToken] = useState<string>(localStorage.getItem('rvacc_token') || '');

  // Form Fields
  const [name, setName] = useState('');
  const [dob, setDob] = useState('1996-05-12');
  const [gender, setGender] = useState('M');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [address, setAddress] = useState('');
  const [aadhaarLast4, setAadhaarLast4] = useState('');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Login
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginSuccess, setLoginSuccess] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginShowPassword, setLoginShowPassword] = useState(false);

  // Forgot-password multi-step state (0 = login form, 1 = enter identifier, 2 = enter OTP + new password)
  const [loginForgotStep, setLoginForgotStep] = useState<0 | 1 | 2>(0);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotRailwayId, setForgotRailwayId] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');

  // Copy helper
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
      axios.get('/api/accounts/profile')
        .then(res => {
          setAccount(res.data);
          setScreen('dashboard');
        })
        .catch(() => handleLogout());
    }
  }, [token]);

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (step === 1) {
      if (!name.trim() || name.trim().length < 2) {
        setFormError('Please enter full legal name');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!email.includes('@') || !email.includes('.')) {
        setFormError('Valid email address required');
        return;
      }
      if (phone.length !== 10) {
        setFormError('Valid 10-digit mobile number required');
        return;
      }
      if (password.length < 6) {
        setFormError('Password must be at least 6 characters');
        return;
      }
      if (password !== confirmPassword) {
        setFormError('Passwords do not match');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      submitRegistration();
    }
  };

  const submitRegistration = async () => {
    setFormLoading(true);
    setFormError('');
    try {
      const res = await axios.post('/api/accounts/register', {
        name,
        dob,
        gender,
        email,
        phone,
        password,
        address,
        aadhaarLast4
      });

      setAccount(res.data.account);
      setToken(res.data.token);
      localStorage.setItem('rvacc_token', res.data.token);
      axios.defaults.headers.common.Authorization = `Bearer ${res.data.token}`;
      setScreen('dashboard');
      confetti({ particleCount: 90, spread: 80 });
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Registration failed. Please check inputs.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await axios.post('/api/accounts/login', {
        identifier: loginId,
        password: loginPassword
      });
      setAccount(res.data.account);
      setToken(res.data.token);
      localStorage.setItem('rvacc_token', res.data.token);
      axios.defaults.headers.common.Authorization = `Bearer ${res.data.token}`;
      setScreen('dashboard');
    } catch (err: any) {
      setLoginError(err.response?.data?.error || 'Invalid Railway User ID or password');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setAccount(null);
    setToken('');
    localStorage.removeItem('rvacc_token');
    delete axios.defaults.headers.common.Authorization;
    setScreen('landing');
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleForgotRequest = async () => {
    const id = forgotIdentifier.trim();
    if (!id) {
      setLoginError('Please enter your Railway User ID, email, or mobile number');
      return;
    }
    setLoginError('');
    setLoginSuccess('');
    setLoginLoading(true);
    try {
      // Determine which field to send
      const isEmail = id.includes('@');
      const isPhone = /^\d{10}$/.test(id.replace(/\D/g, ''));
      const payload: Record<string, string> = {};
      if (id.toUpperCase().startsWith('RVACC-')) {
        payload.railwayUserId = id.toUpperCase();
      } else if (isEmail) {
        payload.email = id.toLowerCase();
      } else if (isPhone) {
        payload.phone = id.replace(/\D/g, '');
      } else {
        // Try as railwayUserId anyway
        payload.railwayUserId = id.toUpperCase();
      }
      const res = await axios.post('/api/accounts/forgot-password', payload);
      setForgotRailwayId(res.data.railwayUserId || '');
      setLoginSuccess(res.data.message || 'Reset code sent to your Security Inbox.');
      setLoginForgotStep(2);
    } catch (err: any) {
      setLoginError(err.response?.data?.error || 'Could not find this account. Please recheck.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleForgotReset = async () => {
    if (!forgotOtp.trim() || forgotOtp.length < 6) {
      setLoginError('Please enter the 6-digit verification code');
      return;
    }
    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      setLoginError('New password must be at least 6 characters');
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setLoginError('Passwords do not match');
      return;
    }
    setLoginError('');
    setLoginSuccess('');
    setLoginLoading(true);
    try {
      const res = await axios.post('/api/accounts/reset-password', {
        railwayUserId: forgotRailwayId,
        otp: forgotOtp.trim(),
        newPassword: forgotNewPassword
      });
      setLoginSuccess(res.data.message || 'Password updated! Please sign in with your new password.');
      // Reset forgot state and go back to login form
      setLoginForgotStep(0);
      setForgotIdentifier('');
      setForgotOtp('');
      setForgotNewPassword('');
      setForgotConfirmPassword('');
      setForgotRailwayId('');
    } catch (err: any) {
      setLoginError(err.response?.data?.error || 'Failed to reset password. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-sky-950 text-white border-b border-sky-900 shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div
            onClick={() => setScreen(token ? 'dashboard' : 'landing')}
            className="flex items-center space-x-3 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-2xl bg-sky-600/30 border border-sky-400/40 flex items-center justify-center text-sky-300">
              <Train className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-black tracking-tight text-white">RailVoy Accounts</span>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-sky-800 text-sky-200 border border-sky-700">
                  National Railway Identity
                </span>
              </div>
              <p className="text-[11px] text-sky-300">Unified Indian Railway Passenger Single Sign-On</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {screen === 'dashboard' && account ? (
              <div className="flex items-center space-x-3">
                <span className="hidden sm:inline text-xs font-semibold text-sky-200">
                  {account.name}
                </span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 bg-sky-900 hover:bg-sky-800 text-sky-200 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setScreen('login')}
                  className="px-4 py-2 bg-sky-900 hover:bg-sky-800 text-sky-100 rounded-xl text-xs font-bold transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => { setStep(1); setScreen('register'); }}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black rounded-xl text-xs shadow-sm transition-all"
                >
                  Create Railway ID
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-center">

        {/* 1. LANDING */}
        {screen === 'landing' && (
          <div className="space-y-8 py-6">
            <div className="bg-gradient-to-br from-sky-950 via-blue-900 to-slate-950 text-white rounded-3xl p-8 sm:p-12 shadow-xl border border-sky-800/60 relative overflow-hidden text-center sm:text-left">
              <div className="max-w-xl space-y-4">
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-sky-500/20 border border-sky-400/30 text-sky-300 text-xs font-bold">
                  <Award className="w-4 h-4" />
                  <span>Universal Identity for Indian Railways Passengers</span>
                </div>
                <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
                  One Common ID. Every Railway Service.
                </h1>
                <p className="text-sm sm:text-base text-sky-100 leading-relaxed">
                  Just like railway officers use HRMS ID across leave, pass, and reservation systems, RailVoy Accounts gives every passenger a centralized Railway ID. Create your account once and sign in to RailVoy and upcoming transit platforms instantly.
                </p>
                <div className="flex flex-wrap gap-3 pt-3 justify-center sm:justify-start">
                  <button
                    onClick={() => { setStep(1); setScreen('register'); }}
                    className="px-6 py-3.5 bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-sm rounded-2xl shadow-lg shadow-sky-950/40 flex items-center space-x-2 transition-all hover:scale-105"
                  >
                    <span>Generate Railway User ID</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setScreen('login')}
                    className="px-6 py-3.5 bg-white/10 hover:bg-white/20 text-white font-bold text-sm rounded-2xl border border-white/20 transition-colors"
                  >
                    Sign In with Existing ID
                  </button>
                </div>
              </div>
            </div>

            {/* Feature Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center font-bold">
                  <Fingerprint className="w-6 h-6" />
                </div>
                <h3 className="font-extrabold text-slate-900 text-base">Permanent Railway User ID</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Your <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-sky-800">RVACC-XXXXXXXX</code> identity holds your verified passenger details, preferred berths, and quotas.
                </p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <Building2 className="w-6 h-6" />
                </div>
                <h3 className="font-extrabold text-slate-900 text-base">Separated Authentication</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  User accounts and identity verification live on this separate service. RailVoy booking never handles your primary identity setup.
                </p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="font-extrabold text-slate-900 text-base">Seamless SSO into RailVoy</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Click &ldquo;Sign in with Railway Account&rdquo; on RailVoy, enter your Railway ID and password, and book your tickets in seconds.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 2. MULTI-STEP REGISTRATION */}
        {screen === 'register' && (
          <div className="max-w-xl mx-auto w-full bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xl space-y-6">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center mx-auto mb-2">
                <Train className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black text-slate-900">National Railway Passenger Registration</h2>
              <p className="text-xs text-slate-500">Create your unified Railway Passenger ID (Step {step} of 3)</p>
            </div>

            {/* Stepper Indicator */}
            <div className="flex items-center justify-between max-w-xs mx-auto">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center space-x-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                    step === i
                      ? 'bg-sky-600 text-white ring-4 ring-sky-100'
                      : step > i
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-400'
                  }`}>
                    {step > i ? <Check className="w-4 h-4" /> : i}
                  </div>
                  {i < 3 && <div className={`w-12 h-0.5 ${step > i ? 'bg-emerald-600' : 'bg-slate-200'}`} />}
                </div>
              ))}
            </div>

            {formError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-700 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleNextStep} className="space-y-4 text-xs font-semibold">

              {/* STEP 1: Personal Details */}
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-700 uppercase mb-1">Full Legal Name (as on Govt ID)</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ananya Roy"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-sky-600 focus:bg-white text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 uppercase mb-1">Date of Birth</label>
                      <input
                        type="date"
                        required
                        value={dob}
                        onChange={e => setDob(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-sky-600 focus:bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 uppercase mb-1">Gender</label>
                      <select
                        value={gender}
                        onChange={e => setGender(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-sky-600 focus:bg-white text-sm font-semibold"
                      >
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                        <option value="O">Other</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Contact & Password */}
              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-700 uppercase mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="ananya.roy@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-sky-600 focus:bg-white text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 uppercase mb-1">10-Digit Mobile Number</label>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      placeholder="9876543210"
                      value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-sky-600 focus:bg-white text-sm font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 uppercase mb-1">Password</label>
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-sky-600 focus:bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 uppercase mb-1">Confirm Password</label>
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-sky-600 focus:bg-white text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Address & Verification */}
              {step === 3 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-700 uppercase mb-1">Residential Address</label>
                    <input
                      type="text"
                      placeholder="e.g. 14/B Rail Vihar, Sector 62, Noida"
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-sky-600 focus:bg-white text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 uppercase mb-1">
                      Aadhaar Card Last 4 Digits <span className="text-slate-400 font-normal">(Optional Verification)</span>
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="9944"
                      value={aadhaarLast4}
                      onChange={e => setAadhaarLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-sky-600 focus:bg-white text-sm font-mono text-center tracking-widest text-lg font-bold"
                    />
                  </div>

                  <div className="p-3 bg-sky-50 rounded-xl border border-sky-200 text-[11px] text-sky-800 font-normal">
                    🎖️ Your Railway User ID will be issued immediately upon completing this step.
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={() => setStep((step - 1) as any)}
                    className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                  >
                    Back
                  </button>
                )}
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 py-3.5 bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-sm rounded-xl shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {formLoading ? 'Creating ID...' : step === 3 ? 'Generate Railway User ID' : 'Continue'}
                </button>
              </div>
            </form>

            <div className="text-center text-xs text-slate-500">
              Already have a Railway User ID?{' '}
              <button onClick={() => setScreen('login')} className="text-sky-700 font-bold hover:underline">
                Sign In
              </button>
            </div>
          </div>
        )}

        {/* 3. LOGIN */}
        {screen === 'login' && (
          <div className="max-w-md mx-auto w-full space-y-0">
            {/* Header card */}
            <div className="bg-gradient-to-br from-sky-950 via-blue-950 to-slate-950 text-white rounded-t-3xl px-8 pt-8 pb-6 border border-sky-800/60 border-b-0">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-11 h-11 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-white leading-tight">Sign In to Railway Portal</h2>
                  <p className="text-[11px] text-sky-300 mt-0.5">Your unified Indian Railways identity</p>
                </div>
              </div>

              {loginError && (
                <div className="p-3 bg-rose-900/60 border border-rose-700/80 rounded-xl text-rose-200 text-xs font-semibold flex items-center space-x-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}
              {loginSuccess && (
                <div className="p-3 bg-emerald-900/60 border border-emerald-700/80 rounded-xl text-emerald-200 text-xs font-semibold flex items-center space-x-2 mb-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>{loginSuccess}</span>
                </div>
              )}
            </div>

            {/* Form card */}
            <div className="bg-slate-900 border border-sky-900/60 border-t-0 rounded-b-3xl px-8 py-6 shadow-2xl">
              {screen === 'login' && loginForgotStep === 0 && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                      Railway User ID / Email / Mobile
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        placeholder="RVACC-IN994821 or email"
                        value={loginId}
                        onChange={e => setLoginId(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide">Password</label>
                      <button
                        type="button"
                        onClick={() => { setLoginError(''); setLoginSuccess(''); setLoginForgotStep(1); }}
                        className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold hover:underline transition"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type={loginShowPassword ? 'text' : 'password'}
                        required
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={e => setLoginPassword(e.target.value)}
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setLoginShowPassword(!loginShowPassword)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-200 transition"
                        tabIndex={-1}
                      >
                        {loginShowPassword
                          ? <Eye className="w-4 h-4" />
                          : <Eye className="w-4 h-4 opacity-40" />}
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-sky-950/70 border border-sky-800/60 rounded-xl text-[11px] text-sky-300 font-normal leading-relaxed">
                    <span className="font-bold text-sky-200 block mb-0.5">Demo credentials</span>
                    ID: <code className="font-bold text-amber-300">RVACC-IN994821</code> &nbsp;/&nbsp; Password: <code className="font-bold text-amber-300">Railway@123</code>
                  </div>

                  <button
                    type="submit"
                    disabled={loginLoading}
                    className="w-full py-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-sky-950/60 transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
                  >
                    <span>{loginLoading ? 'Authenticating...' : 'Access Identity Dashboard'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* ── FORGOT PASSWORD: Step 1 — enter identifier ── */}
              {loginForgotStep === 1 && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 mb-1">
                    <button
                      type="button"
                      onClick={() => { setLoginForgotStep(0); setLoginError(''); setLoginSuccess(''); }}
                      className="text-sky-400 hover:text-sky-200 text-xs flex items-center space-x-1 transition"
                    >
                      <ArrowRight className="w-3 h-3 rotate-180" />
                      <span>Back to Sign In</span>
                    </button>
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    Enter your <span className="font-bold text-white">Railway User ID</span>, registered <span className="font-bold text-white">email</span>, or <span className="font-bold text-white">mobile number</span>. A one-time code will appear in your Security Inbox.
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                      Railway ID / Email / Mobile
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="RVACC-XXXXXX or email or phone"
                        value={forgotIdentifier}
                        onChange={e => setForgotIdentifier(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500 transition"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={loginLoading}
                    onClick={handleForgotRequest}
                    className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-extrabold text-sm rounded-xl shadow-lg transition-all disabled:opacity-50"
                  >
                    {loginLoading ? 'Sending Code...' : 'Send Reset Code to Security Inbox'}
                  </button>
                </div>
              )}

              {/* ── FORGOT PASSWORD: Step 2 — enter OTP + new password ── */}
              {loginForgotStep === 2 && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 mb-1">
                    <button
                      type="button"
                      onClick={() => { setLoginForgotStep(1); setLoginError(''); setLoginSuccess(''); }}
                      className="text-sky-400 hover:text-sky-200 text-xs flex items-center space-x-1 transition"
                    >
                      <ArrowRight className="w-3 h-3 rotate-180" />
                      <span>Back</span>
                    </button>
                  </div>
                  <div className="p-3 bg-amber-950/60 border border-amber-700/60 rounded-xl text-amber-200 text-xs leading-relaxed">
                    A 6-digit code was sent to your <span className="font-bold">Security Inbox</span> (sign in with your current credentials to see it, or check the backend console). Railway ID: <code className="font-bold text-amber-300">{forgotRailwayId}</code>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">6-Digit Verification Code</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="123456"
                      value={forgotOtp}
                      onChange={e => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-lg font-mono tracking-widest text-amber-300 text-center outline-none focus:border-sky-500 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">New Password</label>
                    <input
                      type="password"
                      placeholder="Min 6 characters"
                      value={forgotNewPassword}
                      onChange={e => setForgotNewPassword(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">Confirm New Password</label>
                    <input
                      type="password"
                      placeholder="Repeat new password"
                      value={forgotConfirmPassword}
                      onChange={e => setForgotConfirmPassword(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500 transition"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={loginLoading}
                    onClick={handleForgotReset}
                    className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold text-sm rounded-xl shadow-lg transition-all disabled:opacity-50"
                  >
                    {loginLoading ? 'Updating Password...' : 'Set New Password'}
                  </button>
                </div>
              )}

              <div className="text-center text-xs text-slate-500 mt-4">
                {loginForgotStep === 0 && (
                  <>Need a Railway User ID?{' '}
                    <button onClick={() => { setStep(1); setScreen('register'); }} className="text-sky-400 font-bold hover:underline">
                      Register New Identity
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}


        {/* 4. DASHBOARD & DIGITAL RAILWAY PASS CARD */}
        {screen === 'dashboard' && account && (
          <div className="space-y-6">

            {/* Official Digital Railway Identity Card */}
            <div className="bg-gradient-to-r from-sky-950 via-blue-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-sky-800 relative overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-sky-800/80 pb-4 mb-6">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-sky-300">
                    <Train className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white">INDIAN RAILWAYS PASSENGER REGISTRY</h2>
                    <p className="text-[10px] text-sky-300 uppercase tracking-widest">Official Digital Identity Card</p>
                  </div>
                </div>
                <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-400/30 flex items-center space-x-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>OFFICIALLY VERIFIED</span>
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-8 space-y-4">
                  <div>
                    <span className="text-[10px] text-sky-300 uppercase tracking-widest font-bold">Universal Railway User ID</span>
                    <div className="flex items-center space-x-3 mt-1">
                      <span className="font-mono text-2xl sm:text-3xl font-black text-amber-300 tracking-wider">
                        {account.railwayUserId}
                      </span>
                      <button
                        onClick={() => copyId(account.railwayUserId)}
                        className="px-3 py-1 bg-white/10 hover:bg-white/20 text-sky-100 rounded-xl text-xs font-bold flex items-center space-x-1 border border-white/20 transition-colors"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] text-sky-400 uppercase font-semibold">Passenger Name</span>
                      <p className="font-bold text-white text-sm">{account.name}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-sky-400 uppercase font-semibold">Registered Email</span>
                      <p className="font-mono text-white text-[11px] truncate">{account.email}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-sky-400 uppercase font-semibold">Mobile</span>
                      <p className="font-mono text-white">{account.phone}</p>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-4 bg-white/10 rounded-2xl p-4 border border-white/15 backdrop-blur-xs text-xs space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300 block">Single Sign-On Instructions</span>
                  <p className="text-[11px] text-sky-100 leading-relaxed font-normal">
                    You can use this <strong>{account.railwayUserId}</strong> to login directly into RailVoy without creating a new password on that site.
                  </p>
                  <a
                    href="http://localhost:5173"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center space-x-1.5 transition-all shadow-md block text-center"
                  >
                    <span>Open RailVoy Booking</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>

            {/* Security Inbox & Verification Codes (7-Day Active Session) */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-sky-700" />
                  <h3 className="font-extrabold text-slate-900 text-base">Security Inbox &amp; Verification Center</h3>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                    7-Day Active Device Session
                  </span>
                  <button
                    onClick={() => {
                      if (token) {
                        axios.get('/api/accounts/profile').then(res => setAccount(res.data)).catch(() => {});
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
                    title="Refresh Alerts"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {(!account.alerts || account.alerts.length === 0) ? (
                <div className="p-4 bg-slate-50 rounded-2xl text-center text-xs text-slate-500 font-medium">
                  No active security codes. When you request a password reset or security verification in RailVoy, your confidential verification codes are dispatched securely to this Accounts panel.
                </div>
              ) : (
                <div className="space-y-3">
                  {account.alerts.map((al: any) => (
                    <div key={al.id || Math.random()} className="p-4 rounded-2xl bg-sky-50/70 border border-sky-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-extrabold text-sky-950">{al.title}</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-200/80 text-sky-900 uppercase">
                            {al.type}
                          </span>
                        </div>
                        <p className="text-slate-600 text-[11px] leading-relaxed max-w-lg">{al.message}</p>
                        <span className="text-[10px] text-slate-400 font-mono block">
                          {new Date(al.createdAt).toLocaleString('en-IN')}
                        </span>
                      </div>

                      {al.code && (
                        <div className="flex items-center space-x-2 bg-white px-3.5 py-2 rounded-xl border border-sky-300 shadow-2xs">
                          <span className="font-mono text-base font-black text-sky-900 tracking-widest">
                            {al.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyId(al.code)}
                            className="text-[10px] font-bold text-sky-700 hover:underline"
                          >
                            Copy Code
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Application Ecosystem Status */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <Building2 className="w-5 h-5 text-sky-700" />
                <h3 className="font-extrabold text-slate-900 text-base">Connected Railway Services</h3>
              </div>


              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-sky-950">RailVoy Main Booking</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <p className="text-[11px] text-slate-600">e-Ticket reservation with Dynamic Surge &amp; Live Quota</p>
                  <span className="text-[10px] font-bold text-sky-700 uppercase">Single Sign-On Active</span>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-emerald-950">RailVoy Pay Wallet</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  </div>
                  <p className="text-[11px] text-slate-600">Separated third-party payment gateway with MPIN</p>
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">UPI Ready</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">NTES Live Tracking</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  </div>
                  <p className="text-[11px] text-slate-600">Live GPS rake positioning and station arrival boards</p>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Universal Access</span>
                </div>
              </div>
            </div>

          </div>
        )}

      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} RailVoy Accounts &bull; Center for Railway Information Systems (CRIS) Inspired Passenger Identity
      </footer>
    </div>
  );
}
