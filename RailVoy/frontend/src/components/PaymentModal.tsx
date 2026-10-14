import React, { useState, useEffect } from 'react';
import {
  X, ShieldCheck, CheckCircle2, AlertCircle, Lock, RefreshCw, CreditCard,
  KeyRound, Wallet, Smartphone, ExternalLink, ArrowRight
} from 'lucide-react';
import axios from 'axios';
import confetti from 'canvas-confetti';

interface PaymentModalProps {
  bookingData: any;
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: (paymentResult: any) => void;
  userEmail: string;
}

type PaymentMethod = 'railvoy_pay' | 'net_banking';

export const PaymentModal: React.FC<PaymentModalProps> = ({
  bookingData,
  isOpen,
  onClose,
  onPaymentSuccess,
  userEmail
}) => {
  const [method, setMethod] = useState<PaymentMethod>('railvoy_pay');
  const [step, setStep] = useState<'form' | 'processing' | 'success' | 'error'>('form');
  const [processingStep, setProcessingStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [txnResult, setTxnResult] = useState<any>(null);

  // Method 1: RailVoy Pay Fields (User ID / UPI ID + 4-Digit MPIN)
  const [rvPayId, setRvPayId] = useState('RVPAY-DEMO1001');
  const [rvPayMpin, setRvPayMpin] = useState('');

  // Method 2: Net Banking Fields (Direct Account + 6-digit OTP)
  const [accountInfo, setAccountInfo] = useState<any>(null);
  const [netBankingOtp, setNetBankingOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [requestingOtp, setRequestingOtp] = useState(false);

  const targetEmail = bookingData?.userEmail || userEmail;
  const amount = bookingData?.grandTotal || bookingData?.finalFare || 0;

  useEffect(() => {
    if (isOpen) {
      setStep('form');
      setErrorMessage('');
      setTxnResult(null);
      setProcessingStep(0);
      setRvPayMpin('');
      setNetBankingOtp('');
      setOtpSent(false);

      // Fetch linked bank account for net banking tab
      if (targetEmail) {
        axios.get(`/api/banking/account?email=${encodeURIComponent(targetEmail)}`)
          .then(res => setAccountInfo(res.data))
          .catch(() => {});
      }
    }
  }, [isOpen, targetEmail]);

  // Request SMS OTP for Net Banking method (PIN/OTP is NEVER displayed on the screen!)
  const handleRequestBankOtp = async () => {
    setRequestingOtp(true);
    setErrorMessage('');
    try {
      await axios.post('/api/banking/request-otp', {
        email: targetEmail,
        amount: Number(amount),
        bankName: accountInfo?.bank_name || 'State Bank of India'
      });
      setOtpSent(true);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || 'Could not send authorization OTP.');
    } finally {
      setRequestingOtp(false);
    }
  };

  // Submit Payment via RailVoy Pay or Net Banking
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (method === 'railvoy_pay') {
      if (!rvPayId.trim()) {
        setErrorMessage('Please enter your RailVoy Pay User ID or registered UPI ID');
        return;
      }
      if (rvPayMpin.length !== 4) {
        setErrorMessage('Please enter your 4-digit security MPIN');
        return;
      }
    } else {
      if (!/^\d{6}$/.test(netBankingOtp)) {
        setErrorMessage('Please enter the 6-digit authorization OTP sent to your registered mobile');
        return;
      }
    }

    setStep('processing');
    setProcessingStep(1);

    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    try {
      // Initiate payment API call in background
      const paymentPromise = (async () => {
        if (method === 'railvoy_pay') {
          return await axios.post('/api/banking/railvoy-pay-debit', {
            identifier: rvPayId.trim(),
            mpin: rvPayMpin.trim(),
            amount: Number(amount),
            lockToken: bookingData?.lockToken || '',
            userEmail: targetEmail,
            description: `Train #${bookingData?.trainNo || ''} (${bookingData?.travelClass || '3A'}) Booking`
          });
        } else {
          return await axios.post('/api/banking/deduct', {
            email: targetEmail,
            amount: Number(amount),
            otp: netBankingOtp.trim(),
            lockToken: bookingData?.lockToken || '',
            description: `Train #${bookingData?.trainNo || ''} (${bookingData?.travelClass || '3A'}) Booking`
          });
        }
      })();

      // Realistic payment processing step progression (~2.8 - 3.2s)
      await delay(700);
      setProcessingStep(2);

      await delay(800);
      setProcessingStep(3);

      const res = await paymentPromise;

      await delay(700);
      setProcessingStep(4);

      await delay(500);
      setTxnResult(res.data);
      setStep('success');

      try {
        confetti({ particleCount: 75, spread: 65, origin: { y: 0.6 } });
      } catch (e) {}

      setTimeout(() => {
        onPaymentSuccess({
          transactionId: res.data.transactionId,
          gateway: method === 'railvoy_pay' ? 'RailVoy Pay (UPI & MPIN)' : (accountInfo?.bank_name || 'Railway Net Banking'),
          amount: Number(amount),
          bankDeduction: { deducted: Number(amount), txnId: res.data.transactionId }
        });
      }, 1500);

    } catch (err: any) {
      setStep('error');
      if (err.response?.status === 401) {
        setErrorMessage(err.response?.data?.error || 'Authorization failed: Incorrect 4-digit MPIN.');
      } else if (err.response?.status === 402) {
        setErrorMessage(err.response?.data?.error || 'Payment declined: Insufficient balance in linked account.');
      } else if (err.response?.status === 409) {
        setErrorMessage('Fare conflict: Price lock expired. Please refresh your booking quote.');
      } else {
        setErrorMessage(err.response?.data?.error || 'Transaction could not be completed by payment gateway.');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm">
      <div className="min-h-full flex items-center justify-center p-3 sm:p-6 text-center">
        <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-3xl shadow-2xl my-6 text-left overflow-hidden text-slate-900">

          {/* Header */}
          <div className="bg-gradient-to-r from-sky-700 via-sky-800 to-blue-900 p-5 sm:p-6 text-white border-b border-sky-800 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-amber-300">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">Secure Payment Checkout</h3>
                <p className="text-[11px] text-sky-200">Official 256-Bit Encrypted Railway Transaction Portal</p>
              </div>
            </div>

            {step !== 'processing' && (
              <button
                onClick={onClose}
                className="p-1.5 text-sky-200 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="p-5 sm:p-6 space-y-5">

            {/* ERROR VIEW */}
            {step === 'error' && (
              <div className="space-y-4 text-center py-4">
                <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto text-rose-600">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-base font-black text-rose-800">Transaction Declined</h4>
                  <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto">{errorMessage}</p>
                </div>
                <div className="flex space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStep('form'); setErrorMessage(''); }}
                    className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {/* SUCCESS VIEW */}
            {step === 'success' && (
              <div className="space-y-4 text-center py-4">
                <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-300 flex items-center justify-center mx-auto text-emerald-600">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-base font-black text-emerald-800">Payment Authorized &amp; Debited!</h4>
                  <p className="text-xs text-slate-600 mt-1">Generating official CRIS e-Ticket and PNR reservation slip...</p>
                  {txnResult?.transactionId && (
                    <p className="font-mono text-xs text-sky-700 mt-2 font-bold">
                      Ref: {txnResult.transactionId}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* PROCESSING VIEW */}
            {step === 'processing' && (
              <div className="space-y-5 text-center py-5 px-2">
                <div className="relative w-16 h-16 mx-auto">
                  <div className="w-16 h-16 rounded-full bg-sky-50 border-2 border-sky-200 flex items-center justify-center text-sky-600 animate-spin">
                    <RefreshCw className="w-8 h-8 text-sky-600" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5 text-sky-700" />
                  </div>
                </div>

                <div>
                  <h4 className="text-base sm:text-lg font-black text-slate-900">
                    Processing Railway Payment...
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Secure 256-bit railway transaction protocol • Total: <strong className="text-sky-800 font-mono">₹{amount}</strong>
                  </p>
                </div>

                {/* Animated Progress Bar */}
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                  <div
                    className="bg-gradient-to-r from-sky-500 via-sky-600 to-emerald-500 h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.min(100, processingStep * 25)}%` }}
                  />
                </div>

                {/* Loading Menu Steps */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 text-left text-xs max-w-sm mx-auto shadow-inner">
                  <div className={`flex items-center space-x-3 transition-colors ${processingStep >= 1 ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      processingStep > 1 ? 'bg-emerald-600 text-white' : processingStep === 1 ? 'bg-sky-600 text-white animate-pulse' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {processingStep > 1 ? '✓' : '1'}
                    </div>
                    <span>Connecting to RailVoy Banking Gateway</span>
                  </div>

                  <div className={`flex items-center space-x-3 transition-colors ${processingStep >= 2 ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      processingStep > 2 ? 'bg-emerald-600 text-white' : processingStep === 2 ? 'bg-sky-600 text-white animate-pulse' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {processingStep > 2 ? '✓' : '2'}
                    </div>
                    <span>Verifying 4-digit MPIN security hash &amp; credentials</span>
                  </div>

                  <div className={`flex items-center space-x-3 transition-colors ${processingStep >= 3 ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      processingStep > 3 ? 'bg-emerald-600 text-white' : processingStep === 3 ? 'bg-sky-600 text-white animate-pulse' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {processingStep > 3 ? '✓' : '3'}
                    </div>
                    <span>Checking dynamic fare guarantee &amp; inventory lock</span>
                  </div>

                  <div className={`flex items-center space-x-3 transition-colors ${processingStep >= 4 ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      processingStep >= 4 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {processingStep >= 4 ? '✓' : '4'}
                    </div>
                    <span>Executing atomic ledger debit &amp; generating receipt</span>
                  </div>
                </div>

                <p className="text-[11px] text-amber-700 bg-amber-50 py-2 px-3 rounded-xl border border-amber-200 inline-block font-medium">
                  🔒 Please do not refresh or close this window while authorization is in progress
                </p>
              </div>
            )}

            {/* MAIN FORM VIEW */}
            {step === 'form' && (
              <form onSubmit={handleSubmitPayment} className="space-y-5">

                {/* Amount to Pay Summary */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Total Amount to Pay</span>
                    <span className="text-2xl font-black text-sky-800 font-mono">₹{amount}</span>
                  </div>
                  <div className="text-right text-xs">
                    <span className="text-slate-500 block">Train #{bookingData?.trainNo} ({bookingData?.travelClass})</span>
                    <span className="text-emerald-700 font-bold">{bookingData?.passengers?.length || 1} Passenger(s)</span>
                  </div>
                </div>

                {/* Payment Method Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Select Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Method 1: RailVoy Pay */}
                    <button
                      type="button"
                      onClick={() => setMethod('railvoy_pay')}
                      className={`p-3 rounded-2xl border text-left transition-all flex items-center space-x-2.5 ${
                        method === 'railvoy_pay'
                          ? 'border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600 text-emerald-950 font-bold'
                          : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                      }`}
                    >
                      <Wallet className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                      <div>
                        <span className="text-xs block font-extrabold">RailVoy Pay</span>
                        <span className="text-[10px] text-slate-500 font-normal">Third-Party Wallet &amp; MPIN</span>
                      </div>
                    </button>

                    {/* Method 2: Net Banking */}
                    <button
                      type="button"
                      onClick={() => setMethod('net_banking')}
                      className={`p-3 rounded-2xl border text-left transition-all flex items-center space-x-2.5 ${
                        method === 'net_banking'
                          ? 'border-sky-600 bg-sky-50/70 ring-1 ring-sky-600 text-sky-950 font-bold'
                          : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                      }`}
                    >
                      <Smartphone className="w-5 h-5 text-sky-600 flex-shrink-0" />
                      <div>
                        <span className="text-xs block font-extrabold">Net Banking</span>
                        <span className="text-[10px] text-slate-500 font-normal">Direct Bank Debit</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* ── METHOD 1: RAILVOY PAY TAB ── */}
                {method === 'railvoy_pay' && (
                  <div className="space-y-4 p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 text-xs">
                    <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                      <span className="font-extrabold text-emerald-900 flex items-center space-x-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>RailVoy Pay 4-Digit MPIN Checkout</span>
                      </span>
                      <a
                        href="http://localhost:5174"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-emerald-700 hover:underline flex items-center space-x-1 font-bold"
                      >
                        <span>Open Wallet App</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <div>
                      <label className="block text-slate-700 uppercase font-bold mb-1">
                        RailVoy Pay User ID or Registered UPI ID
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. RVPAY-DEMO1001 or 9876543210@railvoy"
                        value={rvPayId}
                        onChange={e => setRvPayId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-emerald-300 rounded-xl font-mono text-slate-900 outline-none focus:border-emerald-600 font-bold"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Default Demo Test ID: <code className="font-bold text-emerald-800">RVPAY-DEMO1001</code>
                      </p>
                    </div>

                    <div>
                      <label className="block text-slate-700 uppercase font-bold mb-1">
                        4-Digit Secret MPIN
                      </label>
                      <input
                        type="password"
                        required
                        maxLength={4}
                        placeholder="••••"
                        value={rvPayMpin}
                        onChange={e => setRvPayMpin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        className="w-full px-4 py-3 bg-white border border-emerald-300 rounded-xl text-center font-mono text-2xl font-black tracking-[0.4em] text-slate-900 outline-none focus:border-emerald-600"
                      />
                      <p className="text-[11px] text-slate-500 mt-1 text-center">
                        Demo MPIN: <code className="font-bold text-emerald-800">1234</code> &bull; Verified with hash, never displayed on screen.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── METHOD 2: NET BANKING TAB ── */}
                {method === 'net_banking' && (
                  <div className="space-y-4 p-4 rounded-2xl bg-sky-50/60 border border-sky-200 text-xs">
                    <div className="flex items-center space-x-2 text-sky-900 font-bold border-b border-sky-200 pb-2">
                      <ShieldCheck className="w-4 h-4 text-sky-700" />
                      <span>Direct Net Banking Transfer</span>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-sky-200 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-800 block">{accountInfo?.bank_name || 'State Bank of India'}</span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          Account: {accountInfo?.account_no ? '•••• •••• •••• ' + accountInfo.account_no.slice(-4) : '•••• 7654'}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">Verified</span>
                    </div>

                    {!otpSent ? (
                      <div className="text-center py-2 space-y-2">
                        <p className="text-slate-600 text-xs">
                          Click below to send an authorization OTP to your registered phone.
                        </p>
                        <button
                          type="button"
                          onClick={handleRequestBankOtp}
                          disabled={requestingOtp}
                          className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-xs transition-all disabled:opacity-50"
                        >
                          {requestingOtp ? 'Sending SMS OTP...' : 'Send Bank OTP'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="block text-slate-700 uppercase font-bold">Enter 6-Digit SMS OTP</label>
                        <input
                          type="password"
                          required
                          maxLength={6}
                          placeholder="••••••"
                          value={netBankingOtp}
                          onChange={e => setNetBankingOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="w-full px-4 py-3 bg-white border border-sky-300 rounded-xl text-center font-mono text-xl font-black tracking-[0.3em] text-slate-900 outline-none focus:border-sky-600"
                        />
                        <p className="text-[11px] text-slate-400 text-center">Test OTP: 123456</p>
                      </div>
                    )}
                  </div>
                )}

                {errorMessage && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-bold text-center">
                    {errorMessage}
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={
                    method === 'railvoy_pay'
                      ? rvPayMpin.length !== 4 || !rvPayId.trim()
                      : netBankingOtp.length !== 6
                  }
                  className="w-full py-3.5 px-6 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-sm shadow-md flex items-center justify-center space-x-2 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>Authorize &amp; Pay ₹{amount}</span>
                </button>

                <div className="flex items-center justify-center space-x-2 text-[10px] text-slate-400 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Zero-Storage Guarantee &bull; PIN &amp; Banking Details Never Stored or Leaked</span>
                </div>

              </form>
            )}

          </div>

        </div>
      </div>
    </div>
  );
};
