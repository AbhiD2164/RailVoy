const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

const { connectDB } = require('./config/db');
const { seedDatabase } = require('./seedDataset');
const authRoutes = require('./routes/authRoutes');
const { router: trainRoutes, setSeedCache } = require('./routes/trainRoutes');
const { router: bookingRoutes } = require('./routes/bookingRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const adminRoutes = require('./routes/adminRoutes');
const bankingRoutes = require('./routes/bankingRoutes');

const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/trains', trainRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/banking', bankingRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'RailVoy Backend API',
    timestamp: new Date()
  });
});

// Socket.IO event handling
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  socket.on('join_train_room', (trainNo) => {
    socket.join(`train_${trainNo}`);
    console.log(`[Socket.IO] ${socket.id} joined train room: train_${trainNo}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;

// Initialize server
const startServer = async () => {
  await connectDB();
  const dataset = await seedDatabase();
  setSeedCache(dataset.stations, dataset.trains);

  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 RailVoy Backend API running on http://localhost:${PORT}`);
    console.log(`⚡ Socket.IO real-time engine active`);
    console.log(`====================================================`);
  });
};

startServer();
