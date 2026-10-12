require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const payRoutes = require('./routes/payRoutes');

const app = express();
const PORT = process.env.PORT || 4001;

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('CORS not allowed'));
  },
  credentials: true
}));

app.use(express.json());

// ─── GLOBAL RATE LIMIT ───────────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please slow down.' }
}));

// ─── ROUTES ──────────────────────────────────────────────────────────────────
app.use('/api/pay', payRoutes);

// ─── HEALTH ──────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'RailVoy Pay service running', port: PORT, timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[RailVoy Pay] 💳 Payment gateway running on port ${PORT}`);
  console.log(`[RailVoy Pay] CORS allowed origins: ${allowedOrigins.join(', ')}`);
});
