const mongoose = require('mongoose');

let isConnected = false;
let isInMemoryFallback = false;

const connectDB = async () => {
  const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/railvoy';
  try {
    mongoose.set('strictQuery', false);
    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 3000
    });
    isConnected = true;
    console.log(`[Database] Connected to MongoDB: ${conn.connection.host}`);
  } catch (err) {
    console.warn(`[Database Warning] MongoDB connection failed (${err.message}). Using high-performance In-Memory 
      Fallback DB mode.`);
    isInMemoryFallback = true;
  }
};

module.exports = {
  connectDB,
  getIsConnected: () => isConnected,
  getIsFallback: () => isInMemoryFallback
};
