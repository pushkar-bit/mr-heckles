/**
 * @file server.js
 * @description Mr. Heckles — Master production server entry point.
 *
 * Orchestration layers (in order of initialisation):
 *   1. Environment  — dotenv config loaded first
 *   2. Express app  — Middleware stack: CORS, body-parser, security headers
 *   3. MongoDB      — Mongoose connection via config/db.js
 *   4. REST routes  — All API route namespaces mounted under /api
 *   5. HTTP server  — Node http.createServer wrapping Express
 *   6. Socket.io    — Attached to the shared HTTP server
 *   7. Static files — Frontend build served in production
 *   8. Listen       — Unified port binding for HTTP + WebSocket
 *
 * Single port design: Socket.io and Express share port 5000.
 * The WebSocket upgrade is handled transparently by the http.Server.
 */

import 'dotenv/config';
import express                from 'express';
import http                   from 'http';
import cors                   from 'cors';
import helmet                 from 'helmet';
import compression            from 'compression';
import morgan                 from 'morgan';
import path                   from 'path';
import { fileURLToPath }      from 'url';
import connectDB              from './config/db.js';
import { initSocketManager }  from './config/socket.js';
import propertySyncRoutes     from './routes/property.routes.js';
import authRoutes             from './routes/auth.routes.js';
import paymentRoutes          from './routes/payment.routes.js';
import { clerkMiddleware }    from './middleware/auth.middleware.js';

// ─────────────────────────────────────────────────────────────
//  ESM __dirname shim (not available natively in ES modules)
// ─────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────
//  Environment validation
// ─────────────────────────────────────────────────────────────

const REQUIRED_ENV = [
  'MONGODB_URI',
  'CLERK_SECRET_KEY',
  'CLIENT_ORIGIN',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
];

REQUIRED_ENV.forEach((key) => {
  if (!process.env[key]) {
    console.error(`[server] Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

const PORT        = parseInt(process.env.PORT ?? '5000', 10);
const NODE_ENV    = process.env.NODE_ENV ?? 'development';
const IS_PROD     = NODE_ENV === 'production';

// ─────────────────────────────────────────────────────────────
//  Step 1 — Express Application
// ─────────────────────────────────────────────────────────────

const app = express();

// ── CORS ──────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.CLIENT_ORIGIN,
  ...(process.env.EXTRA_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS policy: origin "${origin}" is not allowed.`));
  },
  methods:          ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders:   ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders:   ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  credentials:      true,
  maxAge:           600, // 10 min preflight cache
}));

// ── Security headers ──────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: IS_PROD,  // Disable CSP in dev (breaks React DevTools)
  crossOriginEmbedderPolicy: false, // Needed for Three.js SharedArrayBuffer features
}));

// ── Compression ────────────────────────────────────────────────
app.use(compression({ threshold: 1024 }));

// ── Clerk session middleware ───────────────────────────────────
// Must run BEFORE body parsers and route handlers.
// Parses Clerk's JWT from Authorization header / __session cookie,
// and populates req.auth on every request.
app.use(clerkMiddleware());

// ── Body parsers ───────────────────────────────────────────────
// IMPORTANT: Razorpay webhook signature validation requires the raw,
// unparsed body bytes. This route-specific raw parser MUST be registered
// BEFORE the global express.json() middleware so that Razorpay's HMAC
// check in payment.controller.js receives a Buffer, not a parsed object.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({
  limit: '2mb',  // Sufficient for property payloads; rejects oversized bodies
  strict: true,
}));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ── Request logging ────────────────────────────────────────────
app.use(morgan(IS_PROD ? 'combined' : 'dev'));

// ── Request ID propagation ─────────────────────────────────────
app.use((req, _, next) => {
  req.requestId = req.headers['x-request-id'] ?? crypto.randomUUID();
  next();
});

// ─────────────────────────────────────────────────────────────
//  Step 2 — Database Connection
// ─────────────────────────────────────────────────────────────

await connectDB();

// ─────────────────────────────────────────────────────────────
//  Step 3 — REST API Routes
// ─────────────────────────────────────────────────────────────

// Health check (no auth required — used by load balancer / uptime monitors)
app.get('/health', (_, res) => {
  res.status(200).json({
    status:  'ok',
    service: 'mr-heckles-api',
    env:      NODE_ENV,
    time:     new Date().toISOString(),
  });
});

// Auth routes — register, login, getMe
// POST /api/auth/register
// POST /api/auth/login
// GET  /api/auth/me
app.use('/api/auth', authRoutes);

// Property sync routes
// POST /api/properties/sync
// POST /api/properties/sync-code
app.use('/api/properties', propertySyncRoutes);

// Payment routes (Razorpay)
// POST /api/payments/create-order
// POST /api/payments/webhook       ← receives raw Buffer body
app.use('/api/payments', paymentRoutes);

// TODO: Mount additional route namespaces as they are built:
// app.use('/api/users',      userRoutes);
// app.use('/api/tickets',    ticketRoutes);
// app.use('/api/attendance', attendanceRoutes);
// app.use('/api/stays',      stayRoutes);

// ─────────────────────────────────────────────────────────────
//  Step 4 — Static File Serving (Production)
//  Serves the compiled React/Vite frontend build.
// ─────────────────────────────────────────────────────────────

if (IS_PROD) {
  const staticPath = path.join(__dirname, 'frontend', 'dist');
  app.use(express.static(staticPath, {
    maxAge: '7d',    // Aggressively cache hashed JS/CSS bundles
    etag:   true,
  }));

  // Client-side routing fallback — serve index.html for all non-API routes
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path === '/health') return;
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

// ─────────────────────────────────────────────────────────────
//  Step 5 — Global Error Handler
// ─────────────────────────────────────────────────────────────

// 404 handler (must come AFTER all routes)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralised error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // CORS errors
  if (err.message?.startsWith('CORS policy:')) {
    return res.status(403).json({ success: false, message: err.message });
  }

  const status  = err.status ?? err.statusCode ?? 500;
  const message = IS_PROD && status === 500
    ? 'An internal server error occurred.'
    : (err.message ?? 'Unknown error');

  console.error(`[server] Error [${status}] — ${req.method} ${req.path}:`, err);

  res.status(status).json({ success: false, message, requestId: req.requestId });
});

// ─────────────────────────────────────────────────────────────
//  Step 6 — HTTP Server + Socket.io (Unified Port)
// ─────────────────────────────────────────────────────────────

const httpServer = http.createServer(app);

// Attach Socket.io — shares the same port as Express REST API
initSocketManager(httpServer, {
  origin: ALLOWED_ORIGINS,
});

// ─────────────────────────────────────────────────────────────
//  Step 7 — Start Listening
// ─────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────────┐');
  console.log(`  │  Mr. Heckles API — ${NODE_ENV.padEnd(10)}              │`);
  console.log(`  │  HTTP  →  http://localhost:${PORT}           │`);
  console.log(`  │  WS    →  ws://localhost:${PORT}             │`);
  console.log('  └─────────────────────────────────────────┘');
  console.log('');
});

// Handle uncaught promise rejections (fail loudly in production)
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled promise rejection:', reason);
  if (IS_PROD) process.exit(1);
});

export default app;
