/**
 * @file socketManager.js
 * @description Mr. Heckles — Real-time bi-directional event hub.
 *
 * Architecture:
 *   • Single Socket.io server instance attached to the shared HTTP server.
 *   • Dynamic room isolation per propertyId — tenants and landlords of the
 *     same property share one room; events never leak to other properties.
 *   • Event contract:
 *       ticket:create    → Tenant raises a room issue
 *                          Server: updates unit status → 'maintenance' in DB
 *                          Broadcasts: ticket:new to room
 *       attendance:log   → Tenant confirms daily house-help task
 *                          Server: upserts AttendanceLog doc
 *                          Broadcasts: attendance:updated to room
 *   • Heartbeat: 25s ping interval, 60s timeout window.
 *   • Reconnection: handled on the client (usePropertySocket hook);
 *     server state is stateless per connection.
 *
 * Usage (in server.js):
 *   import { initSocketManager } from './socket/socketManager.js';
 *   initSocketManager(httpServer);
 */

import { Server as SocketIOServer } from 'socket.io';
import Property from '../models/Property.js';
import Ticket from '../models/Ticket.js';
import Attendance from '../models/Attendance.js';

// ─────────────────────────────────────────────────────────────
//  Module-level singleton — accessible via getIO()
// ─────────────────────────────────────────────────────────────

let _io = null;

/**
 * Returns the initialised Socket.io server instance.
 * Throws if called before initSocketManager().
 */
export const getIO = () => {
  if (!_io) throw new Error('[socketManager] Socket.io not initialised. Call initSocketManager(httpServer) first.');
  return _io;
};

// ─────────────────────────────────────────────────────────────
//  Auth Middleware (socket-level)
//  Validates the JWT passed as `auth.token` on handshake.
// ─────────────────────────────────────────────────────────────

/**
 * socketAuthMiddleware
 * Attaches decoded user payload to socket.data.user.
 *
 * Replace the stub below with your real JWT verification.
 * Pattern mirrors the Express requireAuth middleware.
 */
const socketAuthMiddleware = (socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error('SOCKET_AUTH_MISSING: No authentication token provided.'));
  }

  try {
    // TODO: Replace with real JWT.verify(token, process.env.JWT_SECRET)
    // For now: decode payload from token assuming format "userId:role:propertyId"
    // In production wire to your existing JWT library.
    const [userId, role, propertyId] = token.split(':');
    if (!userId || !role) throw new Error('Malformed token.');

    socket.data.user = { userId, role, propertyId };
    next();
  } catch (err) {
    next(new Error(`SOCKET_AUTH_INVALID: ${err.message}`));
  }
};

// ─────────────────────────────────────────────────────────────
//  Event Handlers
// ─────────────────────────────────────────────────────────────

/**
 * Handles: ticket:create
 *
 * Payload: {
 *   propertyId: string,
 *   roomNumber:  string,
 *   issueDescription: string,
 *   issueCategory?: string,
 *   priority?: string
 * }
 *
 * Actions:
 *   1. Validate payload fields.
 *   2. Create IncidentTicket document.
 *   3. Set matching unit status → 'maintenance' in Property.unitsLayout.
 *   4. Broadcast ticket:new to all sockets in the propertyId room.
 */
const handleTicketCreate = async (socket, payload, callback) => {
  const { propertyId, roomNumber, issueDescription, issueCategory, priority } = payload ?? {};
  const { userId } = socket.data.user;

  // ── Validation ─────────────────────────────────────────────
  if (!propertyId || !roomNumber || !issueDescription) {
    return callback?.({
      success: false,
      message: 'ticket:create requires propertyId, roomNumber, and issueDescription.',
    });
  }

  try {
    // ── 1. Persist ticket ───────────────────────────────────
    const ticket = await Ticket.create({
      propertyId,
      roomNumber: roomNumber.toUpperCase().trim(),
      raisedBy: userId,
      issueDescription: issueDescription.trim(),
      issueCategory: issueCategory ?? 'other',
      priority: priority ?? 'medium',
      status: 'open',
    });

    // ── 2. Update unit status → 'maintenance' ───────────────
    await Property.updateOne(
      {
        _id: propertyId,
        'unitsLayout.roomNumber': roomNumber.toUpperCase().trim(),
      },
      {
        $set: { 'unitsLayout.$.status': 'maintenance' },
      }
    );

    // ── 3. Broadcast to property room ───────────────────────
    const broadcastPayload = {
      ticketId:        ticket._id,
      propertyId,
      roomNumber:      ticket.roomNumber,
      issueDescription: ticket.issueDescription,
      issueCategory:   ticket.issueCategory,
      priority:        ticket.priority,
      status:          ticket.status,
      raisedBy:        userId,
      createdAt:       ticket.createdAt,
      unitStatusUpdate: { roomNumber: ticket.roomNumber, newStatus: 'maintenance' },
    };

    // Emit to ALL clients in the property room (including sender for UI confirmation)
    socket.to(propertyId).emit('ticket:new', broadcastPayload);

    // Acknowledge success to the emitting client
    callback?.({ success: true, ticket: broadcastPayload });

    console.log(`[socket] ticket:create — room "${roomNumber}" set to maintenance in property ${propertyId}`);
  } catch (err) {
    console.error('[socket] ticket:create error:', err);
    callback?.({ success: false, message: 'Failed to create ticket. Please retry.' });
  }
};

/**
 * Handles: attendance:log
 *
 * Payload: {
 *   propertyId: string,
 *   date:       string (ISO date),
 *   houseHelpCategory: 'cleaning' | 'cooking'
 * }
 *
 * Actions:
 *   1. Upsert AttendanceLog for (property, date, category).
 *   2. Add tenantId to confirmedBy array (idempotent via $addToSet).
 *   3. Broadcast attendance:updated to property room.
 */
const handleAttendanceLog = async (socket, payload, callback) => {
  const { propertyId, date, houseHelpCategory } = payload ?? {};
  const { userId } = socket.data.user;

  if (!propertyId || !date || !houseHelpCategory) {
    return callback?.({
      success: false,
      message: 'attendance:log requires propertyId, date, and houseHelpCategory.',
    });
  }

  if (!['cleaning', 'cooking'].includes(houseHelpCategory)) {
    return callback?.({
      success: false,
      message: 'houseHelpCategory must be "cleaning" or "cooking".',
    });
  }

  try {
    // Normalise date to UTC midnight
    const normDate = new Date(date);
    normDate.setUTCHours(0, 0, 0, 0);

    // Upsert — create if absent, add tenantId to confirmedBy
    const log = await Attendance.findOneAndUpdate(
      { propertyId, date: normDate, houseHelpCategory },
      {
        $addToSet: { confirmedBy: userId },
        $setOnInsert: { propertyId, date: normDate, houseHelpCategory },
      },
      { upsert: true, new: true, runValidators: true }
    );

    // Derive status from confirmation count (mirrors the pre-save hook logic
    // but we do it here too since findOneAndUpdate bypasses pre-save hooks)
    const status = log.confirmedBy.length > 0 ? 'fulfilled' : 'absent';
    await Attendance.updateOne({ _id: log._id }, { $set: { status } });

    const broadcastPayload = {
      attendanceId:      log._id,
      propertyId,
      date:              normDate,
      houseHelpCategory,
      status,
      confirmedBy:       log.confirmedBy,
      confirmationCount: log.confirmedBy.length,
      confirmedByUser:   userId,
    };

    socket.to(propertyId).emit('attendance:updated', broadcastPayload);
    callback?.({ success: true, attendance: broadcastPayload });

    console.log(`[socket] attendance:log — ${houseHelpCategory} confirmed by ${userId} for property ${propertyId}`);
  } catch (err) {
    console.error('[socket] attendance:log error:', err);
    callback?.({ success: false, message: 'Failed to log attendance. Please retry.' });
  }
};

// ─────────────────────────────────────────────────────────────
//  Connection Handler
// ─────────────────────────────────────────────────────────────

const handleConnection = (socket) => {
  const { userId, role, propertyId } = socket.data.user;

  console.log(`[socket] connect  — user=${userId} role=${role} prop=${propertyId} sid=${socket.id}`);

  // ── Assign to property room ──────────────────────────────
  if (propertyId) {
    socket.join(propertyId);
    console.log(`[socket] joined room "${propertyId}"`);
  } else {
    // Tenant hasn't synced yet — they'll join a room later via sync event
    socket.emit('system:await_sync', {
      message: 'No property assigned. Complete Wi-Fi sync to join your property room.',
    });
  }

  // ── Emit connection confirmation ─────────────────────────
  socket.emit('system:connected', {
    socketId: socket.id,
    userId,
    role,
    propertyId: propertyId ?? null,
    serverTime: new Date().toISOString(),
  });

  // ── Register Event Listeners ─────────────────────────────
  socket.on('ticket:create',   (payload, cb) => handleTicketCreate(socket, payload, cb));
  socket.on('attendance:log',  (payload, cb) => handleAttendanceLog(socket, payload, cb));

  // Allow client to join/switch property room after sync
  socket.on('room:join', ({ propertyId: newPropertyId }) => {
    if (!newPropertyId) return;
    socket.join(newPropertyId);
    socket.data.user.propertyId = newPropertyId;
    socket.emit('system:room_joined', { propertyId: newPropertyId });
    console.log(`[socket] user ${userId} joined room "${newPropertyId}"`);
  });

  // ── Heartbeat / Ping-Pong ────────────────────────────────
  socket.on('ping', () => {
    socket.emit('pong', { serverTime: Date.now() });
  });

  // ── Disconnect ───────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnect — user=${userId} reason="${reason}" sid=${socket.id}`);
    // Socket.io automatically removes the socket from all rooms on disconnect.
    // No manual cleanup needed for propertyId room membership.
  });

  socket.on('error', (err) => {
    console.error(`[socket] error — user=${userId} sid=${socket.id}:`, err.message);
  });
};

// ─────────────────────────────────────────────────────────────
//  Initialiser — called once in server.js
// ─────────────────────────────────────────────────────────────

/**
 * Attaches Socket.io to the shared HTTP server and configures
 * all middleware, CORS, and event routing.
 *
 * @param {import('http').Server} httpServer
 * @param {Object} [corsOptions] — Override CORS for socket connections
 * @returns {SocketIOServer}
 */
export const initSocketManager = (httpServer, corsOptions = {}) => {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOptions.origin ?? process.env.CLIENT_ORIGIN ?? 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Heartbeat configuration for erratic cellular/mobile networks
    pingInterval: 25_000,  // 25s — how often to ping clients
    pingTimeout:  60_000,  // 60s — disconnect if no pong within this window
    // Allow upgrade from long-polling to WebSocket (default)
    transports: ['websocket', 'polling'],
    // Reconnection is handled client-side; server is stateless per connection
    allowEIO3: true, // Socket.io v3 client compatibility
  });

  // Attach auth middleware globally
  io.use(socketAuthMiddleware);

  // Wire connection handler
  io.on('connection', handleConnection);

  _io = io;

  console.log('[socketManager] Socket.io initialised and ready.');
  return io;
};

export default initSocketManager;
