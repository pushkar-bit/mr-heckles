/**
 * @file usePropertySocket.js
 * @description React hook providing full Socket.io lifecycle management
 *              for the Mr. Heckles client application.
 *
 * Features:
 *   • Auto-connect on mount, auto-disconnect on unmount.
 *   • Joins the tenant's property room immediately on connection.
 *   • Exposes typed emitter functions for ticket:create & attendance:log.
 *   • Accepts arbitrary event listener registrations via onEvent().
 *   • Auto-reconnection with exponential backoff (Socket.io client default).
 *   • Connection state surfaced as { isConnected, isConnecting, error }.
 *
 * Usage:
 *   const { isConnected, emitTicket, emitAttendance, onEvent } = usePropertySocket({
 *     serverUrl:  'http://localhost:5000',
 *     token:      `${userId}:${role}:${propertyId}`,
 *     propertyId: 'prop123',
 *   });
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

// ─────────────────────────────────────────────────────────────
//  Hook
// ─────────────────────────────────────────────────────────────

/**
 * @param {Object} params
 * @param {string}   params.serverUrl    — Backend Socket.io server URL
 * @param {string}   params.token        — Auth token (userId:role:propertyId)
 * @param {string}   [params.propertyId] — Room to join on connect
 * @param {boolean}  [params.autoConnect=true]
 * @param {Function} [params.onTicketNew]         — Listener: ticket:new broadcasts
 * @param {Function} [params.onAttendanceUpdated] — Listener: attendance:updated broadcasts
 * @param {Function} [params.onSystemMessage]     — Listener: system:* events
 */
const usePropertySocket = ({
  serverUrl,
  token,
  propertyId,
  autoConnect = true,
  onTicketNew,
  onAttendanceUpdated,
  onSystemMessage,
}) => {
  const socketRef = useRef(null);

  const [isConnected,  setIsConnected]  = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error,        setError]        = useState(null);

  // Keep listener callbacks in refs so they don't trigger re-effects
  const onTicketNewRef         = useRef(onTicketNew);
  const onAttendanceUpdatedRef = useRef(onAttendanceUpdated);
  const onSystemMessageRef     = useRef(onSystemMessage);

  useEffect(() => { onTicketNewRef.current         = onTicketNew;         }, [onTicketNew]);
  useEffect(() => { onAttendanceUpdatedRef.current = onAttendanceUpdated; }, [onAttendanceUpdated]);
  useEffect(() => { onSystemMessageRef.current     = onSystemMessage;     }, [onSystemMessage]);

  // ─── Socket Lifecycle ────────────────────────────────────────
  useEffect(() => {
    if (!autoConnect || !serverUrl || !token) return;

    setIsConnecting(true);
    setError(null);

    const socket = io(serverUrl, {
      auth: { token },
      // Auto-reconnect with exponential backoff — essential for mobile
      reconnection:        true,
      reconnectionAttempts: Infinity,
      reconnectionDelay:   1_000,   // Start at 1s
      reconnectionDelayMax: 10_000, // Cap at 10s
      randomizationFactor: 0.4,
      // Prefer WebSocket; fall back to polling on restrictive networks
      transports: ['websocket', 'polling'],
      timeout: 10_000,
    });

    socketRef.current = socket;

    // ── Core lifecycle events ──────────────────────────────────
    socket.on('connect', () => {
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);

      // Join property room if provided
      if (propertyId) {
        socket.emit('room:join', { propertyId });
      }
    });

    socket.on('disconnect', (reason) => {
      setIsConnected(false);
      // 'io server disconnect' means server explicitly disconnected us (e.g. auth failure)
      // In that case, do not auto-reconnect — surface as an error.
      if (reason === 'io server disconnect') {
        setError('Server terminated the connection. Please re-authenticate.');
        socket.disconnect(); // prevent auto-reconnect
      }
    });

    socket.on('connect_error', (err) => {
      setIsConnecting(false);
      setError(err.message ?? 'Connection failed.');
    });

    socket.on('reconnect', () => {
      setIsConnected(true);
      setError(null);
      // Re-join room after reconnect
      if (propertyId) socket.emit('room:join', { propertyId });
    });

    socket.on('reconnect_attempt', () => {
      setIsConnecting(true);
    });

    // ── Application events ─────────────────────────────────────
    socket.on('ticket:new', (data) => {
      onTicketNewRef.current?.(data);
    });

    socket.on('attendance:updated', (data) => {
      onAttendanceUpdatedRef.current?.(data);
    });

    // Catch all system:* events
    ['system:connected', 'system:await_sync', 'system:room_joined'].forEach((ev) => {
      socket.on(ev, (data) => {
        onSystemMessageRef.current?.({ event: ev, data });
      });
    });

    // ── Cleanup ───────────────────────────────────────────────
    return () => {
      socket.off(); // Remove all listeners
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [serverUrl, token, autoConnect]); // propertyId intentionally omitted — handled via room:join

  // Re-join room if propertyId changes after initial connection
  useEffect(() => {
    if (socketRef.current?.connected && propertyId) {
      socketRef.current.emit('room:join', { propertyId });
    }
  }, [propertyId]);

  // ─── Emitter Factories ───────────────────────────────────────

  /**
   * Raise a maintenance/incident ticket for a room.
   *
   * @param {Object} payload
   * @param {string} payload.propertyId
   * @param {string} payload.roomNumber
   * @param {string} payload.issueDescription
   * @param {string} [payload.issueCategory]
   * @param {string} [payload.priority]
   * @returns {Promise<Object>} Server acknowledgement
   */
  const emitTicket = useCallback((payload) => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current?.connected) {
        return reject(new Error('Socket not connected.'));
      }
      socketRef.current.emit('ticket:create', payload, (ack) => {
        ack?.success ? resolve(ack) : reject(new Error(ack?.message ?? 'Unknown error.'));
      });
    });
  }, []);

  /**
   * Confirm daily house-help attendance (cleaning or cooking).
   *
   * @param {Object} payload
   * @param {string} payload.propertyId
   * @param {string} payload.date            — ISO date string
   * @param {string} payload.houseHelpCategory — 'cleaning' | 'cooking'
   * @returns {Promise<Object>} Server acknowledgement
   */
  const emitAttendance = useCallback((payload) => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current?.connected) {
        return reject(new Error('Socket not connected.'));
      }
      socketRef.current.emit('attendance:log', payload, (ack) => {
        ack?.success ? resolve(ack) : reject(new Error(ack?.message ?? 'Unknown error.'));
      });
    });
  }, []);

  /**
   * Send a ping to the server and measure round-trip latency.
   * @returns {Promise<number>} Round-trip latency in milliseconds.
   */
  const ping = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current?.connected) return reject(new Error('Not connected.'));
      const sent = Date.now();
      socketRef.current.emit('ping');
      socketRef.current.once('pong', () => resolve(Date.now() - sent));
      setTimeout(() => reject(new Error('Ping timeout.')), 5000);
    });
  }, []);

  /**
   * Register a listener for any socket event.
   * Returns an unsubscribe function.
   *
   * @param {string}   event
   * @param {Function} handler
   * @returns {Function} unsubscribe
   */
  const onEvent = useCallback((event, handler) => {
    socketRef.current?.on(event, handler);
    return () => socketRef.current?.off(event, handler);
  }, []);

  /**
   * Manually disconnect the socket.
   */
  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
  }, []);

  /**
   * Manually reconnect after an explicit disconnect.
   */
  const reconnect = useCallback(() => {
    socketRef.current?.connect();
  }, []);

  // ─── Public Interface ────────────────────────────────────────

  return {
    // State
    isConnected,
    isConnecting,
    error,
    // Emitters
    emitTicket,
    emitAttendance,
    ping,
    // Generic listener registration
    onEvent,
    // Manual lifecycle control
    disconnect,
    reconnect,
    // Raw socket ref (escape hatch for advanced usage)
    socketRef,
  };
};

export default usePropertySocket;
