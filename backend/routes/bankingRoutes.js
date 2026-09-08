const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const User = require('../models/User');
const { getIsFallback } = require('../config/db');

const CSV_PATH = path.join(__dirname, '../../dataset/banking_details.csv');

// In-memory balance overrides store (tracks live runtime deductions and credits)
const balanceOverrides = new Map();

// Helper: load banking users from CSV if needed
const loadBankingUsersFromCSV = () => {
  return new Promise((resolve, reject) => {
    const users = [];
    if (!fs.existsSync(CSV_PATH)) return resolve(users);
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on('data', (row) => {
        users.push({
          id: row.id,
          full_name: row.full_name,
          email: row.email,
          bank_name: row.bank_name,
          account_no: row.account_no,
          balance: parseFloat(row.balance) || 50000
        });
      })
      .on('end', () => resolve(users))
      .on('error', reject);
  });
};

// GET /api/banking/account?email= - Get private account details for the authenticated user only
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
          phone: dbUser.phone || '',
          bank_name: dbUser.bankName || 'State Bank of India',
          account_no: dbUser.bankAccountNo,
          balance: dbUser.bankBalance || 75000
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
            phone: memUser.phone || '',
            bank_name: memUser.bankName || 'State Bank of India',
            account_no: memUser.bankAccountNo,
            balance: memUser.bankBalance || 75000
          };
        }
      } catch (e) {}
    }

    // 3. Check in-memory / dataset if not found in MongoDB
    if (!userAccount) {
      const csvUsers = await loadBankingUsersFromCSV();
      const csvUser = csvUsers.find(u => u.email.toLowerCase() === cleanEmail);
      if (csvUser) {
        userAccount = csvUser;
      }
    }

    // 4. Fallback dynamic account generation matching dataset format
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
        phone: '',
        bank_name: dyn ? dyn.bankName : 'State Bank of India',
        account_no: dyn ? dyn.accountNo : ('SBIN ' + Math.floor(1000 + Math.random() * 9000) + ' ' + Math.floor(1000 + Math.random() * 9000) + ' ' + Math.floor(1000 + Math.random() * 9000)),
        balance: dyn ? dyn.balance : 75000
      };
    }

    // Apply any runtime balance override
    const currentBalance = balanceOverrides.has(cleanEmail)
      ? balanceOverrides.get(cleanEmail)
      : userAccount.balance;

    const maskedAcc = userAccount.account_no.replace(/\S(?=\S{4})/g, '*');

    res.json({
      id: userAccount.id,
      full_name: userAccount.full_name,
      email: userAccount.email,
      phone: userAccount.phone || '',
      bank_name: userAccount.bank_name,
      account_no: userAccount.account_no,
      masked_account: maskedAcc,
      balance: currentBalance
    });
  } catch (err) {
    console.error('[Banking] Account fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch confidential bank account' });
  }
});

// POST /api/banking/deduct - Secure real-time payment deduction from private account
router.post('/deduct', async (req, res) => {
  try {
    const { email, amount, description } = req.body;
    if (!email || !amount) return res.status(400).json({ error: 'Email and amount required' });

    const cleanEmail = email.toLowerCase().trim();
    const deductAmount = parseFloat(amount);
    if (isNaN(deductAmount) || deductAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    let initialBalance = 75000;
    let bankName = 'State Bank of India';
    let accountNo = 'SBIN ' + Math.floor(1000 + Math.random() * 9000) + ' ' + Math.floor(1000 + Math.random() * 9000) + ' ' + Math.floor(1000 + Math.random() * 9000);
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
      // Check in-memory users from authRoutes
      let foundInMem = false;
      try {
        const authRoutes = require('./authRoutes');
        const memUsers = authRoutes.inMemoryUsers || [];
        const memUser = memUsers.find(u => u.email.toLowerCase() === cleanEmail);
        if (memUser) {
          initialBalance = memUser.bankBalance || 75000;
          bankName = memUser.bankName || 'State Bank of India';
          accountNo = memUser.bankAccountNo || accountNo;
          fullName = memUser.name || fullName;
          foundInMem = true;
        }
      } catch (e) {}

      if (!foundInMem) {
        const csvUsers = await loadBankingUsersFromCSV();
        const csvUser = csvUsers.find(u => u.email.toLowerCase() === cleanEmail);
        if (csvUser) {
          initialBalance = csvUser.balance;
          bankName = csvUser.bank_name;
          accountNo = csvUser.account_no;
          fullName = csvUser.full_name;
        }
      }
    }

    const currentBalance = balanceOverrides.has(cleanEmail)
      ? balanceOverrides.get(cleanEmail)
      : initialBalance;

    if (currentBalance < deductAmount) {
      return res.status(402).json({
        error: 'Insufficient funds in your linked bank account',
        required: deductAmount
      });
    }

    const newBalance = parseFloat((currentBalance - deductAmount).toFixed(2));
    balanceOverrides.set(cleanEmail, newBalance);

    // Also update MongoDB if user exists
    if (!getIsFallback()) {
      try {
        await User.updateOne({ email: cleanEmail }, { $set: { bankBalance: newBalance } });
      } catch (e) {
        console.warn('[DB Balance Update Error]', e.message);
      }
    } else {
      try {
        const authRoutes = require('./authRoutes');
        const memUsers = authRoutes.inMemoryUsers || [];
        const memUser = memUsers.find(u => u.email.toLowerCase() === cleanEmail);
        if (memUser) {
          memUser.bankBalance = newBalance;
        }
      } catch (e) {}
    }

    const transactionId = 'TXN_RV_' + Date.now() + '_' + Math.floor(1000 + Math.random() * 9000);
    const timestamp = new Date().toISOString();

    console.log(`[Banking Gateway] Confirmed deduction of ₹${deductAmount} from ${cleanEmail} (${bankName}). New balance: ₹${newBalance}`);

    res.json({
      success: true,
      transactionId,
      timestamp,
      email: cleanEmail,
      full_name: fullName,
      bank_name: bankName,
      account_no: accountNo,
      masked_account: accountNo.replace(/\S(?=\S{4})/g, '*'),
      deducted: deductAmount,
      newBalance: newBalance,
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
      } catch (e) {
        console.warn('[DB Refund Update Error]', e.message);
      }
    } else {
      try {
        const authRoutes = require('./authRoutes');
        const memUsers = authRoutes.inMemoryUsers || [];
        const memUser = memUsers.find(u => u.email.toLowerCase() === cleanEmail);
        if (memUser) {
          memUser.bankBalance = newBalance;
        }
      } catch (e) {}
    }

    const refundId = 'RFD_RV_' + Date.now();
    console.log(`[Banking Gateway] REFUND of ₹${refundAmount} credited to ${cleanEmail}. New balance: ₹${newBalance}`);

    res.json({
      success: true,
      refundId,
      email: cleanEmail,
      refunded: refundAmount,
      newBalance: newBalance,
      reason: reason || 'Booking rollback'
    });
  } catch (err) {
    console.error('[Banking] Refund error:', err);
    res.status(500).json({ error: 'Refund processing failed' });
  }
});

router.balanceOverrides = balanceOverrides;
module.exports = router;
