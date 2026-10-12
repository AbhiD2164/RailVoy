import React, { useState, useEffect } from 'react';
import {
  X, ShieldCheck, Mail, Lock, ArrowRight, CheckCircle2, Key,
  User as UserIcon, Landmark, AlertCircle, RefreshCw, Sparkles,
  Eye, EyeOff, ChevronRight, Plus, Train, ExternalLink
} from 'lucide-react';
import axios from 'axios';
import { User } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User, token: string) => void;
}

type AuthScreen = 
  | 'login' 
  | 'login_otp' 
  | 'register' 
  | 'register_otp' 
  | 'google_chooser' 
  | 'google_custom' 
  | 'forgot_password' 
  | 'reset_password'
  | 'forgot_mobile';

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const [screen, setScreen] = useState<AuthScreen>('login');
  const [loginMethod, setLoginMethod] = useState<'password' | 'otp' | 'railway_id'>('password');

  // Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [otp, setOtp] = useState('');
  const [mobileOtp, setMobileOtp] = useState('');

  // Railway User ID SSO Fields (RailVoy Accounts App integration)
  const [railwayUserId, setRailwayUserId] = useState('RVACC-IN994821');
  const [railwayPassword, setRailwayPassword] = useState('');
  const [showRailwayPassword, setShowRailwayPassword] = useState(false);


  // Forgot / Reset Password Fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Custom Google Input Fields
  const [googleCustomEmail, setGoogleCustomEmail] = useState('');
  const [googleCustomName, setGoogleCustomName] = useState('');

  // Account uniqueness validation state (for manual registration)
  const [accountValidation, setAccountValidation] = useState<{
    checking: boolean;
    isUnique: boolean | null;
    suggestedBank: string;
    message: string;
  }>({
    checking: false,
    isUnique: null,
    suggestedBank: '',
    message: ''
  });

  // UI States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Google Accounts previously used on this device; never load accounts from a shared dataset.
  const [googleAccounts, setGoogleAccounts] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      resetForm();
      try {
        const saved = JSON.parse(localStorage.getItem('railvoy_recent_accounts') || '[]');
        setGoogleAccounts(Array.isArray(saved) ? saved : []);
      } catch {
        setGoogleAccounts([]);
      }
    }
  }, [isOpen]);

  const rememberAccount = (user: User) => {
    try {
      const existing = JSON.parse(localStorage.getItem('railvoy_recent_accounts') || '[]');
      const accounts = Array.isArray(existing) ? existing : [];
      const next = accounts.filter((account: any) => account.email !== user.email);
      next.unshift({ name: user.name, email: user.email, avatar: user.avatar || '' });
      localStorage.setItem('railvoy_recent_accounts', JSON.stringify(next.slice(0, 5)));
    } catch {
      // Storage may be disabled; authentication still succeeds.
    }
  };

  const forgetAccount = (emailToRemove: string) => {
    const remaining = googleAccounts.filter(account => account.email !== emailToRemove);
    setGoogleAccounts(remaining);
    localStorage.setItem('railvoy_recent_accounts', JSON.stringify(remaining));
  };

  const resetForm = () => {
    setError('');
    setSuccessMsg('');
    setName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setBankAccountNo('');
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setGoogleCustomEmail('');
    setGoogleCustomName('');
    setScreen('login');
    setLoginMethod('password');
    setAccountValidation({ checking: false, isUnique: null, suggestedBank: '', message: '' });
  };

  if (!isOpen) return null;

  // Real-time Bank Account Uniqueness Check (for manual register)
  const checkAccountUniqueness = async (accNo: string) => {
    const clean = accNo.trim().toUpperCase();
    if (clean.length < 5) {
      setAccountValidation({ checking: false, isUnique: null, suggestedBank: '', message: '' });
      return;
    }
    setAccountValidation(prev => ({ ...prev, checking: true }));
    try {
      const res = await axios.get(`/api/auth/check-account?accountNo=${encodeURIComponent(clean)}`);
      setAccountValidation({
        checking: false,
        isUnique: res.data.isUnique,
        suggestedBank: res.data.suggestedBank,
        message: res.data.message
      });
    } catch {
      setAccountValidation({ checking: false, isUnique: null, suggestedBank: '', message: '' });
    }
  };

  // 1. Password-based Login (Direct Instant Sign-In)
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter your email and password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/login', {
        email: email.trim().toLowerCase(),
        password,
        requireOtp: false
      });
      rememberAccount(res.data.user);
      onLoginSuccess(res.data.user, res.data.token);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid credentials or login failed');
    } finally {
      setLoading(false);
    }
  };

  // 2. OTP-based Login Step 1 -> Request Sign-In Code
  const handleRequestLoginOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await axios.post('/api/auth/login-otp-request', { email: email.trim().toLowerCase() });
      setSuccessMsg(`Sign-in verification code sent to ${email}. Check your email / console.`);
      setScreen('login_otp');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to dispatch sign-in OTP');
    } finally {
      setLoading(false);
    }
  };

  // 3. OTP-based Login Step 2 -> Verify OTP & Sign In
  const handleVerifyLoginOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) {
      setError('Please enter the 6-digit verification code');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/verify-login-otp', {
        email: email.trim().toLowerCase(),
        otp: otp.trim()
      });
      rememberAccount(res.data.user);
      onLoginSuccess(res.data.user, res.data.token);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid or expired OTP code');
    } finally {
      setLoading(false);
    }
  };

  // 3b. Railway Passenger Identity SSO Login (from RailVoy Accounts App)
  const handleRailwayAccountLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!railwayUserId.trim() || !railwayPassword.trim()) {
      setError('Please enter both Railway User ID and Password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/railway-account-login', {
        railwayUserId: railwayUserId.trim().toUpperCase(),
        password: railwayPassword
      });
      rememberAccount(res.data.user);
      onLoginSuccess(res.data.user, res.data.token);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Railway User ID authentication failed');
    } finally {
      setLoading(false);
    }
  };


  // 4. Gemini / ChatGPT Style 1-Click Seamless Google Sign-In
  const handleGoogleDirectAuth = async (googleEmail: string, googleName: string, avatarUrl?: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/google-direct', {
        email: googleEmail.trim().toLowerCase(),
        name: googleName.trim(),
        avatar: avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(googleName)}`,
        googleId: 'g_' + Math.floor(10000000 + Math.random() * 90000000)
      });
      rememberAccount(res.data.user);
      onLoginSuccess(res.data.user, res.data.token);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Custom Google Account Handler
  const handleCustomGoogleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleCustomEmail.trim()) {
      setError('Please enter your Google email address');
      return;
    }
    const derivedName = googleCustomName.trim() || googleCustomEmail.split('@')[0];
    handleGoogleDirectAuth(googleCustomEmail, derivedName);
  };

  // 6. Forgot Password Step 1 -> Request Reset OTP
  const handleRequestResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your registered email address');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await axios.post('/api/auth/forgot-password', { email: email.trim().toLowerCase() });
      setSuccessMsg(`Password reset code sent to ${email}. Enter code below.`);
      setScreen('reset_password');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  // 7. Forgot Password Step 2 -> Verify OTP & Update Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) {
      setError('Please enter the 6-digit reset code');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await axios.post('/api/auth/reset-password', {
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        newPassword
      });
      setSuccessMsg('Password reset successful! You can now log in with your new password.');
      setScreen('login');
      setLoginMethod('password');
      setPassword('');
      setOtp('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password. Check your code.');
    } finally {
      setLoading(false);
    }
  };

  // 8. Manual Registration Step 1 -> Validate & Send OTP
  // 8. Manual Registration Step 1 -> Validate & Send OTPs (Email + Mobile)
  const handleInitiateRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password || !repeatPassword || !bankAccountNo.trim() || !mobileNumber.trim()) {
      setError('All fields including Name, Email, Password, Repeat Password, Mobile, and 16-digit Bank Account are required');
      return;
    }
    if (password !== repeatPassword) {
      setError('Passwords do not match. Please ensure both password fields match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    const cleanMobile = mobileNumber.replace(/\D/g, '');
    if (cleanMobile.length < 10) {
      setError('Please provide a valid 10-digit mobile number.');
      return;
    }
    const cleanAcc = bankAccountNo.replace(/\D/g, '');
    if (cleanAcc.length !== 16) {
      setError('Bank account number must be exactly 16 numeric digits.');
      return;
    }
    if (accountValidation.isUnique === false) {
      setError('Bank account number is already registered to another user.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/register-otp', {
        email: email.trim().toLowerCase(),
        mobileNumber: cleanMobile,
        bankAccountNo: cleanAcc
      });

      // Also trigger mock mobile SMS OTP
      await axios.post('/api/auth/register-mobile-otp', {
        mobileNumber: cleanMobile
      }).catch(() => {});

      setSuccessMsg(`Verification codes sent to ${email} and mobile ending in ${cleanMobile.slice(-4)}.`);
      setScreen('register_otp');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to initiate registration');
    } finally {
      setLoading(false);
    }
  };

  // 9. Manual Registration Step 2 -> Complete Registration
  const handleVerifyRegisterOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) {
      setError('Please enter the 6-digit OTP sent to your email');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/register', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        mobileNumber: mobileNumber.replace(/\D/g, ''),
        password,
        bankAccountNo: bankAccountNo.replace(/\D/g, ''),
        otp: otp.trim(),
        mobileOtp: mobileOtp.trim()
      });
      onLoginSuccess(res.data.user, res.data.token);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  // 10. Forgot Account / Locate Email by Mobile Number
  const handleForgotByMobile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMobile = mobileNumber.replace(/\D/g, '');
    if (cleanMobile.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/forgot-by-mobile', { mobileNumber: cleanMobile });
      setEmail(res.data.email);
      setSuccessMsg(res.data.message || `Account located! Reset code sent to mobile and ${res.data.maskedEmail}`);
      setScreen('reset_password');
    } catch (err: any) {
      setError(err.response?.data?.error || 'No account found with this mobile number.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate pure 16-digit numeric bank account
  const generateRandomUniqueAcc = () => {
    const d1 = '4';
    const rest = Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join('');
    const generated = d1 + rest;
    setBankAccountNo(generated);
    checkAccountUniqueness(generated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="relative w-full max-w-md glass-panel p-6 sm:p-8 rounded-3xl shadow-2xl border border-slate-800 animate-in fade-in zoom-in-95 duration-200">

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-xl transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 mb-3 border border-cyan-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-100">
            {screen === 'login' && 'Sign in to RailVoy'}
            {screen === 'login_otp' && 'Verify Sign-In OTP'}
            {screen === 'google_chooser' && 'Sign in with Google'}
            {screen === 'google_custom' && 'Sign in with Google'}
            {screen === 'forgot_password' && 'Reset Your Password'}
            {screen === 'reset_password' && 'Create New Password'}
            {screen === 'register' && 'Create Confidential Account'}
            {screen === 'register_otp' && 'Verify Registration OTP'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {screen === 'login' && 'Access express bookings, seat matrices, and live tracking'}
            {screen === 'google_chooser' && 'Choose an account to continue to RailVoy'}
            {screen === 'google_custom' && 'Enter your Google email address to continue'}
            {screen === 'forgot_password' && 'Enter your registered email to receive a password reset code'}
            {screen === 'reset_password' && 'Enter the 6-digit code and create your new password'}
            {screen === 'login_otp' && 'Enter the one-time code sent to your email'}
            {screen.includes('register') && 'Secure Indian Railways Passenger & Banking System'}
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-300 text-xs font-medium flex items-center space-x-2 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-emerald-300 text-xs font-medium flex items-center space-x-2 animate-in fade-in duration-150">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            SCREEN: GOOGLE ACCOUNT CHOOSER (Gemini / ChatGPT Style UI)
        ═══════════════════════════════════════════════════════════════ */}
        {screen === 'google_chooser' && (
          <div className="space-y-4">
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-2 divide-y divide-slate-800">
              {googleAccounts.map((acc) => (
                <button
                  key={acc.email}
                  disabled={loading}
                  onClick={() => handleGoogleDirectAuth(acc.email, acc.name, acc.avatar)}
                  className="w-full p-3 flex items-center space-x-3 text-left hover:bg-slate-800/70 rounded-xl transition-all group disabled:opacity-50"
                >
                  <img
                    src={acc.avatar}
                    alt={acc.name}
                    className="w-10 h-10 rounded-full border border-slate-600 object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-200 group-hover:text-cyan-300 truncate transition-colors">
                      {acc.name}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{acc.email}</p>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={event => { event.stopPropagation(); forgetAccount(acc.email); }}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); forgetAccount(acc.email); } }}
                    className="px-2 py-1 text-[10px] font-semibold text-slate-400 hover:text-rose-500"
                    title="Remove this saved account"
                  >Remove</span>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                </button>
              ))}

              {/* Use Another Account Option */}
              <button
                disabled={loading}
                onClick={() => { setError(''); setScreen('google_custom'); }}
                className="w-full p-3 flex items-center space-x-3 text-left hover:bg-slate-800/70 rounded-xl transition-all group disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 group-hover:border-cyan-500 group-hover:text-cyan-400 transition-colors">
                  <Plus className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                    Use another Google account
                  </p>
                  <p className="text-xs text-slate-400">Sign in with any other Google email</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </button>
            </div>

            <p className="text-[11px] text-slate-500 text-center px-4 leading-relaxed">
              To continue, Google will share your name, email address, and language preference with RailVoy. No manual account registration required.
            </p>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => { setError(''); setScreen('login'); }}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                ← Back to RailVoy Sign In
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            SCREEN: GOOGLE CUSTOM EMAIL INPUT
        ═══════════════════════════════════════════════════════════════ */}
        {screen === 'google_custom' && (
          <form onSubmit={handleCustomGoogleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Google Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={googleCustomEmail}
                  onChange={(e) => setGoogleCustomEmail(e.target.value)}
                  placeholder="yourname@gmail.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Full Name (Optional)</label>
              <div className="relative">
                <UserIcon className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={googleCustomName}
                  onChange={(e) => setGoogleCustomName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-white hover:bg-slate-100 text-slate-900 font-bold text-sm rounded-xl transition-all flex items-center justify-center space-x-2 shadow-lg shadow-white/10"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"/>
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
                <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9z"/>
                <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"/>
              </svg>
              <span>{loading ? 'Continuing with Google...' : 'Continue with Google'}</span>
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => { setError(''); setScreen('google_chooser'); }}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                ← Back to Account Chooser
              </button>
            </div>
          </form>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            SCREEN: MAIN LOGIN (Google Button + Choice: Password vs OTP)
        ═══════════════════════════════════════════════════════════════ */}
        {screen === 'login' && (
          <div className="space-y-4">
            
            {/* Gemini / ChatGPT Style "Continue with Google" Button */}
            <button
              type="button"
              onClick={() => { setError(''); setSuccessMsg(''); setScreen('google_chooser'); }}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-850 active:scale-[0.99] border border-slate-700 hover:border-slate-600 rounded-2xl text-xs sm:text-sm font-semibold text-slate-100 flex items-center justify-center space-x-3 transition-all shadow-md group"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" className="flex-shrink-0">
                <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"/>
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
                <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9z"/>
                <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"/>
              </svg>
              <span>Continue with Google</span>
            </button>

            <div className="flex items-center my-3">
              <div className="flex-1 border-t border-slate-800" />
              <span className="px-3 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                or sign in with email
              </span>
              <div className="flex-1 border-t border-slate-800" />
            </div>

            {/* Login Method Segmented Switcher: Railway ID vs Password vs OTP */}
            <div className="grid grid-cols-3 p-1 bg-slate-900/90 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => { setError(''); setLoginMethod('railway_id'); }}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center space-x-1 ${
                  loginMethod === 'railway_id'
                    ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Train className="w-3.5 h-3.5" />
                <span>Railway ID</span>
              </button>
              <button
                type="button"
                onClick={() => { setError(''); setLoginMethod('password'); }}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center space-x-1 ${
                  loginMethod === 'password'
                    ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Password</span>
              </button>
              <button
                type="button"
                onClick={() => { setError(''); setLoginMethod('otp'); }}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center space-x-1 ${
                  loginMethod === 'otp'
                    ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>One-Time OTP</span>
              </button>
            </div>

            {/* OPTION A: RAILWAY USER ID (RVACC) SSO LOGIN FORM */}
            {loginMethod === 'railway_id' && (
              <form onSubmit={handleRailwayAccountLogin} className="space-y-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300">Universal Railway User ID</label>
                    <a
                      href="http://localhost:5175"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-sky-400 hover:underline flex items-center space-x-1 font-medium"
                    >
                      <span>Get Railway ID</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="relative">
                    <Train className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={railwayUserId}
                      onChange={(e) => setRailwayUserId(e.target.value.toUpperCase())}
                      placeholder="e.g. RVACC-IN994821"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm font-mono tracking-wider text-amber-300 font-bold focus:outline-none focus:border-sky-500 uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Railway Account Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type={showRailwayPassword ? 'text' : 'password'}
                      required
                      value={railwayPassword}
                      onChange={(e) => setRailwayPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRailwayPassword(!showRailwayPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-200"
                    >
                      {showRailwayPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-sky-950/40 border border-sky-800/60 rounded-xl text-[11px] text-sky-300 space-y-1">
                  <span className="font-bold block">One Common ID for Indian Railways</span>
                  <span>Demo ID: <code className="font-bold text-amber-300">RVACC-IN994821</code> / Pass: <code className="font-bold text-amber-300">Railway@123</code></span>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center space-x-2 shadow-lg shadow-sky-950/40"
                >
                  <span>{loading ? 'Authenticating with Railway Registry...' : 'Sign In with Railway ID'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* OPTION B: PASSWORD LOGIN FORM */}
            {loginMethod === 'password' && (
              <form onSubmit={handlePasswordLogin} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300">Password</label>
                    <button
                      type="button"
                      onClick={() => { setError(''); setScreen('forgot_password'); }}
                      className="text-[11px] text-cyan-400 hover:underline font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1">
                  <span className="text-slate-400">Quick fill demo:</span>
                  <button
                    type="button"
                    onClick={() => { setEmail('admin@railvoy.com'); setPassword('admin123'); }}
                    className="text-cyan-400 hover:underline font-medium"
                  >
                    Use Admin Demo
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-sm rounded-xl transition-all flex items-center justify-center space-x-2 shadow-lg shadow-cyan-950/40"
                >
                  <span>{loading ? 'Signing in...' : 'Sign In with Password'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* OPTION C: OTP LOGIN FORM */}
            {loginMethod === 'otp' && (
              <form onSubmit={handleRequestLoginOtp} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    We will send a 6-digit verification code to this email to verify and sign in without password.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-sm rounded-xl transition-all flex items-center justify-center space-x-2 shadow-lg shadow-cyan-950/40"
                >
                  <span>{loading ? 'Sending Code...' : 'Send Sign-In Code'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}


            <div className="text-center text-xs text-slate-400 pt-2 border-t border-slate-800/80">
              Don't have an account?{' '}
              <button
                onClick={() => { setError(''); setSuccessMsg(''); setScreen('register'); }}
                className="text-cyan-400 font-semibold hover:underline"
              >
                Create Account
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            SCREEN: VERIFY SIGN-IN OTP
        ═══════════════════════════════════════════════════════════════ */}
        {screen === 'login_otp' && (
          <form onSubmit={handleVerifyLoginOtp} className="space-y-4">
            <div className="p-3 bg-cyan-950/40 border border-cyan-800/60 rounded-xl text-cyan-300 text-xs">
              A 6-digit verification code has been dispatched to <strong>{email}</strong>.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Enter 6-Digit OTP</label>
              <div className="relative">
                <Key className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="e.g. 582194"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm font-mono tracking-widest text-cyan-300 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg"
            >
              {loading ? 'Verifying Code...' : 'Verify & Sign In'}
            </button>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
              <button
                type="button"
                onClick={() => setScreen('login')}
                className="text-slate-400 hover:text-slate-200"
              >
                ← Back to Login
              </button>
              <button
                type="button"
                onClick={handleRequestLoginOtp}
                className="text-cyan-400 hover:underline flex items-center space-x-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Resend Code</span>
              </button>
            </div>
          </form>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            SCREEN: FORGOT PASSWORD (STEP 1: REQUEST CODE)
        ═══════════════════════════════════════════════════════════════ */}
        {screen === 'forgot_password' && (
          <form onSubmit={handleRequestResetOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Registered Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="passenger@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                We will email you a secure 6-digit verification code to reset your password.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg flex items-center justify-center space-x-2"
            >
              <span>{loading ? 'Sending Reset Code...' : 'Send Password Reset Code'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => { setError(''); setSuccessMsg(''); setScreen('login'); }}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                ← Return to Sign In
              </button>
            </div>
          </form>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            SCREEN: RESET PASSWORD (STEP 2: VERIFY CODE & SET NEW PASSWORD)
        ═══════════════════════════════════════════════════════════════ */}
        {screen === 'reset_password' && (
          <form onSubmit={handleResetPassword} className="space-y-3.5">
            <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-300 text-xs">
              Password reset code dispatched to <strong>{email}</strong>.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">6-Digit Reset Code</label>
              <div className="relative">
                <Key className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="e.g. 748291"
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm font-mono tracking-widest text-amber-300 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-10 pr-10 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Confirm New Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg"
            >
              {loading ? 'Updating Password...' : 'Save New Password & Sign In'}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => { setError(''); setSuccessMsg(''); setScreen('forgot_password'); }}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                ← Request New Code
              </button>
            </div>
          </form>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            SCREEN: MANUAL REGISTRATION (STEP 1: DETAILS & BANK ACC)
        ═══════════════════════════════════════════════════════════════ */}
        {screen === 'register' && (
          <form onSubmit={handleInitiateRegister} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
              <div className="relative">
                <UserIcon className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Aditi Roy"
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Mobile Number (10 digits)</label>
              <div className="relative">
                <input
                  type="tel"
                  required
                  maxLength={10}
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="9876543210"
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Repeat Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={repeatPassword}
                  onChange={(e) => setRepeatPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">Bank Account Number (16 Digits)</label>
                <button
                  type="button"
                  onClick={generateRandomUniqueAcc}
                  className="text-[10px] text-cyan-400 hover:underline flex items-center space-x-1"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Auto-Generate (16-Digit)</span>
                </button>
              </div>
              <div className="relative">
                <Landmark className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  maxLength={16}
                  value={bankAccountNo}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    setBankAccountNo(digits);
                    checkAccountUniqueness(digits);
                  }}
                  placeholder="16 digits numeric (e.g. 3847291056473829)"
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              {accountValidation.suggestedBank && (
                <p className="text-[10px] text-emerald-400 mt-1 flex items-center space-x-1 font-mono">
                  <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                  <span>Verified: {accountValidation.suggestedBank}</span>
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || accountValidation.isUnique === false}
              className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-2"
            >
              <span>{loading ? 'Sending OTPs...' : 'Send Verification OTPs'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="text-center text-xs text-slate-400 pt-1">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => { setError(''); setSuccessMsg(''); setScreen('login'); }}
                className="text-cyan-400 font-semibold hover:underline"
              >
                Sign In
              </button>
            </div>
          </form>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            SCREEN: MANUAL REGISTRATION (STEP 2: VERIFY REGISTRATION OTP)
        ═══════════════════════════════════════════════════════════════ */}
        {screen === 'register_otp' && (
          <form onSubmit={handleVerifyRegisterOtp} className="space-y-4">
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs">
              OTPs dispatched to <strong>{email}</strong> and mobile ending in <strong>{mobileNumber.slice(-4)}</strong>.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Verification OTP (6 Digits)</label>
              <div className="relative">
                <Key className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="e.g. 481920"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm font-mono tracking-widest text-cyan-300 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Mobile SMS OTP (Mock / Academic)</label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={6}
                  value={mobileOtp}
                  onChange={(e) => setMobileOtp(e.target.value)}
                  placeholder="e.g. 123456 (logged in console)"
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm font-mono tracking-widest text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg"
            >
              {loading ? 'Finalizing Account...' : 'Complete Registration & Link Bank'}
            </button>

            <div className="text-center text-xs text-slate-400">
              <button
                type="button"
                onClick={() => setScreen('register')}
                className="text-slate-400 hover:text-slate-200"
              >
                ← Back to Edit Details
              </button>
            </div>
          </form>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            SCREEN: FORGOT ACCOUNT BY MOBILE
        ═══════════════════════════════════════════════════════════════ */}
        {screen === 'forgot_mobile' && (
          <form onSubmit={handleForgotByMobile} className="space-y-4">
            <div className="p-3 bg-teal-950/40 border border-teal-800/60 rounded-xl text-teal-300 text-xs">
              Enter your registered 10-digit mobile number to locate your account credentials.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Registered Mobile Number</label>
              <input
                type="tel"
                maxLength={10}
                required
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 9876543210"
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm font-mono text-slate-100 focus:outline-none focus:border-teal-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg"
            >
              {loading ? 'Locating Account...' : 'Find Account & Send Reset Code'}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => { setError(''); setSuccessMsg(''); setScreen('login'); }}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                ← Return to Sign In
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
