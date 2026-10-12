const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const JWT_SECRET = process.env.JWT_SECRET || 'railvoy_accounts_jwt_secret_2026_secure';

// In-memory store for Accounts-App password reset OTPs (expires in 10 minutes)
const pendingAccountResetOTPs = new Map();
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-Memory store with file backup
const accountsMap = new Map();

const loadData = () => {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
      data.forEach(a => {
        if (!a.alerts) a.alerts = [];
        accountsMap.set(a.railwayUserId, a);
      });
      console.log(`[RailVoy Accounts] Loaded ${accountsMap.size} railway identities`);
    }
  } catch (err) {
    console.error('[RailVoy Accounts] Failed to load data:', err.message);
  }
};

const saveData = () => {
  try {
    const list = Array.from(accountsMap.values());
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('[RailVoy Accounts] Failed to save accounts data:', err.message);
  }
};

loadData();

// Seed a demo railway identity if empty
if (accountsMap.size === 0) {
  const seedDemo = async () => {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Railway@123', salt);
    const demo = {
      railwayUserId: 'RVACC-IN994821',
      name: 'Rohan Deshmukh',
      email: 'rohan.railway@gmail.com',
      phone: '9820112233',
      passwordHash,
      gender: 'M',
      dob: '1994-06-15',
      address: 'B-402, Central Railway Staff Enclave, Mumbai',
      aadhaarLast4: '8842',
      linkedApps: ['RailVoy Portal', 'Central Rake Reservation', 'NTES Terminal'],
      alerts: [
        {
          id: 'ALT_INIT_01',
          type: 'WELCOME',
          title: 'Railway Identity Active',
          message: 'Welcome to Indian Railways Universal Passenger Registry. Your account is active for 7-day persistent SSO.',
          createdAt: new Date().toISOString()
        }
      ],
      createdAt: new Date().toISOString(),
      isActive: true
    };
    accountsMap.set(demo.railwayUserId, demo);
    saveData();
    console.log('[RailVoy Accounts] Seeded demo Railway Account: RVACC-IN994821 (Pass: Railway@123)');
  };
  seedDemo();
}

// Middleware: Authenticate Session Token (Valid for 7 days)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token required' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const acc = accountsMap.get(decoded.railwayUserId);
    if (!acc) return res.status(401).json({ error: 'Railway account not found' });
    req.user = acc;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session token expired after 7 days of inactivity. Please sign in again.' });
  }
};

// 1. Register new Unified Railway Passenger Account
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, dob, gender, address, aadhaarLast4 } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Full passenger name is required' });
    }
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Valid email address is required' });
    }
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Valid 10-digit mobile number required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    for (const a of accountsMap.values()) {
      if (a.email === cleanEmail) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }
      if (a.phone === cleanPhone) {
        return res.status(409).json({ error: 'An account with this mobile number already exists' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
    const railwayUserId = `RVACC-${randomSuffix}`;

    const newAccount = {
      railwayUserId,
      name: name.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      passwordHash,
      gender: gender || 'M',
      dob: dob || '1995-01-01',
      address: address || 'India',
      aadhaarLast4: String(aadhaarLast4 || '').replace(/\D/g, '').slice(-4) || '9999',
      linkedApps: ['RailVoy Portal'],
      alerts: [
        {
          id: 'ALT_' + Date.now(),
          type: 'REGISTRATION',
          title: 'Railway Identity Issued',
          message: `Your universal Railway User ID ${railwayUserId} has been generated. Use it across RailVoy and partner platforms.`,
          createdAt: new Date().toISOString()
        }
      ],
      createdAt: new Date().toISOString(),
      isActive: true
    };

    accountsMap.set(railwayUserId, newAccount);
    saveData();

    // 7-day token persistence
    const token = jwt.sign({ railwayUserId, email: cleanEmail }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      message: 'Universal Railway Passenger Account generated successfully',
      railwayUserId,
      token,
      account: {
        railwayUserId,
        name: newAccount.name,
        email: newAccount.email,
        phone: '******' + cleanPhone.slice(-4),
        gender: newAccount.gender,
        dob: newAccount.dob,
        alerts: newAccount.alerts
      }
    });
  } catch (err) {
    console.error('[RailVoy Accounts] Register error:', err);
    res.status(500).json({ error: 'Error creating railway passenger account' });
  }
});

// 2. Login (7-day inactivity persistence)
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Railway User ID / Email / Phone and Password required' });
    }

    const cleanId = String(identifier).trim().toLowerCase();
    let account = null;

    for (const a of accountsMap.values()) {
      if (
        a.railwayUserId.toLowerCase() === cleanId ||
        a.email.toLowerCase() === cleanId ||
        a.phone === cleanId
      ) {
        account = a;
        break;
      }
    }

    if (!account) {
      return res.status(404).json({ error: 'No Railway User Account found with given identifier' });
    }

    const isMatch = await bcrypt.compare(password, account.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password. Authentication failed.' });
    }

    // 7-day persistent session token
    const token = jwt.sign({ railwayUserId: account.railwayUserId, email: account.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      account: {
        railwayUserId: account.railwayUserId,
        name: account.name,
        email: account.email,
        phone: '******' + account.phone.slice(-4),
        gender: account.gender,
        dob: account.dob,
        linkedApps: account.linkedApps,
        alerts: account.alerts || []
      }
    });
  } catch (err) {
    console.error('[RailVoy Accounts] Login error:', err);
    res.status(500).json({ error: 'Authentication service encountered an error' });
  }
});

// 3. Verify Railway ID / Email / Phone (Called by RailVoy or any railway ecosystem app)
// Supports lookup by: ?railwayUserId=RVACC-XXXX  OR  ?email=user@email.com  OR  ?phone=9876543210
router.get('/verify-id', (req, res) => {
  const { railwayUserId, email, phone } = req.query;
  if (!railwayUserId && !email && !phone) {
    return res.status(400).json({ error: 'Query parameter required: railwayUserId, email, or phone' });
  }

  let acc = null;

  if (railwayUserId) {
    const clean = String(railwayUserId).trim().toUpperCase();
    acc = accountsMap.get(clean);
  } else if (email) {
    const cleanEmail = String(email).trim().toLowerCase();
    for (const a of accountsMap.values()) {
      if ((a.email || '').toLowerCase() === cleanEmail) { acc = a; break; }
    }
  } else if (phone) {
    const cleanPhone = String(phone).trim();
    for (const a of accountsMap.values()) {
      if ((a.phone || '') === cleanPhone) { acc = a; break; }
    }
  }

  if (!acc) {
    // Return exists:false (non-404) so cross-service callers can distinguish "not found" from errors
    return res.json({ valid: false, exists: false, error: 'No Railway Account found with given identifier' });
  }

  res.json({
    valid: true,
    exists: true,
    railwayUserId: acc.railwayUserId,
    name: acc.name,
    email: acc.email,
    // Mask phone for privacy in cross-service responses
    mobile: '******' + String(acc.phone || '').slice(-4),
    gender: acc.gender,
    dob: acc.dob,
    maskedAadhaar: '•••• •••• ' + (acc.aadhaarLast4 || '****')
  });
});

// 4. Authenticate directly for external apps (RailVoy SSO check)
router.post('/authenticate-for-app', async (req, res) => {
  try {
    const { railwayUserId, password, appName } = req.body;
    if (!railwayUserId || !password) {
      return res.status(400).json({ error: 'Railway User ID and password required' });
    }

    const clean = String(railwayUserId).trim().toUpperCase();
    const acc = accountsMap.get(clean);
    if (!acc) {
      return res.status(404).json({ error: 'Railway User ID is not registered' });
    }

    const isMatch = await bcrypt.compare(password, acc.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password for this Railway Account' });
    }

    if (appName && !acc.linkedApps.includes(appName)) {
      acc.linkedApps.push(appName);
      saveData();
    }

    res.json({
      success: true,
      verified: true,
      railwayUser: {
        railwayUserId: acc.railwayUserId,
        name: acc.name,
        email: acc.email,
        phone: acc.phone,
        gender: acc.gender,
        dob: acc.dob
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Verification service error' });
  }
});

// 5. Sync Google User (Called automatically when user signs in with Google on RailVoy)
router.post('/sync-google-user', async (req, res) => {
  try {
    const { email, name, avatar } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required for sync' });

    const cleanEmail = String(email).trim().toLowerCase();
    let account = null;

    for (const a of accountsMap.values()) {
      if (a.email === cleanEmail) {
        account = a;
        break;
      }
    }

    if (!account) {
      // Auto-generate universal Railway ID for Google user
      const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
      const railwayUserId = `RVACC-G${randomSuffix}`;
      const salt = await bcrypt.genSalt(10);
      const defaultPasswordHash = await bcrypt.hash('GoogleOAuthLinked@2026', salt);

      account = {
        railwayUserId,
        name: name || cleanEmail.split('@')[0],
        email: cleanEmail,
        phone: '98' + Math.floor(10000000 + Math.random() * 90000000),
        passwordHash: defaultPasswordHash,
        gender: 'M',
        dob: '1996-01-01',
        address: 'Google Authenticated User',
        aadhaarLast4: '0000',
        linkedApps: ['RailVoy Portal', 'Google SSO'],
        alerts: [
          {
            id: 'ALT_G_' + Date.now(),
            type: 'GOOGLE_SYNC',
            title: 'Google Account Synchronized',
            message: `Your Google profile (${cleanEmail}) has been linked with universal Railway User ID: ${railwayUserId}.`,
            createdAt: new Date().toISOString()
          }
        ],
        createdAt: new Date().toISOString(),
        isActive: true
      };
      accountsMap.set(railwayUserId, account);
    } else {
      if (!account.linkedApps.includes('Google SSO')) {
        account.linkedApps.push('Google SSO');
      }
    }

    saveData();

    res.json({
      success: true,
      railwayUserId: account.railwayUserId,
      account: {
        railwayUserId: account.railwayUserId,
        name: account.name,
        email: account.email,
        phone: account.phone,
        linkedApps: account.linkedApps
      }
    });
  } catch (err) {
    console.error('[RailVoy Accounts] Google sync error:', err);
    res.status(500).json({ error: 'Google synchronization failed' });
  }
});

// 6. Dispatch Security Alert / OTP (Sent from RailVoy for forgot password, verification, etc.)
router.post('/dispatch-security-alert', (req, res) => {
  try {
    const { email, railwayUserId, type, code, title, message } = req.body;
    if (!email && !railwayUserId) {
      return res.status(400).json({ error: 'Target email or railwayUserId required' });
    }

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanId = String(railwayUserId || '').trim().toUpperCase();

    let account = null;
    for (const a of accountsMap.values()) {
      if (a.railwayUserId === cleanId || a.email === cleanEmail) {
        account = a;
        break;
      }
    }

    const alertItem = {
      id: 'SEC_' + Date.now(),
      type: type || 'SECURITY_CODE',
      code: code || '',
      title: title || 'Identity Verification Alert',
      message: message || `Verification security code: ${code}. Valid for 10 minutes.`,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    };

    if (account) {
      if (!account.alerts) account.alerts = [];
      account.alerts.unshift(alertItem);
      // Keep last 15 alerts
      account.alerts = account.alerts.slice(0, 15);
      saveData();
    }

    console.log(`[RailVoy Accounts] 📨 Security alert dispatched to Accounts App for ${cleanEmail || cleanId}: ${alertItem.title} (Code: ${code})`);

    res.json({
      success: true,
      message: 'Security alert successfully delivered to RailVoy Accounts application inbox'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to dispatch security alert' });
  }
});

// 7. Get Security Alerts (Inbox in Accounts App)
router.get('/alerts', (req, res) => {
  const { email, railwayUserId } = req.query;
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanId = String(railwayUserId || '').trim().toUpperCase();

  let account = null;
  for (const a of accountsMap.values()) {
    if (a.railwayUserId === cleanId || a.email === cleanEmail) {
      account = a;
      break;
    }
  }

  if (!account) {
    return res.json([]);
  }

  res.json(account.alerts || []);
});

// 8. Get Profile
router.get('/profile', authenticateToken, (req, res) => {
  res.json({
    railwayUserId: req.user.railwayUserId,
    name: req.user.name,
    email: req.user.email,
    phone: req.user.phone,
    gender: req.user.gender,
    dob: req.user.dob,
    address: req.user.address,
    aadhaarLast4: req.user.aadhaarLast4,
    linkedApps: req.user.linkedApps,
    alerts: req.user.alerts || [],
    createdAt: req.user.createdAt
  });
});


// 9. Forgot Password — Generate reset OTP & push to Security Inbox
// Accepts any of: railwayUserId, email, or phone
router.post('/forgot-password', async (req, res) => {
  try {
    const { railwayUserId, email, phone } = req.body;
    if (!railwayUserId && !email && !phone) {
      return res.status(400).json({ error: 'Provide your Railway User ID, registered email, or mobile number' });
    }

    const cleanId    = String(railwayUserId || '').trim().toUpperCase();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPhone = String(phone || '').replace(/\D/g, '');

    let account = null;
    for (const a of accountsMap.values()) {
      if (
        (cleanId   && a.railwayUserId === cleanId) ||
        (cleanEmail && (a.email || '').toLowerCase() === cleanEmail) ||
        (cleanPhone && (a.phone || '') === cleanPhone)
      ) {
        account = a;
        break;
      }
    }

    if (!account) {
      return res.status(404).json({ error: 'No Railway Account found with given identifier. Please check and retry.' });
    }

    const otp = generateOTP();
    pendingAccountResetOTPs.set(account.railwayUserId, {
      otp,
      expires: Date.now() + 10 * 60 * 1000
    });

    // Push to Security Inbox (same mechanism as main RailVoy dispatch)
    const alertItem = {
      id: 'RESET_' + Date.now(),
      type: 'PASSWORD_RESET',
      code: otp,
      title: 'Password Reset Verification Code',
      message: `Your one-time password reset code is ${otp}. Valid for 10 minutes. Enter this code to create a new password for your Railway Account.`,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    };
    if (!account.alerts) account.alerts = [];
    account.alerts.unshift(alertItem);
    account.alerts = account.alerts.slice(0, 15);
    saveData();

    console.log(`[RailVoy Accounts] 🔑 Password reset OTP dispatched for ${account.railwayUserId}: ${otp}`);

    // Mask identifiers for client response
    const emailParts = (account.email || '').split('@');
    const maskedEmail = emailParts.length === 2
      ? emailParts[0][0] + '***' + emailParts[0].slice(-1) + '@' + emailParts[1]
      : '***';

    res.json({
      success: true,
      railwayUserId: account.railwayUserId,
      maskedEmail,
      message: `Password reset code has been sent to your Security Inbox. Open your Railway Identity dashboard to view the code.`
    });
  } catch (err) {
    console.error('[RailVoy Accounts] Forgot password error:', err);
    res.status(500).json({ error: 'Could not process password reset request. Please try again.' });
  }
});

// 10. Reset Password — Verify OTP & save new bcrypt-hashed password
router.post('/reset-password', async (req, res) => {
  try {
    const { railwayUserId, otp, newPassword } = req.body;
    if (!railwayUserId || !otp || !newPassword) {
      return res.status(400).json({ error: 'Railway User ID, verification code, and new password are all required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const cleanId = String(railwayUserId).trim().toUpperCase();
    const stored = pendingAccountResetOTPs.get(cleanId);

    if (!stored || stored.otp !== String(otp).trim() || stored.expires < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired verification code. Please request a new one.' });
    }

    const account = accountsMap.get(cleanId);
    if (!account) {
      return res.status(404).json({ error: 'Railway Account not found' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    account.passwordHash = newHash;
    pendingAccountResetOTPs.delete(cleanId);

    // Push confirmation alert
    if (!account.alerts) account.alerts = [];
    account.alerts.unshift({
      id: 'RESET_DONE_' + Date.now(),
      type: 'PASSWORD_CHANGED',
      title: 'Password Changed Successfully',
      message: 'Your Railway Account password was changed. If you did not initiate this, contact support immediately.',
      createdAt: new Date().toISOString()
    });
    account.alerts = account.alerts.slice(0, 15);
    saveData();

    console.log(`[RailVoy Accounts] ✅ Password reset complete for ${cleanId}`);
    res.json({ success: true, message: 'Password updated successfully. You can now sign in with your new password.' });
  } catch (err) {
    console.error('[RailVoy Accounts] Reset password error:', err);
    res.status(500).json({ error: 'Could not reset password. Please try again.' });
  }
});

module.exports = router;
