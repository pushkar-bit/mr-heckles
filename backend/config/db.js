/**
 * @file db.js
 * @description Mongoose connection manager for Mr. Heckles.
 *
 * Exports a singleton `connectDB()` function that establishes one
 * persistent MongoDB Atlas connection for the entire server process.
 *
 * Connection events are logged so infrastructure alerts can be wired
 * to them in a production observability stack (Datadog, CloudWatch, etc).
 */

import mongoose from 'mongoose';

// Track whether we've already opened a connection
let _isConnected = false;

/**
 * connectDB
 * Connects to MongoDB using the MONGODB_URI environment variable.
 * Safe to call multiple times — subsequent calls are no-ops if already connected.
 *
 * @returns {Promise<void>}
 */
const connectDB = async () => {
  if (_isConnected) {
    console.log('[db] Already connected to MongoDB — skipping reconnect.');
    return;
  }

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      '[db] MONGODB_URI environment variable is not defined. ' +
      'Set it in your .env file before starting the server.'
    );
  }

  try {
    const conn = await mongoose.connect(uri, {
      // Connection pool
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 8_000,  // Fail fast if Atlas unreachable
      socketTimeoutMS:          45_000,
      // Heartbeat
      heartbeatFrequencyMS:     10_000,
    });

    _isConnected = true;

    console.log(`[db] MongoDB connected — host: ${conn.connection.host}`);
    console.log(`[db] Database name: ${conn.connection.name}`);
  } catch (err) {
    console.error('[db] Connection failed:', err.message);
    // Exit with non-zero code — let the process manager (PM2, Render, Railway) restart
    process.exit(1);
  }
};

// ── Connection Event Hooks ────────────────────────────────────

mongoose.connection.on('disconnected', () => {
  console.warn('[db] MongoDB disconnected.');
  _isConnected = false;
});

mongoose.connection.on('reconnected', () => {
  console.log('[db] MongoDB reconnected.');
  _isConnected = true;
});

mongoose.connection.on('error', (err) => {
  console.error('[db] MongoDB connection error:', err.message);
  _isConnected = false;
});

// Graceful shutdown on SIGINT / SIGTERM (Docker, PM2, Railway)
const gracefulShutdown = async (signal) => {
  console.log(`[db] ${signal} received — closing MongoDB connection.`);
  await mongoose.connection.close();
  console.log('[db] Connection closed cleanly.');
  process.exit(0);
};

process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export default connectDB;
