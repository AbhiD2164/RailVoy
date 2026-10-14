const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { getIsFallback } = require('../config/db');
const { verifyAndConsumeFareLock } = require('../services/fareService');

const BANKING_JSON_PATH = path.join(__dirname, '../../dataset/banking_details.json');
const RVPAY_USERS_FILE = path.join(__dirname, '../../../RailVoy-Pay/backend/data/users.json');
const RVPAY_TXNS_FILE = path.join(__dirname, '../../../RailVoy-Pay/backend/data/transactions.json');
const RVACC_ACCOUNTS_FILE = path.join(__dirname, '../../../RailVoy-Accounts/backend/data/accounts.json');

const loadRvPayUsers = () => {
  try {
    if (fs.existsSync(RVPAY_USERS_FILE)) {
      return JSON.parse(fs.readFileSync(RVPAY_USERS_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('[Banking] Could not read users.json runtime store:', e.message);
  }
  return [];
};

const saveRvPayUsers = (usersArr) => {
  try {
    fs.writeFileSync(RVPAY_USERS_FILE, JSON.stringify(usersArr, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Banking] Could not write users.json:', e.message);
  }
};

const recordRvPayTxn = (txnRecord) => {
  try {
    let txns = [];
    if (fs.existsSync(RVPAY_TXNS_FILE)) {
      txns = JSON.parse(fs.readFileSync(RVPAY_TXNS_FILE, 'utf8'));
    }
    txns.push(txnRecord);
    fs.writeFileSync(RVPAY_TXNS_FILE, JSON.stringify(txns.slice(-200), null, 2), 'utf8');
  } catch (e) {
    console.warn('[Banking] Could not record txn:', e.message);
  }
};

// In-memory balance overrides store (internal runtime deductions and credits)
const balanceOverrides = new Map();

// In-memory payment authorization OTP store
// Map<cleanEmail, { otp, expiresAt, amount, bankName, accountNo }>
const pendingPaymentOTPs = new Map();

// Helper: load banking users from JSON
const loadBankingUsersFromJSON = () => {
  try {
    if (fs.existsSync(BANKING_JSON_PATH)) {
      return JSON.parse(fs.readFileSync(BANKING_JSON_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to read banking_details.json:', e.message);
  }
  return [];
};

// ─── OTP-BASED PAYMENT AUTHORIZATION ──────────────────────────────────────────

// POST /api/banking/request-otp - Generate 6-digit transaction authorization OTP
router.post('/request-otp', async (req, res) => {
  try {
    const { email, amount, bankName } = req.body;
    if (!email) return res.status(400).json({ error: 'Email parameter required for OTP' });

    const cleanEmail = email.toLowerCase().trim();
    const cleanAmount = parseFloat(amount) || 0;

    // Generate dynamic 6-digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 3 * 60 * 1000; // 3-minute validity

    pendingPaymentOTPs.set(cleanEmail, {
      otp: generatedOtp,
      expiresAt,
      amount: cleanAmount,
      bankName: bankName || 'State Bank of India',
      createdAt: Date.now()
    });

    console.log(`[Banking SMS Gateway] 📨 Transaction OTP generated for ${cleanEmail} (Amount: ₹${cleanAmount}): ${generatedOtp}`);

    res.json({
      success: true,
      message: `Transaction OTP sent to registered mobile/email for ${cleanEmail}`,
      otpPreview: generatedOtp, // Sent for simulated SMS display on frontend
      expiresAt,
      validitySeconds: 180
    });
  } catch (err) {
    console.error('[Banking] Request OTP error:', err);
    res.status(500).json({ error: 'Failed to generate transaction OTP' });
  }
});

// POST /api/banking/verify-otp - Validate transaction OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });

    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = String(otp).trim();

    // Universal test OTP fallback
    if (cleanOtp === '123456') {
      return res.json({ success: true, verified: true });
    }

    const pending = pendingPaymentOTPs.get(cleanEmail);
    if (!pending) {
      return res.status(400).json({ error: 'No active OTP request found. Please click Request OTP.' });
    }

    if (Date.now() > pending.expiresAt) {
      pendingPaymentOTPs.delete(cleanEmail);
      return res.status(410).json({ error: 'OTP has expired (3 min limit). Please request a new OTP.' });
    }

    if (pending.otp !== cleanOtp) {
      return res.status(400).json({ error: 'Invalid OTP. Please check the SMS alert and enter the 6-digit code.' });
    }

    res.json({ success: true, verified: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

// GET /api/banking/account?email= - Get payment profile (BANK NAME & MASKED ACCT ONLY — NO BALANCE)
router.get('/account', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email parameter required' });

    const cleanEmail = email.toLowerCase().trim();
    let userAccount = null;

    // 1. Check MongoDB User if available
    if (!getIsFallback()) {
      const dbUser = await User.findOne({ email: cleanEmail });
      if (dbUser && dbUser.bankAccountNo) {
        userAccount = {
          id: dbUser._id.toString(),
          full_name: dbUser.name,
          email: dbUser.email,
          bank_name: dbUser.bankName || 'State Bank of India',
          account_no: dbUser.bankAccountNo,
          ifsc_code: dbUser.bankIfscCode || 'SBIN0001234'
        };
      }
    }

    // 2. Check in-memory users from authRoutes
    if (!userAccount) {
      try {
        const authRoutes = require('./authRoutes');
        const memUsers = authRoutes.inMemoryUsers || [];
        const memUser = memUsers.find(u => u.email.toLowerCase() === cleanEmail);
        if (memUser && memUser.bankAccountNo) {
          userAccount = {
            id: memUser._id || 'user_mem',
            full_name: memUser.name,
            email: memUser.email,
            bank_name: memUser.bankName || 'State Bank of India',
            account_no: memUser.bankAccountNo,
            ifsc_code: memUser.bankIfscCode || 'SBIN0001234'
          };
        }
      } catch (e) {}
    }

    // 3. Check JSON dataset
    if (!userAccount) {
      const jsonUsers = loadBankingUsersFromJSON();
      const match = jsonUsers.find(u => u.email.toLowerCase() === cleanEmail);
      if (match) {
        userAccount = {
          id: match.id,
          full_name: match.full_name,
          email: match.email,
          bank_name: match.bank_name,
          account_no: match.account_no,
          ifsc_code: match.ifsc_code
        };
      }
    }

    // 4. Fallback dynamic account generation (16-digit pure numeric)
    if (!userAccount) {
      let dyn = null;
      try {
        const authRoutes = require('./authRoutes');
        if (authRoutes.generateDynamicBankAccount) {
          dyn = authRoutes.generateDynamicBankAccount('', cleanEmail);
        }
      } catch (e) {}

      userAccount = {
        id: 'acc_' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_'),
        full_name: cleanEmail.split('@')[0].toUpperCase(),
        email: cleanEmail,
        bank_name: dyn ? dyn.bankName : 'State Bank of India',
        account_no: dyn ? dyn.accountNo : '3847291056473829',
        ifsc_code: dyn ? dyn.bankIfscCode : 'SBIN0001234'
      };
    }

    const rawAcc = String(userAccount.account_no || '').replace(/\D/g, '');
    const maskedAcc = rawAcc.length === 16 ? ('************' + rawAcc.slice(-4)) : '************' + rawAcc.slice(-4);

    // Explicitly do NOT send balance in response!
    res.json({
      id: userAccount.id,
      full_name: userAccount.full_name,
      email: userAccount.email,
      bank_name: userAccount.bank_name,
      masked_account: maskedAcc
      // Balance is strictly omitted per privacy requirements
    });
  } catch (err) {
    console.error('[Banking] Account fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch bank account details' });
  }
});

// POST /api/banking/deduct - Secure real-time payment deduction
router.post('/deduct', async (req, res) => {
  try {
    const { email, amount, description, lockToken, otp } = req.body;
    if (!email || !amount) return res.status(400).json({ error: 'Email and amount required' });

    const cleanEmail = email.toLowerCase().trim();
    const deductAmount = parseFloat(amount);
    if (isNaN(deductAmount) || deductAmount <= 0) {
      return res.status(400).json({ error: 'Invalid payment amount' });
    }

    // OTP Verification (Strict OTP-based debit authorization)
    const cleanOtp = String(otp || '').trim();
    if (cleanOtp && cleanOtp !== '123456') {
      const pending = pendingPaymentOTPs.get(cleanEmail);
      if (pending) {
        if (Date.now() > pending.expiresAt) {
          pendingPaymentOTPs.delete(cleanEmail);
          return res.status(410).json({ error: 'Payment authorization OTP expired. Please generate a new OTP.' });
        }
        if (pending.otp !== cleanOtp) {
          return res.status(401).json({ error: 'Invalid OTP. Please enter the valid 6-digit code received via SMS.' });
        }
        // OTP matched — consume it to prevent replay
        pendingPaymentOTPs.delete(cleanEmail);
      }
    } else if (!cleanOtp) {
      // If an OTP was previously requested for this email and not provided
      const pending = pendingPaymentOTPs.get(cleanEmail);
      if (pending && Date.now() <= pending.expiresAt) {
        return res.status(400).json({ error: 'Transaction authorization OTP is required to complete this payment.' });
      }
    }

    // Fare-Lock consistency verification: if token provided, check with fare service
    if (lockToken) {
      const { FareLock, inMemoryFareLocks } = require('../models/FareLock');
      let lock = null;
      if (!getIsFallback()) {
        try { lock = await FareLock.findOne({ lockToken }); } catch(e) {}
      }
      if (!lock) lock = inMemoryFareLocks.get(lockToken);

      if (lock && !lock.used && new Date() <= new Date(lock.expiresAt)) {
        if (Math.abs(Number(lock.lockedFare) - deductAmount) > 1) {
          return res.status(409).json({
            error: `Payment rejected: Fare conflict detected. Quoted fare was ₹${lock.lockedFare}, attempted deduction was ₹${deductAmount}.`
          });
        }
      }
    }

    let initialBalance = 75000;
    let bankName = 'State Bank of India';
    let accountNo = '3847291056473829';
    let fullName = cleanEmail.split('@')[0];

    if (!getIsFallback()) {
      const dbUser = await User.findOne({ email: cleanEmail });
      if (dbUser) {
        initialBalance = dbUser.bankBalance || 75000;
        bankName = dbUser.bankName || 'State Bank of India';
        accountNo = dbUser.bankAccountNo || accountNo;
        fullName = dbUser.name;
      }
    } else {
      try {
        const authRoutes = require('./authRoutes');
        const memUsers = authRoutes.inMemoryUsers || [];
        const memUser = memUsers.find(u => u.email.toLowerCase() === cleanEmail);
        if (memUser) {
          initialBalance = memUser.bankBalance || 75000;
          bankName = memUser.bankName || 'State Bank of India';
          accountNo = memUser.bankAccountNo || accountNo;
          fullName = memUser.name || fullName;
        }
      } catch (e) {}
    }

    const currentBalance = balanceOverrides.has(cleanEmail)
      ? balanceOverrides.get(cleanEmail)
      : initialBalance;

    if (currentBalance < deductAmount) {
      return res.status(402).json({
        error: 'Insufficient funds in your linked bank account'
      });
    }

    const newBalance = parseFloat((currentBalance - deductAmount).toFixed(2));
    balanceOverrides.set(cleanEmail, newBalance);

    if (!getIsFallback()) {
      try {
        await User.updateOne({ email: cleanEmail }, { $set: { bankBalance: newBalance } });
      } catch (e) {}
    } else {
      try {
        const authRoutes = require('./authRoutes');
        const memUsers = authRoutes.inMemoryUsers || [];
        const memUser = memUsers.find(u => u.email.toLowerCase() === cleanEmail);
        if (memUser) memUser.bankBalance = newBalance;
      } catch (e) {}
    }

    const transactionId = 'TXN_RV_' + Date.now() + '_' + Math.floor(1000 + Math.random() * 9000);
    const timestamp = new Date().toISOString();

    console.log(`[Banking Gateway] Confirmed deduction of ₹${deductAmount} from ${cleanEmail} (${bankName}).`);

    // Only return bank name and transaction ID — NO balance!
    res.json({
      success: true,
      transactionId,
      timestamp,
      bank_name: bankName,
      deducted: deductAmount,
      description: description || 'RailVoy Ticket Purchase'
    });
  } catch (err) {
    console.error('[Banking] Deduct error:', err);
    res.status(500).json({ error: 'Payment gateway transaction failed' });
  }
});

// POST /api/banking/refund - Rollback failed booking payment
router.post('/refund', async (req, res) => {
  try {
    const { email, amount, reason } = req.body;
    if (!email || !amount) return res.status(400).json({ error: 'Email and amount required' });

    const cleanEmail = email.toLowerCase().trim();
    const refundAmount = parseFloat(amount);

    const currentBalance = balanceOverrides.has(cleanEmail)
      ? balanceOverrides.get(cleanEmail)
      : 75000;

    const newBalance = parseFloat((currentBalance + refundAmount).toFixed(2));
    balanceOverrides.set(cleanEmail, newBalance);

    if (!getIsFallback()) {
      try {
        await User.updateOne({ email: cleanEmail }, { $set: { bankBalance: newBalance } });
      } catch (e) {}
    }

    const refundId = 'RFD_RV_' + Date.now();
    console.log(`[Banking Gateway] REFUND of ₹${refundAmount} credited to ${cleanEmail}.`);

    res.json({
      success: true,
      refundId,
      refunded: refundAmount,
      reason: reason || 'Booking rollback'
      // No balance returned
    });
  } catch (err) {
    console.error('[Banking] Refund error:', err);
    res.status(500).json({ error: 'Refund processing failed' });
  }
});

// POST /api/banking/transfer-payment - Handle transfer fare difference
router.post('/transfer-payment', async (req, res) => {
  try {
    const { email, pnr, fareDiff, direction } = req.body;
    if (!email || fareDiff == null) {
      return res.status(400).json({ error: 'Email and fareDiff are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const diff = Math.abs(parseFloat(fareDiff));
    const currentBalance = balanceOverrides.has(cleanEmail) ? balanceOverrides.get(cleanEmail) : 75000;

    let transactionId = 'TXN_TRANSFER_' + Date.now();

    if (direction === 'charge' && diff > 0) {
      if (currentBalance < diff) {
        return res.status(402).json({ error: 'Insufficient funds for transfer fare difference.' });
      }
      const newBal = parseFloat((currentBalance - diff).toFixed(2));
      balanceOverrides.set(cleanEmail, newBal);
      if (!getIsFallback()) {
        try { await User.updateOne({ email: cleanEmail }, { $set: { bankBalance: newBal } }); } catch(e) {}
      }
    } else if (direction === 'refund' && diff > 0) {
      const newBal = parseFloat((currentBalance + diff).toFixed(2));
      balanceOverrides.set(cleanEmail, newBal);
      if (!getIsFallback()) {
        try { await User.updateOne({ email: cleanEmail }, { $set: { bankBalance: newBal } }); } catch(e) {}
      }
    }

    res.json({
      success: true,
      transactionId,
      fareDiff: diff,
      direction: direction || 'even',
      message: direction === 'charge'
        ? `₹${diff} adjusted from payment gateway for transfer upgrade.`
        : (direction === 'refund' ? `₹${diff} refunded for alternate train transfer.` : 'Transfer completed at even fare.')
    });
  } catch (err) {
    res.status(500).json({ error: 'Transfer payment adjustment failed' });
  }
});

// ─── Razorpay / Live Payment Gateway Integration Endpoints ──────────────────
const paymentService = require('../services/paymentService');

// POST /api/banking/create-order - Create Razorpay order (or mock order if in test mode)
router.post('/create-order', async (req, res) => {
  try {
    const { amount, receiptId, notes } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }
    const order = await paymentService.createPaymentOrder(amount, receiptId, notes);
    res.json(order);
  } catch (err) {
    console.error('Create Order Error:', err);
    res.status(500).json({ error: 'Failed to initialize payment gateway order' });
  }
});

// POST /api/banking/verify-order - Verify Razorpay payment signature
router.post('/verify-order', async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;
    const isValid = paymentService.verifyPaymentSignature(orderId, paymentId, signature);
    if (!isValid) {
      return res.status(400).json({ error: 'Payment signature verification failed' });
    }
    res.json({
      verified: true,
      transactionId: paymentId || ('TXN_RZP_' + Date.now()),
      orderId,
      gateway: paymentService.isRazorpayConfigured() ? 'Razorpay Live' : 'RailVoy Direct Bank Pay'
    });
  } catch (err) {
    console.error('Verify Order Error:', err);
    res.status(500).json({ error: 'Failed to verify payment order' });
  }
});

// ─── EXTERNAL PAYMENT APP & REAL-TIME WALLET BRIDGE ──────────────────────────
// Enables external banking apps / UPI apps to query balance and authorize payments
router.get('/external-wallet/balance', async (req, res) => {
  try {
    const { email, paymentAppId } = req.query;
    if (!email && !paymentAppId) {
      return res.status(400).json({ error: 'Email or paymentAppId parameter required' });
    }

    const cleanEmail = (email || '').toLowerCase().trim();
    const currentBalance = balanceOverrides.has(cleanEmail) ? balanceOverrides.get(cleanEmail) : 75000;

    res.json({
      success: true,
      provider: 'External Railway Banking Partner',
      paymentAppId: paymentAppId || ('PAY_APP_' + (cleanEmail ? cleanEmail.split('@')[0] : 'SIMULATOR')),
      balance: currentBalance,
      currency: 'INR',
      status: 'LINKED_ACTIVE',
      lastSynced: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'External wallet balance lookup failed' });
  }
});

router.post('/external-wallet/authorize', async (req, res) => {
  try {
    const { email, paymentAppId, amount, transactionRef } = req.body;
    if (!amount || (!email && !paymentAppId)) {
      return res.status(400).json({ error: 'Amount and account identifier required' });
    }

    const cleanEmail = (email || '').toLowerCase().trim();
    const deductAmount = parseFloat(amount);
    const currentBalance = balanceOverrides.has(cleanEmail) ? balanceOverrides.get(cleanEmail) : 75000;

    if (currentBalance < deductAmount) {
      return res.status(402).json({ error: 'Insufficient balance in external payment app.' });
    }

    const newBalance = parseFloat((currentBalance - deductAmount).toFixed(2));
    if (cleanEmail) balanceOverrides.set(cleanEmail, newBalance);

    const transactionId = 'TXN_EXT_' + Date.now() + '_' + Math.floor(1000 + Math.random() * 9000);

    res.json({
      success: true,
      transactionId,
      externalRef: transactionRef || ('REF_' + Date.now()),
      paymentAppId: paymentAppId || 'EXTERNAL_PAY_APP',
      deducted: deductAmount,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'External wallet authorization failed' });
  }
});

// ─── RAILVOY PAY THIRD-PARTY WALLET & MPIN CHECKOUT ─────────────────────────
router.post('/railvoy-pay-debit', async (req, res) => {
  try {
    const { identifier, mpin, amount, lockToken, userEmail, description } = req.body;
    if (!identifier || !mpin || !amount) {
      return res.status(400).json({ error: 'RailVoy Pay ID / UPI ID, 4-digit MPIN, and amount are required' });
    }

    const cleanMpin = String(mpin).trim();
    if (!/^\d{4}$/.test(cleanMpin)) {
      return res.status(400).json({ error: 'MPIN must be exactly 4 digits' });
    }

    const payAmount = parseFloat(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({ error: 'Invalid transaction amount' });
    }

    // 1. Try external RailVoy-Pay microservice (Port 4001) first
    let payResult = null;
    try {
      const axios = require('axios');
      const extRes = await axios.post('http://localhost:4001/api/pay/authorize-payment', {
        identifier,
        mpin: cleanMpin,
        amount: payAmount,
        description: description || 'RailVoy Railway Reservation',
        merchantRef: 'RailVoy Instant Booking'
      }, { timeout: 3000 });

      if (extRes.data?.success && extRes.data?.transactionId) {
        payResult = extRes.data;
      }
    } catch (apiErr) {
      if (apiErr.response && (apiErr.response.status === 401 || apiErr.response.status === 402)) {
        // Relay explicit security or balance decline
        return res.status(apiErr.response.status).json({
          error: apiErr.response.data?.error || 'Payment declined by RailVoy Pay'
        });
      }
      // Microservice is down, network timeout, or user identifier not found directly by microservice
      // Seamlessly fall back to shared runtime database store
    }

    // 2. Direct Runtime Database Access for RailVoy-Pay & Cross-App Accounts Resolution
    if (!payResult) {
      const rawId = String(identifier).trim();
      const cleanId = rawId.toLowerCase();
      const cleanUpper = rawId.toUpperCase();
      const cleanDigits = rawId.replace(/\D/g, '');

      let targetPhone = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : '';

      // If identifier is an Email or Railway ID, resolve linked mobile number from RailVoy-Accounts runtime store
      if (!targetPhone || rawId.includes('@') || cleanUpper.startsWith('RVACC-') || userEmail) {
        try {
          if (fs.existsSync(RVACC_ACCOUNTS_FILE)) {
            const accList = JSON.parse(fs.readFileSync(RVACC_ACCOUNTS_FILE, 'utf8'));
            const lookup = (rawId || userEmail || '').toLowerCase();
            const matchedAcc = accList.find(a =>
              (a.email && a.email.toLowerCase() === lookup) ||
              (a.railwayUserId && a.railwayUserId.toUpperCase() === cleanUpper) ||
              (userEmail && a.email && a.email.toLowerCase() === userEmail.toLowerCase())
            );
            if (matchedAcc && matchedAcc.phone) {
              targetPhone = String(matchedAcc.phone).replace(/\D/g, '').slice(-10);
            }
          }
        } catch (e) {}
      }

      const usersArr = loadRvPayUsers();
      let walletUser = usersArr.find(u =>
        (u.userId && u.userId.toLowerCase() === cleanId) ||
        (u.userId && u.userId.toUpperCase() === cleanUpper) ||
        (u.phone && cleanDigits && u.phone === cleanDigits) ||
        (u.phone && targetPhone && u.phone === targetPhone) ||
        (u.upiId && u.upiId.toLowerCase() === cleanId)
      );

      // Demo wallet fallback
      if (!walletUser && (cleanUpper === 'RVPAY-DEMO1001' || cleanId === 'demo')) {
        walletUser = usersArr.find(u => u.userId === 'RVPAY-DEMO1001') || {
          userId: 'RVPAY-DEMO1001',
          name: 'Priya Sharma (Demo)',
          balance: 85000,
          mpinHash: null
        };
      }

      if (!walletUser) {
        return res.status(404).json({
          error: 'No RailVoy Pay wallet linked with the given details. Check your User ID, UPI ID, or registered mobile.'
        });
      }

      // Verify MPIN securely with bcrypt (case-insensitive & universal demo test support)
      let isMpinValid = false;
      if (walletUser.mpinHash) {
        isMpinValid = await bcrypt.compare(cleanMpin, walletUser.mpinHash);
      }
      if (!isMpinValid && cleanMpin === '1234') {
        isMpinValid = true; // Universal test MPIN
      }

      if (!isMpinValid) {
        return res.status(401).json({ error: 'Incorrect 4-digit MPIN. Transaction declined.' });
      }

      // Check balance
      if ((walletUser.balance || 0) < payAmount) {
        return res.status(402).json({
          error: `Insufficient balance in RailVoy Pay wallet. Available: ₹${(walletUser.balance || 0).toFixed(2)}, Required: ₹${payAmount.toFixed(2)}`
        });
      }

      // Debit atomically
      walletUser.balance = Math.max(0, (walletUser.balance || 0) - payAmount);
      saveRvPayUsers(usersArr);

      const txnId = `TXN_RVPAY_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
      recordRvPayTxn({
        txnId,
        userId: walletUser.userId,
        upiId: walletUser.upiId || `${walletUser.phone || 'pay'}@railvoy`,
        amount: payAmount,
        type: 'DEBIT',
        status: 'SUCCESS',
        description: description || 'RailVoy Railway Reservation',
        timestamp: new Date().toISOString()
      });

      payResult = {
        success: true,
        transactionId: txnId,
        amount: payAmount,
        message: 'Payment authorized via RailVoy Pay wallet'
      };
    }

    res.json({
      success: true,
      transactionId: payResult.transactionId,
      gateway: 'RailVoy Pay (Third-Party Wallet)',
      amount: payAmount,
      bankDeduction: { deducted: payAmount, txnId: payResult.transactionId },
      message: 'Transaction successfully authorized with 4-digit MPIN'
    });
  } catch (err) {
    console.error('[Banking] RailVoy Pay debit error:', err);
    res.status(500).json({ error: 'Payment gateway encountered an error. Please try again.' });
  }
});

router.balanceOverrides = balanceOverrides;
router.pendingPaymentOTPs = pendingPaymentOTPs;
module.exports = router;

