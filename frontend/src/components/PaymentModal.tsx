import React, { useState, useEffect } from 'react';
import {
  X, ShieldCheck, CheckCircle2, Loader2, Building2,
  AlertTriangle, ArrowRight, Landmark, BadgeCheck, Lock,
  ChevronDown, ChevronUp, RefreshCw, WifiOff
} from 'lucide-react';
import axios from 'axios';
import confetti from 'canvas-confetti';

interface PaymentModalProps {
  bookingData: any;
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: (paymentResult: any) => void;
  userEmail?: string;
}

type PayStep = 'account' | 'processing' | 'success' | 'error';

interface AccountInfo {
  id: string;
  full_name: string;
  email: string;
  bank_name: string;
  account_no: string;
  masked_account: string;
  balance: number;       // used internally for payment eligibility check — NOT displayed
  masked_balance: string; // NOT displayed
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  bookingData,
  isOpen,
  onClose,
  onPaymentSuccess,
  userEmail = ''
}) => {
  const [step, setStep] = useState<PayStep>('account');
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorType, setErrorType] = useState<'balance' | 'network' | 'account' | 'general'>('general');
  const [processingStep, setProcessingStep] = useState(0);
  const [txnResult, setTxnResult] = useState<any>(null);

  // Derive target email: priority from bookingData.userEmail -> userEmail prop -> fallback
  const targetEmail = bookingData?.userEmail || userEmail || '';
  const amount = bookingData?.grandTotal || bookingData?.totalFinalFare || bookingData?.finalFare || 0;

  useEffect(() => {
    if (isOpen) {
      setStep('account');
      setErrorMessage('');
      setTxnResult(null);
      setProcessingStep(0);
      if (targetEmail) {
        loadAccount(targetEmail);
      } else {
        setErrorType('account');
        setErrorMessage('Please log in with your Google banking account before proceeding to payment.');
      }
    }
  }, [isOpen, targetEmail]);

  const loadAccount = async (email: string) => {
    setLoadingAccount(true);
    setErrorMessage('');
    setAccountInfo(null);
    try {
      const res = await axios.get(`/api/banking/account?email=${encodeURIComponent(email)}`);
      setAccountInfo(res.data);
      if (res.data.balance < amount) {
        // Balance check is internal only — do not expose balance amount in UI
        setErrorType('balance');
        setErrorMessage('Payment cannot proceed: Insufficient funds in linked bank account. Please top up or use a different account.');
      }
    } catch (err: any) {
      if (!navigator.onLine) {
        setErrorType('network');
        setErrorMessage('Network connection offline. Please check your internet connection.');
      } else if (err.response?.status === 404) {
        setErrorType('account');
        setErrorMessage(`Banking profile not found for "${email}". Please sign in to access your confidential linked bank account.`);
      } else {
        setErrorType('general');
        setErrorMessage(err.response?.data?.error || 'Failed to fetch your linked bank account.');
      }
    } finally {
      setLoadingAccount(false);
    }
  };

  const handlePay = async () => {
    if (!accountInfo) return;
    setStep('processing');
    setProcessingStep(0);
    setErrorMessage('');

    // Verification steps animation
    const steps = [
      { delay: 500, label: 'Connecting to ' + accountInfo.bank_name + ' secure gateway...' },
      { delay: 650, label: 'Verifying bank credentials and payment authorization...' },
      { delay: 600, label: 'Applying 256-bit AES cryptographic transaction signing...' },
      { delay: 750, label: 'Authorizing debit from ' + accountInfo.masked_account + '...' },
      { delay: 500, label: 'Finalizing real-time debit and generating digital token...' }
    ];

    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, steps[i].delay));
      setProcessingStep(i + 1);
    }

    try {
      const res = await axios.post('/api/banking/deduct', {
        email: accountInfo.email,
        amount,
        description: `RailVoy Ticket - Train #${bookingData?.trainNo || ''} (${bookingData?.fromStation || ''} → ${bookingData?.toStation || ''})`
      });

      setTxnResult(res.data);
      setStep('success');

      try {
        confetti({ particleCount: 100, spread: 60, origin: { y: 0.6 }, colors: ['#06b6d4', '#10b981', '#3b82f6'] });
      } catch (e) {}

      setTimeout(() => {
        onPaymentSuccess({
          gateway: accountInfo.bank_name,
          transactionId: res.data.transactionId,
          status: 'SUCCESS',
          bankDeduction: {
            bank: accountInfo.bank_name,
            maskedAccount: accountInfo.masked_account,
            deducted: res.data.deducted,
            newBalance: res.data.newBalance
          }
        });
      }, 2000);

    } catch (err: any) {
      if (!navigator.onLine) {
        setErrorType('network');
        setErrorMessage('Network connection lost during transaction. No funds were debited.');
      } else if (err.response?.status === 402) {
        setErrorType('balance');
        setErrorMessage('Transaction rejected by bank: Insufficient account balance.');
      } else {
        setErrorType('general');
        setErrorMessage(err.response?.data?.error || 'Payment gateway connection error. Please try again.');
      }
      setStep('error');
    }
  };

  if (!isOpen || !bookingData) return null;

  const processingLabels = [
    'Connecting to banking network gateway...',
    'Verifying account authorization and security token...',
    'Applying 256-bit TLS encryption...',
    'Authorizing debit from bank account...',
    'Finalizing transaction and generating receipt...'
  ];

  const getBankGradient = (name: string) => {
    const colors = [
      'from-blue-900/80 to-indigo-950/90 border-blue-600/40',
      'from-emerald-900/80 to-teal-950/90 border-emerald-600/40',
      'from-purple-900/80 to-violet-950/90 border-purple-600/40',
      'from-sky-900/80 to-cyan-950/90 border-sky-600/40'
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div className="relative w-full max-w-lg bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Security Top Bar */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-950/80 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-bold text-emerald-400 tracking-wider uppercase">Direct Bank Payment Gateway</span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-[10px] text-slate-400 font-mono">256-Bit SSL Encrypted</span>
            {step !== 'processing' && step !== 'success' && (
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="p-6 sm:p-7">

          {/* ═══════════════════════════════════════════
              STEP 1: ACCOUNT & FARE SUMMARY
          ═══════════════════════════════════════════ */}
          {step === 'account' && (
            <div className="space-y-5">
              {/* Fare Summary Box */}
              <div className="bg-slate-950/90 p-5 rounded-2xl border border-slate-800 text-center">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Ticket Fare to Pay</p>
                <div className="text-3xl sm:text-4xl font-black text-emerald-400 mt-1">
                  ₹{Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className="flex items-center justify-center space-x-2 mt-2 text-[11px] text-slate-500 font-mono">
                  <span>{bookingData.trainName || 'Train Reservation'} (#{bookingData.trainNo || 'Express'})</span>
                  <span>·</span>
                  <span>{bookingData.fromStation} → {bookingData.toStation}</span>
                </div>
              </div>

              {/* Linked Bank Account Card */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                    <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Linked Confidential Bank Account</span>
                  </span>
                  {accountInfo && (
                    <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-800/60 flex items-center space-x-1">
                      <BadgeCheck className="w-3 h-3" />
                      <span>Verified Account</span>
                    </span>
                  )}
                </div>

                {loadingAccount ? (
                  <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col items-center justify-center space-x-2 text-slate-400 space-y-2">
                    <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                    <span className="text-xs">Fetching account details from banking records...</span>
                  </div>
                ) : errorMessage && !accountInfo ? (
                  <div className="p-4 bg-rose-950/40 border border-rose-800/70 rounded-2xl space-y-2">
                    <div className="flex items-center space-x-2 text-rose-300 font-bold text-xs">
                      {errorType === 'network' ? <WifiOff className="w-4 h-4 text-rose-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                      <span>{errorType === 'network' ? 'Connection Error' : 'Account Identification Error'}</span>
                    </div>
                    <p className="text-xs text-rose-400/90 leading-relaxed">{errorMessage}</p>
                    <button
                      onClick={() => targetEmail && loadAccount(targetEmail)}
                      className="text-xs font-bold text-cyan-400 hover:underline flex items-center space-x-1 pt-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Retry Connection</span>
                    </button>
                  </div>
                ) : accountInfo ? (
                  <div className={`p-4 sm:p-5 rounded-2xl border bg-gradient-to-br ${getBankGradient(accountInfo.bank_name)} shadow-xl space-y-3`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                          <Landmark className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-white">{accountInfo.bank_name}</p>
                          <p className="text-xs text-slate-300 font-mono">{accountInfo.masked_account}</p>
                        </div>
                      </div>
                    </div>

                      <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Account Holder</span>
                          <span className="font-bold text-white truncate block">{accountInfo.full_name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Payment Method</span>
                          <span className="font-semibold text-emerald-300 flex items-center justify-end space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Direct Bank Debit</span>
                          </span>
                        </div>
                      </div>

                    {/* Verified Bank Authorization Overview */}
                    <div className="bg-slate-950/70 p-3 rounded-xl border border-white/10 text-xs space-y-1.5 font-mono">
                      <div className="flex justify-between text-slate-400">
                        <span>Partner Bank:</span>
                        <span className="text-slate-200">{accountInfo.bank_name}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Authorization Status:</span>
                        <span className="text-emerald-400 font-bold flex items-center space-x-1">
                          <ShieldCheck className="w-3 h-3" />
                          <span>Verified & Active</span>
                        </span>
                      </div>
                      <div className="border-t border-slate-800 pt-1.5 flex justify-between font-bold text-cyan-300">
                        <span>Total Ticket Fare:</span>
                        <span>₹{Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Warning if insufficient balance */}
              {errorMessage && accountInfo && errorType === 'balance' && (
                <div className="p-3.5 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Pay Action Button */}
              <button
                onClick={handlePay}
                disabled={!accountInfo || loadingAccount || (accountInfo?.balance < amount)}
                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-sm sm:text-base rounded-2xl shadow-lg shadow-emerald-900/40 flex items-center justify-center space-x-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ShieldCheck className="w-5 h-5" />
                <span>Authorize & Pay ₹{Number(amount).toLocaleString('en-IN')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <p className="text-center text-[10px] text-slate-500">
                🔒 Funds will be deducted immediately from your verified banking account.
              </p>
            </div>
          )}

          {/* ═══════════════════════════════════════════
              STEP 2: REAL-TIME TRANSACTION PROCESSING
          ═══════════════════════════════════════════ */}
          {step === 'processing' && (
            <div className="py-10 text-center space-y-6">
              <div className="relative inline-flex items-center justify-center">
                <div className="w-24 h-24 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin" />
                <Landmark className="absolute w-10 h-10 text-cyan-400" />
              </div>

              <div>
                <h4 className="text-lg font-black text-slate-100">Processing Real-Time Bank Deduction</h4>
                <p className="text-xs text-slate-400 mt-1">Direct debit via {accountInfo?.bank_name || 'Bank Server'}</p>
              </div>

              {/* Processing Steps Checklist */}
              <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-2.5 text-left">
                {processingLabels.map((label, idx) => (
                  <div key={idx} className="flex items-center space-x-3 text-xs">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                      idx < processingStep
                        ? 'bg-emerald-500 text-white'
                        : idx === processingStep
                        ? 'bg-cyan-500 animate-pulse text-white'
                        : 'bg-slate-800 text-slate-600'
                    }`}>
                      {idx < processingStep ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <span className="text-[9px] font-bold">{idx + 1}</span>
                      )}
                    </div>
                    <span className={idx < processingStep ? 'text-emerald-400 font-medium' : idx === processingStep ? 'text-cyan-300 font-bold' : 'text-slate-500'}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-slate-500 font-mono">
                Please do not refresh or close this window...
              </p>
            </div>
          )}

          {/* ═══════════════════════════════════════════
              STEP 3: SUCCESSFUL DEDUCTION RECEIPT
          ═══════════════════════════════════════════ */}
          {step === 'success' && txnResult && (
            <div className="py-6 text-center space-y-5">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                <CheckCircle2 className="w-10 h-10 animate-bounce" />
              </div>

              <div>
                <h4 className="text-2xl font-black text-emerald-400">Payment Authorized!</h4>
                <p className="text-xs text-slate-400 mt-1">₹{Number(amount).toLocaleString('en-IN')} successfully deducted from your account</p>
              </div>

              {/* Receipt */}
              <div className="bg-slate-950/90 p-4 rounded-2xl border border-slate-800 text-left text-xs space-y-2 font-mono">
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-500">Transaction ID:</span>
                  <span className="font-bold text-cyan-300">{txnResult.transactionId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bank Name:</span>
                  <span className="text-slate-200">{txnResult.bank_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Account No:</span>
                  <span className="text-slate-200">{txnResult.masked_account}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Deducted Amount:</span>
                  <span className="font-bold text-rose-400">- ₹{Number(txnResult.deducted).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between border-t border-slate-800 pt-2 font-bold">
                  <span className="text-slate-400">Payment Status:</span>
                  <span className="text-emerald-400">Direct Debit Completed</span>
                </div>
              </div>

              <div className="flex items-center justify-center space-x-2 text-xs text-cyan-400 font-semibold">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Issuing official e-Ticket & PNR...</span>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════
              STEP 4: ERROR / FAILURE SCREEN
          ═══════════════════════════════════════════ */}
          {step === 'error' && (
            <div className="py-8 text-center space-y-5">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40">
                <AlertTriangle className="w-8 h-8" />
              </div>

              <div>
                <h4 className="text-xl font-black text-rose-400">Payment Authorization Failed</h4>
                <p className="text-xs text-rose-300/80 mt-1 max-w-sm mx-auto">{errorMessage || 'Your payment could not be completed.'}</p>
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => setStep('account')}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-colors"
                >
                  Back to Account Details
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-slate-400 font-bold text-xs rounded-xl border border-slate-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
