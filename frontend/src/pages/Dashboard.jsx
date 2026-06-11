/**
 * @file Dashboard.jsx
 * @description Mr. Heckles main dashboard — the full-viewport 3D canvas wired
 * to live auth state, IP sync, Socket.io, and the context overlay panel.
 *
 * Flow:
 *   1. On mount → POST /api/properties/sync (auto-detect by gateway IP)
 *   2. If matched → store property, connect socket to property room
 *   3. If no match → show property code input modal
 *   4. ThreePropertyCanvas renders as the full background viewport
 *   5. Clicking a building → opens ContextOverlayPanel for that building type
 *   6. Explode button toggles the matrix explosion animation (when a property is synced)
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate }              from 'react-router-dom';
import { useAuth }                  from '../context/AuthContext.jsx';
import ThreePropertyCanvas          from '../../ThreePropertyCanvas.jsx';
import ContextOverlayPanel          from '../../ContextOverlayPanel.jsx';
import usePropertySocket            from '../../hooks/usePropertySocket.js';

// ─────────────────────────────────────────────────────────────
//  Inline style tokens
// ─────────────────────────────────────────────────────────────

const T = {
  hud: {
    position: 'fixed', top: '28px', left: '32px', zIndex: 100,
    display: 'flex', flexDirection: 'column', gap: '4px',
    pointerEvents: 'none',
  },
  hudName: {
    fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: '300',
    letterSpacing: '0.08em', color: 'rgba(255,255,255,0.72)',
  },
  hudRole: {
    fontFamily: "'Inter', sans-serif", fontSize: '8px', fontWeight: '400',
    letterSpacing: '0.38em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.25)',
  },
  hudBtn: {
    fontFamily: "'Inter', sans-serif", fontSize: '8px', fontWeight: '300',
    letterSpacing: '0.32em', textTransform: 'uppercase',
    background: 'transparent', border: 'none',
    color: 'rgba(255,255,255,0.22)', cursor: 'pointer',
    padding: '4px 0', textAlign: 'left', pointerEvents: 'all',
    transition: 'color 150ms ease',
  },
  syncBadge: (synced) => ({
    position: 'fixed', top: '28px', right: '32px', zIndex: 100,
    fontFamily: "'Inter', sans-serif", fontSize: '8px', fontWeight: '300',
    letterSpacing: '0.32em', textTransform: 'uppercase',
    color: synced ? 'rgba(80,160,100,0.7)' : 'rgba(255,255,255,0.2)',
    display: 'flex', alignItems: 'center', gap: '7px',
    pointerEvents: synced ? 'none' : 'all',
    cursor: synced ? 'default' : 'pointer',
  }),
  dot: (synced) => ({
    width: '5px', height: '5px', borderRadius: '50%',
    background: synced ? 'rgba(80,160,100,0.8)' : 'rgba(255,255,255,0.2)',
    flexShrink: 0,
    animation: synced ? 'none' : 'pulse 2s ease-in-out infinite',
  }),
  explodeBtn: {
    position: 'fixed', bottom: '80px', right: '32px', zIndex: 100,
    fontFamily: "'Inter', sans-serif", fontSize: '8px', fontWeight: '300',
    letterSpacing: '0.32em', textTransform: 'uppercase',
    background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
    padding: '9px 16px', transition: 'all 200ms ease',
  },
  // Code modal
  modalBackdrop: {
    position: 'fixed', inset: 0, zIndex: 300,
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: 'rgba(10,10,12,0.9)', backdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.07)',
    padding: '48px 40px', width: '320px', textAlign: 'center',
  },
  modalTitle: {
    fontFamily: "'Inter', sans-serif", fontSize: '10px', fontWeight: '300',
    letterSpacing: '0.42em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)', display: 'block', marginBottom: '8px',
  },
  modalSub: {
    fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: '300',
    color: 'rgba(255,255,255,0.25)', marginBottom: '32px', lineHeight: 1.6,
  },
  codeInput: (focused) => ({
    width: '100%', background: 'transparent',
    border: 'none', borderBottom: `1px solid ${focused ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
    outline: 'none', padding: '10px 0',
    fontFamily: "'Inter', sans-serif", fontSize: '22px', fontWeight: '200',
    letterSpacing: '0.5em', textAlign: 'center', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.85)', caretColor: 'rgba(255,255,255,0.5)',
    transition: 'border-color 200ms ease', marginBottom: '28px',
  }),
  modalBtn: (loading) => ({
    width: '100%', padding: '12px 0',
    fontFamily: "'Inter', sans-serif", fontSize: '9px', fontWeight: '300',
    letterSpacing: '0.38em', textTransform: 'uppercase',
    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
    color: loading ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.65)',
    cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 180ms ease',
    marginBottom: '14px',
  }),
  modalSkip: {
    fontFamily: "'Inter', sans-serif", fontSize: '8px', fontWeight: '300',
    letterSpacing: '0.28em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.18)', background: 'none', border: 'none',
    cursor: 'pointer', width: '100%',
  },
  modalError: {
    fontFamily: "'Inter', sans-serif", fontSize: '10px',
    color: 'rgba(196,98,45,0.85)', marginBottom: '16px',
  },
};

// ─────────────────────────────────────────────────────────────
//  Property Code Modal
// ─────────────────────────────────────────────────────────────

const CodeModal = ({ onSuccess, onSkip, token }) => {
  const [code,    setCode]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [focused, setFocused] = useState(false);

  const handleSubmit = async () => {
    const clean = code.trim().toUpperCase();
    if (clean.length !== 4) { setError('Code must be exactly 4 characters.'); return; }
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/properties/sync-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ propertyCode: clean }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message ?? 'Invalid code.'); return; }
      onSuccess(data.property);
    } catch { setError('Network error. Please retry.'); }
    finally  { setLoading(false); }
  };

  return (
    <motion.div style={T.modalBackdrop}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div style={T.modal}
        initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
        <span style={T.modalTitle}>Network Not Recognised</span>
        <p style={T.modalSub}>
          Your IP doesn't match any registered property.<br />
          Enter your 4-character property code.
        </p>
        <input
          maxLength={4} value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="AB3X" style={T.codeInput(focused)} autoFocus
        />
        {error && <p style={T.modalError}>{error}</p>}
        <button style={T.modalBtn(loading)} onClick={handleSubmit} disabled={loading}>
          {loading ? 'Searching…' : 'Find Property →'}
        </button>
        <button style={T.modalSkip} onClick={onSkip}>
          Skip — Browse without sync
        </button>
      </motion.div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────
//  Dashboard Page
// ─────────────────────────────────────────────────────────────

const Dashboard = () => {
  const { user, token, role, logout } = useAuth();
  const navigate = useNavigate();

  const [property,       setProperty]       = useState(null);
  const [syncStatus,     setSyncStatus]     = useState('idle');  // idle | syncing | synced | failed
  const [showCodeModal,  setShowCodeModal]  = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState(null);
  const [isPanelOpen,    setIsPanelOpen]    = useState(false);
  const [isExploded,     setIsExploded]     = useState(false);

  // ── Socket connection (fires after property is resolved) ──
  const { isConnected, emitAttendance } = usePropertySocket({
    serverUrl:  window.location.origin,
    token:      token ? `${user?.id}:${role}:${property?._id ?? ''}` : null,
    propertyId: property?._id ?? null,
    autoConnect: !!property,
    onTicketNew: (data) => {
      console.log('[socket] ticket:new', data);
      // TODO: show toast notification
    },
    onAttendanceUpdated: (data) => {
      console.log('[socket] attendance:updated', data);
    },
  });

  // ── Auto IP-sync on mount ──────────────────────────────────
  useEffect(() => {
    if (!token) return;
    setSyncStatus('syncing');

    fetch('/api/properties/sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setProperty(data.property);
          setSyncStatus('synced');
        } else {
          setSyncStatus('failed');
          setShowCodeModal(true);
        }
      })
      .catch(() => {
        setSyncStatus('failed');
        setShowCodeModal(true);
      });
  }, [token]);

  // ── Handlers ──────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const handlePropertySelect = useCallback((buildingId) => {
    setSelectedBuildingId(buildingId);
    setIsPanelOpen(!!buildingId);
    if (!buildingId) setIsExploded(false);
  }, []);

  const handleCodeSuccess = useCallback((prop) => {
    setProperty(prop);
    setSyncStatus('synced');
    setShowCodeModal(false);
  }, []);

  const handleSkipCode = useCallback(() => {
    setSyncStatus('idle');
    setShowCodeModal(false);
  }, []);

  const isSynced = syncStatus === 'synced';

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#0A0A0A' }}>

      {/* ── Keyframes for sync dot pulse ── */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50%       { opacity: 0.8; transform: scale(1.4); }
        }
      `}</style>

      {/* ── Top-left HUD ─────────────────────────────────── */}
      <div style={T.hud}>
        <span style={T.hudName}>{user?.fullName ?? 'Guest'}</span>
        <span style={T.hudRole}>{role}</span>
        <button
          style={T.hudBtn}
          onClick={handleLogout}
          onMouseEnter={(e) => e.target.style.color = 'rgba(255,255,255,0.55)'}
          onMouseLeave={(e) => e.target.style.color = 'rgba(255,255,255,0.22)'}
        >
          Sign out
        </button>
      </div>

      {/* ── Top-right Sync indicator ─────────────────────── */}
      <div
        style={T.syncBadge(isSynced)}
        onClick={!isSynced ? () => setShowCodeModal(true) : undefined}
        title={isSynced ? `Synced: ${property?.propertyName}` : 'Click to enter property code'}
      >
        <div style={T.dot(isSynced)} />
        {isSynced
          ? (property?.propertyName ?? 'Synced')
          : syncStatus === 'syncing' ? 'Syncing…' : 'Enter Code'}
      </div>

      {/* ── Explode toggle (only when property synced + building selected) ── */}
      <AnimatePresence>
        {selectedBuildingId && (
          <motion.button
            style={T.explodeBtn}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.25 }}
            onClick={() => setIsExploded((v) => !v)}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.75)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
            }}
          >
            {isExploded ? 'Collapse' : 'Explode'}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── 3D Canvas (full viewport) ─────────────────────── */}
      <ThreePropertyCanvas
        onPropertySelect={handlePropertySelect}
        theme="dark"
      />

      {/* ── Context overlay panel ─────────────────────────── */}
      <ContextOverlayPanel
        isOpen={isPanelOpen}
        onClose={() => { setIsPanelOpen(false); setSelectedBuildingId(null); setIsExploded(false); }}
        role={role}
        property={property}
        unit={null}
        tenantId={user?.id ?? null}
        token={token}
        emitAttendance={emitAttendance}
      />

      {/* ── Property code modal ───────────────────────────── */}
      <AnimatePresence>
        {showCodeModal && (
          <CodeModal
            token={token}
            onSuccess={handleCodeSuccess}
            onSkip={handleSkipCode}
          />
        )}
      </AnimatePresence>

    </div>
  );
};

export default Dashboard;
