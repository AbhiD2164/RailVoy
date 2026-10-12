const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TXNS_FILE = path.join(DATA_DIR, 'transactions.json');
const JWT_SECRET = process.env.JWT_SECRET || 'railvoy_pay_jwt_secret_2026_secure';
const RAILVOY_MAIN_API_KEY = process.env.RAILVOY_MAIN_API_KEY || 'rvpay_mainapp_key_2026';

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-Memory store with file backup
const usersMap = new Map();
const transactions = [];

const loadData = () => {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      data.forEach(u => usersMap.set(u.userId, u));
      console.log(`[RailVoy Pay] Loaded ${usersMap.size} users from storage`);
    }
    if (fs.existsSync(TXNS_FILE)) {
      const txns = JSON.parse(fs.readFileSync(TXNS_FILE, 'utf8'));
      transactions.push(...txns);
    }
  } catch (err) {
    console.error('[RailVoy Pay] Failed to load data:', err.message);
  }
};

const saveData = () => {
  try {
    const usersArr = Array.from(usersMap.values());
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersArr, null, 2), 'utf8');
    fs.writeFileSync(TXNS_FILE, JSON.stringify(transactions.slice(-200), null, 2), 'utf8');
  } catch (err) {
    console.error('[RailVoy Pay] Failed to save data:', err.message);
  }
};

loadData();

// Seed a default test wallet if empty
if (usersMap.size === 0) {
  const seedDemo = async () => {
    const salt = await bcrypt.genSalt(10);
    const mpinHash = await bcrypt.hash('1234', salt);
    const defaultUser = {
      userId: 'RVPAY-DEMO1001',
      name: 'Priya Sharma',
      phone: '9876543210',
      upiId: 'priya@railvoy',
      mpinHash,
      balance: 85000,
      bankName: 'State Bank of India',
      accountLast4: '4321',
      isActive: true,
      createdAt: new Date().toISOString()
    };
    usersMap.set(defaultUser.userId, defaultUser);
    saveData();
    console.log('[RailVoy Pay] Seeded demo user: RVPAY-DEMO1001 (MPIN: 1234)');
  };
  seedDemo();
}

// Auth Middleware for RailVoy Pay user
const authenticatePayUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = usersMap.get(decoded.userId);
    if (!user) return res.status(401).json({ error: 'User not found or inactive' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }
};

// 1. Register new RailVoy Pay Account
router.post('/register', async (req, res) => {
  try {
    const { name, phone, mpin, upiId, bankName } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Full name is required (min 2 characters)' });
    }
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Valid 10-digit Indian mobile number required' });
    }
    const cleanMpin = String(mpin || '').trim();
    if (!/^\d{4}$/.test(cleanMpin)) {
      return res.status(400).json({ error: '4-digit numeric MPIN required for transaction security' });
    }

    // Check duplicate phone
    for (const u of usersMap.values()) {
      if (u.phone === cleanPhone) {
        return res.status(409).json({ error: 'An account is already linked with this mobile number' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const mpinHash = await bcrypt.hash(cleanMpin, salt);

    const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
    const userId = `RVPAY-${randomSuffix}`;
    const generatedUpi = (upiId && upiId.trim()) ? upiId.trim().toLowerCase() : `${cleanPhone}@railvoy`;
    const initialBalance = Math.floor(50000 + Math.random() * 50000);

    const newUser = {
      userId,
      name: name.trim(),
      phone: cleanPhone,
      upiId: generatedUpi,
      mpinHash,
      balance: initialBalance,
      bankName: bankName || 'State Bank of India',
      accountLast4: cleanPhone.slice(-4),
      isActive: true,
      createdAt: new Date().toISOString()
    };

    usersMap.set(userId, newUser);
    saveData();

    const token = jwt.sign({ userId, phone: cleanPhone }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      message: 'RailVoy Pay wallet created successfully',
      token,
      user: {
        userId,
        name: newUser.name,
        phone: '******' + cleanPhone.slice(-4),
        upiId: generatedUpi,
        bankName: newUser.bankName,
        balance: newUser.balance
      }
    });
  } catch (err) {
    console.error('[RailVoy Pay] Registration error:', err);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// 2. Login to RailVoy Pay
router.post('/login', async (req, res) => {
  try {
    const { identifier, mpin } = req.body;
    if (!identifier || !mpin) {
      return res.status(400).json({ error: 'Mobile / User ID / UPI ID and 4-digit MPIN are required' });
    }

    const cleanId = String(identifier).trim().toLowerCase();
    const cleanMpin = String(mpin).trim();

    let matchedUser = null;
    for (const u of usersMap.values()) {
      if (
        u.userId.toLowerCase() === cleanId ||
        u.phone === cleanId ||
        u.upiId.toLowerCase() === cleanId
      ) {
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) {
      return res.status(404).json({ error: 'No RailVoy Pay account found with given details' });
    }

    const isMatch = await bcrypt.compare(cleanMpin, matchedUser.mpinHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect 4-digit MPIN. Access denied.' });
    }

    const token = jwt.sign({ userId: matchedUser.userId, phone: matchedUser.phone }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        userId: matchedUser.userId,
        name: matchedUser.name,
        phone: '******' + matchedUser.phone.slice(-4),
        upiId: matchedUser.upiId,
        bankName: matchedUser.bankName,
        balance: matchedUser.balance
      }
    });
  } catch (err) {
    console.error('[RailVoy Pay] Login error:', err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// 3. Verify user by User ID or UPI ID (Used by RailVoy checkout)
router.get('/verify-user', (req, res) => {
  const { identifier } = req.query;
  if (!identifier) return res.status(400).json({ error: 'Identifier parameter required' });

  const clean = String(identifier).trim().toLowerCase();
  let found = null;
  for (const u of usersMap.values()) {
    if (
      u.userId.toLowerCase() === clean ||
      u.phone === clean ||
      u.upiId.toLowerCase() === clean
    ) {
      found = u;
      break;
    }
  }

  if (!found) {
    return res.status(404).json({ valid: false, error: 'User ID or UPI ID not registered in RailVoy Pay' });
  }

  res.json({
    valid: true,
    userId: found.userId,
    upiId: found.upiId,
    name: found.name,
    bankName: found.bankName,
    maskedPhone: '******' + found.phone.slice(-4)
  });
});

// 4. Secure Transaction Authorization & Debit (Called when passenger enters 4-digit MPIN)
router.post('/authorize-payment', async (req, res) => {
  try {
    const { identifier, mpin, amount, description, merchantRef } = req.body;
    if (!identifier || !mpin || !amount) {
      return res.status(400).json({ error: 'Identifier, 4-digit MPIN, and amount are mandatory' });
    }

    const payAmount = parseFloat(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({ error: 'Invalid transaction amount' });
    }

    const cleanId = String(identifier).trim().toLowerCase();
    const cleanMpin = String(mpin).trim();

    let user = null;
    for (const u of usersMap.values()) {
      if (
        u.userId.toLowerCase() === cleanId ||
        u.phone === cleanId ||
        u.upiId.toLowerCase() === cleanId
      ) {
        user = u;
        break;
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'RailVoy Pay wallet account not found' });
    }

    // Verify MPIN using bcrypt (securely stored, never displayed)
    const isMpinValid = await bcrypt.compare(cleanMpin, user.mpinHash);
    if (!isMpinValid) {
      return res.status(401).json({ error: 'Incorrect 4-digit MPIN. Transaction declined.' });
    }

    // Check balance
    if (user.balance < payAmount) {
      return res.status(402).json({
        error: `Insufficient balance in linked wallet. Available: ₹${user.balance.toFixed(2)}, Required: ₹${payAmount.toFixed(2)}`
      });
    }

    // Debit atomically
    user.balance -= payAmount;

    const txnId = `TXN_RVPAY_${Date.now()}_${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const txnRecord = {
      txnId,
      userId: user.userId,
      upiId: user.upiId,
      amount: payAmount,
      type: 'DEBIT',
      merchantRef: merchantRef || 'RailVoy Reservation',
      description: description || 'Indian Railways Ticket Booking',
      timestamp: new Date().toISOString(),
      status: 'SUCCESS'
    };

    transactions.push(txnRecord);
    saveData();

    console.log(`[RailVoy Pay] ✅ Payment of ₹${payAmount} approved for ${user.userId} (Txn: ${txnId})`);

    res.json({
      success: true,
      status: 'SUCCESS',
      transactionId: txnId,
      amount: payAmount,
      upiId: user.upiId,
      senderName: user.name,
      message: 'Payment verified and debited securely via RailVoy Pay'
    });
  } catch (err) {
    console.error('[RailVoy Pay] Payment error:', err);
    res.status(500).json({ error: 'Payment gateway encountered an error' });
  }
});

// 5. Get Balance (User Dashboard)
router.get('/balance', authenticatePayUser, (req, res) => {
  res.json({
    userId: req.user.userId,
    upiId: req.user.upiId,
    name: req.user.name,
    balance: req.user.balance,
    bankName: req.user.bankName,
    accountLast4: req.user.accountLast4
  });
});

// 6. Get Transaction History (User Dashboard)
router.get('/transactions', authenticatePayUser, (req, res) => {
  const userTxns = transactions
    .filter(t => t.userId === req.user.userId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(userTxns);
});

// 7. Refund endpoint
router.post('/refund', (req, res) => {
  const { userId, amount, originalTxnId, reason } = req.body;
  if (!userId || !amount) {
    return res.status(400).json({ error: 'User ID and refund amount required' });
  }

  const user = usersMap.get(userId);
  if (!user) return res.status(404).json({ error: 'User wallet not found for refund' });

  const refundAmt = parseFloat(amount);
  user.balance += refundAmt;

  const refundTxnId = `REF_RVPAY_${Date.now()}`;
  transactions.push({
    txnId: refundTxnId,
    userId: user.userId,
    amount: refundAmt,
    type: 'CREDIT',
    merchantRef: originalTxnId || 'Auto Refund',
    description: reason || 'Ticket cancellation / uncommitted booking refund',
    timestamp: new Date().toISOString(),
    status: 'REFUNDED'
  });

  saveData();
  res.json({ success: true, refundTxnId, message: `₹${refundAmt} refunded to wallet.` });
});

module.exports = router;
