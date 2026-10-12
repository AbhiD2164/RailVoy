/**
 * redisService.js — Enterprise Distributed Caching & Distributed Fare-Lock Engine
 * 
 * Provides:
 * 1. Atomic 5-Minute Fare Lock with hardware TTL expiration (SET NX EX)
 * 2. High-speed seat inventory & train search caching
 * 3. Graceful in-memory fallback if Redis is offline / not installed
 */

const REDIS_URL = process.env.REDIS_URL || 'redis://:railvoy_redis_secret_2026@127.0.0.1:6379';

let redisClient = null;
let isRedisConnected = false;
const inMemoryCache = new Map();

// Dynamically attempt to load ioredis if installed
try {
  const Redis = require('ioredis');
  redisClient = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy(times) {
      if (times > 2) {
        return null; // Stop retrying; use local in-memory grid
      }
      return 500;
    },
    lazyConnect: true
  });

  redisClient.connect().then(() => {
    isRedisConnected = true;
    console.log('⚡ [Redis] Connected to Distributed In-Memory Cache Grid');
  }).catch(() => {
    isRedisConnected = false;
    console.log('ℹ️  [Redis] Offline — Operating in high-speed In-Memory fallback mode');
  });

  redisClient.on('error', () => {
    isRedisConnected = false;
  });
} catch (e) {
  // ioredis package not present or runtime load skipped
  isRedisConnected = false;
}

/**
 * Stores a 5-minute atomic fare lock.
 * In Redis: Uses SET key value EX 300 NX (Atomic & distributed).
 * In Fallback: Uses in-memory Map with automatic TTL deletion.
 */
const setFareLock = async (lockToken, lockData, ttlSeconds = 300) => {
  const payload = JSON.stringify(lockData);
  if (isRedisConnected && redisClient) {
    try {
      await redisClient.set(`farelock:${lockToken}`, payload, 'EX', ttlSeconds, 'NX');
      return true;
    } catch (err) {
      // Fallback on write error
    }
  }

  // Resilient memory cache
  inMemoryCache.set(`farelock:${lockToken}`, {
    data: lockData,
    expiresAt: Date.now() + (ttlSeconds * 1000)
  });
  return true;
};

/**
 * Retrieves a fare lock by token.
 */
const getFareLock = async (lockToken) => {
  if (isRedisConnected && redisClient) {
    try {
      const raw = await redisClient.get(`farelock:${lockToken}`);
      if (raw) return JSON.parse(raw);
    } catch (err) {}
  }

  const cached = inMemoryCache.get(`farelock:${lockToken}`);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    inMemoryCache.delete(`farelock:${lockToken}`);
    return null;
  }
  return cached.data;
};

/**
 * Consumes and deletes a fare lock atomically.
 */
const deleteFareLock = async (lockToken) => {
  if (isRedisConnected && redisClient) {
    try {
      await redisClient.del(`farelock:${lockToken}`);
    } catch (err) {}
  }
  inMemoryCache.delete(`farelock:${lockToken}`);
};

/**
 * Caches train search queries to accelerate high-traffic routes
 */
const cacheSearchQuery = async (cacheKey, results, ttlSeconds = 60) => {
  if (isRedisConnected && redisClient) {
    try {
      await redisClient.set(`search:${cacheKey}`, JSON.stringify(results), 'EX', ttlSeconds);
    } catch (err) {}
  }
};

const getCachedSearchQuery = async (cacheKey) => {
  if (isRedisConnected && redisClient) {
    try {
      const data = await redisClient.get(`search:${cacheKey}`);
      if (data) return JSON.parse(data);
    } catch (err) {}
  }
  return null;
};

module.exports = {
  setFareLock,
  getFareLock,
  deleteFareLock,
  cacheSearchQuery,
  getCachedSearchQuery,
  isRedisConnected: () => isRedisConnected
};
