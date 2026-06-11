/**
 * @file ContextOverlayPanel.jsx
 * @description Mr. Heckles — Contextual slide-in overlay panel.
 *
 * Renders a glassmorphic right-hand drawer that appears when a property
 * room/unit is selected. Presents two persona-specific views:
 *
 *   LANDLORD — Base Rent config, Utility sub-meter variables, Maintenance alerts
 *   TENANT   — Student profile fields, Co-resident links, Daily checklist toggles
 *
 * Animation: Framer Motion spring (stiffness: 300, damping: 30) slide from right.
 * Styling:   Inline CSS — backdrop-blur glassmorphism, borderless fields,
 *            razor-thin focus underlines, Inter typography.
 *
 * REST Integration: All form actions dispatch to the Phase 2 backend APIs.
 *
 * Dependencies: framer-motion, socket.io-client (via usePropertySocket hook)
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─────────────────────────────────────────────────────────────
//  REST API Dispatcher Utility
// ─────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env?.VITE_API_URL ?? 'http://localhost:5000';

const api = {
  post: async (path, body, token) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
    return data;
  },
  patch: async (path, body, token) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method:  'PATCH',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
    return data;
  },
};

// ─────────────────────────────────────────────────────────────
//  Animation Variants
// ─────────────────────────────────────────────────────────────

const PANEL_VARIANTS = {
  hidden:  { x: '100%', opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 30 },
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
  },
};

const CHILD_VARIANTS = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.055, duration: 0.38, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

// ─────────────────────────────────────────────────────────────
//  Design Tokens (inline — no Tailwind needed)
// ─────────────────────────────────────────────────────────────

const T = {
  panel: {
    background:     'rgba(8, 8, 10, 0.72)',
    backdropFilter: 'blur(28px) saturate(160%)',
    borderLeft:     '1px solid rgba(255, 255, 255, 0.055)',
    width:          '360px',
    height:         '100vh',
    position:       'fixed',
    top:            0,
    right:          0,
    zIndex:         200,
    overflowY:      'auto',
    overflowX:      'hidden',
    display:        'flex',
    flexDirection:  'column',
    padding:        '0',
  },
  label: {
    fontFamily:    "'Inter', 'Helvetica Neue', sans-serif",
    fontSize:      '9px',
    fontWeight:    '400',
    letterSpacing: '0.38em',
    color:         'rgba(255,255,255,0.32)',
    textTransform: 'uppercase',
    display:       'block',
    marginBottom:  '8px',
  },
  input: {
    fontFamily:      "'Inter', 'Helvetica Neue', sans-serif",
    fontSize:        '13px',
    fontWeight:      '300',
    color:           'rgba(255,255,255,0.88)',
    background:      'transparent',
    border:          'none',
    borderBottom:    '1px solid rgba(255,255,255,0.08)',
    outline:         'none',
    width:           '100%',
    padding:         '8px 0',
    letterSpacing:   '0.02em',
    transition:      'border-color 200ms ease',
  },
  textarea: {
    fontFamily:      "'Inter', 'Helvetica Neue', sans-serif",
    fontSize:        '12px',
    fontWeight:      '300',
    color:           'rgba(255,255,255,0.8)',
    background:      'rgba(255,255,255,0.03)',
    border:          '1px solid rgba(255,255,255,0.06)',
    outline:         'none',
    width:           '100%',
    padding:         '10px 12px',
    resize:          'none',
    letterSpacing:   '0.01em',
    lineHeight:      '1.6',
    borderRadius:    '2px',
    transition:      'border-color 200ms ease',
  },
  sectionTitle: {
    fontFamily:    "'Inter', 'Helvetica Neue', sans-serif",
    fontSize:      '10px',
    fontWeight:    '400',
    letterSpacing: '0.32em',
    color:         'rgba(255,255,255,0.25)',
    textTransform: 'uppercase',
    marginBottom:  '20px',
    paddingBottom: '10px',
    borderBottom:  '1px solid rgba(255,255,255,0.055)',
    display:       'block',
  },
  btn: {
    fontFamily:     "'Inter', 'Helvetica Neue', sans-serif",
    fontSize:       '9px',
    fontWeight:     '400',
    letterSpacing:  '0.38em',
    textTransform:  'uppercase',
    background:     'transparent',
    border:         '1px solid rgba(255,255,255,0.15)',
    color:          'rgba(255,255,255,0.6)',
    padding:        '10px 20px',
    cursor:         'pointer',
    width:          '100%',
    transition:     'all 180ms ease',
  },
  btnPrimary: {
    fontFamily:     "'Inter', 'Helvetica Neue', sans-serif",
    fontSize:       '9px',
    fontWeight:     '400',
    letterSpacing:  '0.38em',
    textTransform:  'uppercase',
    background:     'rgba(255,255,255,0.06)',
    border:         '1px solid rgba(255,255,255,0.18)',
    color:          'rgba(255,255,255,0.85)',
    padding:        '11px 20px',
    cursor:         'pointer',
    width:          '100%',
    transition:     'all 180ms ease',
  },
};

// ─────────────────────────────────────────────────────────────
//  Micro-components
// ─────────────────────────────────────────────────────────────

const Field = ({ label, children, index = 0 }) => (
  <motion.div
    custom={index}
    variants={CHILD_VARIANTS}
    style={{ marginBottom: '24px' }}
  >
    <span style={T.label}>{label}</span>
    {children}
  </motion.div>
);

const GlassInput = ({ value, onChange, placeholder = '', type = 'text', ...rest }) => {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...T.input,
        borderBottomColor: focused
          ? 'rgba(255,255,255,0.42)'
          : 'rgba(255,255,255,0.08)',
        caretColor: 'rgba(255,255,255,0.6)',
      }}
      {...rest}
    />
  );
};

const GlassTextarea = ({ value, onChange, placeholder = '', rows = 3 }) => {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...T.textarea,
        borderColor: focused
          ? 'rgba(255,255,255,0.18)'
          : 'rgba(255,255,255,0.06)',
      }}
    />
  );
};

const GlassSelect = ({ value, onChange, options = [] }) => {
  const [focused, setFocused] = useState(false);
  return (
    <select
      value={value}
      onChange={onChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...T.input,
        borderBottomColor: focused ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.08)',
        appearance: 'none',
        cursor: 'pointer',
        backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'rgba(255,255,255,0.25)\'/%3E%3C/svg%3E")',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 4px center',
        paddingRight: '20px',
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} style={{ background: '#111' }}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};

const Toggle = ({ checked, onChange, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
    <span style={{
      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
      fontSize: '12px',
      fontWeight: '300',
      color: 'rgba(255,255,255,0.65)',
      letterSpacing: '0.02em',
    }}>{label}</span>
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: '36px',
        height: '20px',
        borderRadius: '10px',
        border: `1px solid ${checked ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)'}`,
        background: checked ? 'rgba(255,255,255,0.15)' : 'transparent',
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 200ms ease',
        flexShrink: 0,
        padding: 0,
      }}
    >
      <div style={{
        position: 'absolute',
        top: '2px',
        left: checked ? '17px' : '2px',
        width: '14px',
        height: '14px',
        borderRadius: '50%',
        background: checked ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.28)',
        transition: 'all 220ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      }} />
    </button>
  </div>
);

const StatusPill = ({ status }) => {
  const colors = {
    open:        { bg: 'rgba(196, 98, 45, 0.2)',  text: '#C4622D', border: 'rgba(196, 98, 45, 0.35)' },
    in_progress: { bg: 'rgba(212, 165, 116, 0.2)', text: '#D4A574', border: 'rgba(212, 165, 116, 0.35)' },
    resolved:    { bg: 'rgba(80, 160, 100, 0.2)',  text: '#50A064', border: 'rgba(80, 160, 100, 0.35)' },
  };
  const c = colors[status] ?? colors.open;
  return (
    <span style={{
      fontSize: '8px',
      fontFamily: "'Inter', sans-serif",
      letterSpacing: '0.25em',
      textTransform: 'uppercase',
      background: c.bg,
      color: c.text,
      border: `1px solid ${c.border}`,
      padding: '3px 8px',
      borderRadius: '1px',
    }}>{status.replace('_', ' ')}</span>
  );
};

const FeedbackLine = ({ message, type = 'error' }) => {
  if (!message) return null;
  const color = type === 'error' ? 'rgba(196, 98, 45, 0.85)' : 'rgba(80, 160, 100, 0.85)';
  return (
    <p style={{
      fontFamily: "'Inter', sans-serif",
      fontSize: '10px',
      color,
      margin: '8px 0 0',
      letterSpacing: '0.02em',
    }}>{message}</p>
  );
};

// ─────────────────────────────────────────────────────────────
//  Persona View — LANDLORD
// ─────────────────────────────────────────────────────────────

const LandlordView = ({ property, unit, token }) => {
  const [rent,      setRent]      = useState(property?.baseRent ?? '');
  const [deposit,   setDeposit]   = useState(property?.securityDeposit ?? '');
  const [dueDay,    setDueDay]    = useState(property?.rentDueDay ?? '1');
  const [elecRate,  setElecRate]  = useState(property?.utilities?.electricityRate ?? '');
  const [waterRate, setWaterRate] = useState(property?.utilities?.waterRate ?? '');
  const [gasPresent,setGasPresent]= useState(property?.utilities?.gasPresent ?? false);
  const [tickets,   setTickets]   = useState(unit?.maintenanceAlerts ?? []);
  const [saving,    setSaving]    = useState(false);
  const [feedback,  setFeedback]  = useState(null);

  const handleSaveConfig = useCallback(async () => {
    if (!property?._id) return;
    setSaving(true);
    setFeedback(null);
    try {
      await api.patch(`/api/properties/${property._id}/config`, {
        baseRent: Number(rent),
        securityDeposit: Number(deposit),
        rentDueDay: Number(dueDay),
        utilities: {
          electricityRate: Number(elecRate),
          waterRate:       Number(waterRate),
          gasPresent,
        },
      }, token);
      setFeedback({ type: 'success', message: 'Configuration saved.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  }, [property, rent, deposit, dueDay, elecRate, waterRate, gasPresent, token]);

  const handleResolveTicket = useCallback(async (ticketId) => {
    try {
      await api.patch(`/api/tickets/${ticketId}/resolve`, { status: 'resolved' }, token);
      setTickets((prev) => prev.map((t) => t._id === ticketId ? { ...t, status: 'resolved' } : t));
    } catch (err) {
      console.error('Resolve ticket error:', err);
    }
  }, [token]);

  return (
    <motion.div
      variants={{ visible: { transition: { staggerChildren: 0.055 } } }}
      initial="hidden"
      animate="visible"
    >
      {/* ── Base Rent ─────────────────────────────────── */}
      <motion.span style={T.sectionTitle} custom={0} variants={CHILD_VARIANTS}>
        Financial Parameters
      </motion.span>

      <Field label="Monthly Rent (₹)" index={1}>
        <GlassInput value={rent} onChange={(e) => setRent(e.target.value)} type="number" placeholder="0" />
      </Field>

      <Field label="Security Deposit (₹)" index={2}>
        <GlassInput value={deposit} onChange={(e) => setDeposit(e.target.value)} type="number" placeholder="0" />
      </Field>

      <Field label="Rent Due — Day of Month" index={3}>
        <GlassInput
          value={dueDay}
          onChange={(e) => setDueDay(e.target.value)}
          type="number"
          placeholder="1"
          min="1" max="28"
        />
      </Field>

      {/* ── Utility Sub-meters ────────────────────────── */}
      <motion.span style={{ ...T.sectionTitle, marginTop: '8px' }} custom={4} variants={CHILD_VARIANTS}>
        Utility Sub-meters
      </motion.span>

      <Field label="Electricity — ₹ / Unit (kWh)" index={5}>
        <GlassInput value={elecRate} onChange={(e) => setElecRate(e.target.value)} type="number" placeholder="0.00" />
      </Field>

      <Field label="Water — ₹ / Month (Flat)" index={6}>
        <GlassInput value={waterRate} onChange={(e) => setWaterRate(e.target.value)} type="number" placeholder="0.00" />
      </Field>

      <motion.div custom={7} variants={CHILD_VARIANTS} style={{ marginBottom: '24px' }}>
        <Toggle checked={gasPresent} onChange={setGasPresent} label="Gas Sub-meter Present" />
      </motion.div>

      <motion.div custom={8} variants={CHILD_VARIANTS} style={{ marginBottom: '32px' }}>
        <button
          style={saving ? { ...T.btnPrimary, opacity: 0.5 } : T.btnPrimary}
          onClick={handleSaveConfig}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Configuration'}
        </button>
        {feedback && <FeedbackLine message={feedback.message} type={feedback.type} />}
      </motion.div>

      {/* ── Maintenance Alerts ───────────────────────── */}
      {tickets.length > 0 && (
        <>
          <motion.span style={T.sectionTitle} custom={9} variants={CHILD_VARIANTS}>
            Maintenance Alerts
          </motion.span>
          {tickets.map((ticket, i) => (
            <motion.div
              key={ticket._id}
              custom={10 + i}
              variants={CHILD_VARIANTS}
              style={{
                borderBottom: '1px solid rgba(255,255,255,0.045)',
                paddingBottom: '14px',
                marginBottom: '14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <span style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '11px',
                  color: 'rgba(255,255,255,0.75)',
                  fontWeight: '300',
                  maxWidth: '200px',
                  lineHeight: 1.5,
                }}>
                  {ticket.issueDescription}
                </span>
                <StatusPill status={ticket.status} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '9px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.15em' }}>
                  RM {ticket.roomNumber}
                </span>
                {ticket.status !== 'resolved' && (
                  <button
                    onClick={() => handleResolveTicket(ticket._id)}
                    style={{
                      ...T.btn,
                      width: 'auto',
                      padding: '5px 12px',
                      fontSize: '8px',
                    }}
                  >
                    Resolve
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </>
      )}
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────
//  Persona View — TENANT
// ─────────────────────────────────────────────────────────────

const TenantView = ({ unit, tenantId, propertyId, token, emitAttendance }) => {
  const today = new Date().toISOString().split('T')[0];

  const [status,     setStatus]     = useState('student');
  const [institution,setInstitution]= useState('');
  const [bio,        setBio]        = useState('');
  const [coResidents,setCoResidents]= useState([]);
  const [newCoRes,   setNewCoRes]   = useState('');
  const [cleaning,   setCleaning]   = useState(false);
  const [cooking,    setCooking]    = useState(false);
  const [logSaving,  setLogSaving]  = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [feedback,   setFeedback]   = useState(null);

  // Save tenant profile
  const handleSaveProfile = useCallback(async () => {
    if (!tenantId) return;
    setProfileSaving(true);
    setFeedback(null);
    try {
      await api.patch(`/api/users/${tenantId}/details`, {
        details: { status, institutionOrCompany: institution, bio },
      }, token);
      setFeedback({ type: 'success', message: 'Profile updated.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setProfileSaving(false);
    }
  }, [tenantId, status, institution, bio, token]);

  // Add co-resident link (appends userId to coResidents list)
  const handleAddCoResident = useCallback(() => {
    const trimmed = newCoRes.trim();
    if (!trimmed || coResidents.includes(trimmed)) return;
    setCoResidents((prev) => [...prev, trimmed]);
    setNewCoRes('');
  }, [newCoRes, coResidents]);

  const handleRemoveCoResident = useCallback((id) => {
    setCoResidents((prev) => prev.filter((r) => r !== id));
  }, []);

  // Log daily attendance via socket or REST fallback
  const handleLogAttendance = useCallback(async () => {
    if (!cleaning && !cooking) return;
    setLogSaving(true);
    setFeedback(null);
    try {
      const tasks = [
        ...(cleaning ? ['cleaning'] : []),
        ...(cooking  ? ['cooking']  : []),
      ];
      await Promise.all(
        tasks.map((category) =>
          emitAttendance
            ? emitAttendance({ propertyId, date: today, houseHelpCategory: category })
            : api.post('/api/attendance/log', { propertyId, date: today, houseHelpCategory: category }, token)
        )
      );
      setFeedback({ type: 'success', message: 'Attendance logged for today.' });
      setCleaning(false);
      setCooking(false);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLogSaving(false);
    }
  }, [cleaning, cooking, propertyId, today, token, emitAttendance]);

  return (
    <motion.div
      variants={{ visible: { transition: { staggerChildren: 0.055 } } }}
      initial="hidden"
      animate="visible"
    >
      {/* ── Student Profile ───────────────────────────── */}
      <motion.span style={T.sectionTitle} custom={0} variants={CHILD_VARIANTS}>
        Profile Details
      </motion.span>

      <Field label="Occupancy Status" index={1}>
        <GlassSelect
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: 'student',  label: 'Student'  },
            { value: 'bachelor', label: 'Bachelor' },
            { value: 'employed', label: 'Employed' },
          ]}
        />
      </Field>

      <Field label="Institution / Company" index={2}>
        <GlassInput
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          placeholder="e.g. IIT Bombay"
        />
      </Field>

      <Field label="About" index={3}>
        <GlassTextarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Brief description…"
          rows={3}
        />
      </Field>

      <motion.div custom={4} variants={CHILD_VARIANTS} style={{ marginBottom: '32px' }}>
        <button
          style={profileSaving ? { ...T.btnPrimary, opacity: 0.5 } : T.btnPrimary}
          onClick={handleSaveProfile}
          disabled={profileSaving}
        >
          {profileSaving ? 'Saving…' : 'Update Profile'}
        </button>
        {feedback?.type !== 'success' && <FeedbackLine message={feedback?.message} type={feedback?.type} />}
      </motion.div>

      {/* ── Co-Residents ──────────────────────────────── */}
      <motion.span style={T.sectionTitle} custom={5} variants={CHILD_VARIANTS}>
        Co-Residents
      </motion.span>

      {coResidents.map((id, i) => (
        <motion.div
          key={id}
          custom={6 + i}
          variants={CHILD_VARIANTS}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            paddingBottom: '10px',
            marginBottom: '10px',
          }}
        >
          <span style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '11px',
            color: 'rgba(255,255,255,0.55)',
            fontWeight: '300',
            letterSpacing: '0.04em',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {id.length > 20 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id}
          </span>
          <button
            onClick={() => handleRemoveCoResident(id)}
            style={{ ...T.btn, width: 'auto', padding: '4px 10px', fontSize: '8px' }}
          >
            Remove
          </button>
        </motion.div>
      ))}

      <motion.div custom={9} variants={CHILD_VARIANTS} style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
        <GlassInput
          value={newCoRes}
          onChange={(e) => setNewCoRes(e.target.value)}
          placeholder="Paste user ID"
          onKeyDown={(e) => e.key === 'Enter' && handleAddCoResident()}
        />
        <button
          onClick={handleAddCoResident}
          style={{ ...T.btn, width: 'auto', padding: '0 16px', whiteSpace: 'nowrap' }}
        >
          Link
        </button>
      </motion.div>

      {/* ── Daily Checklist ───────────────────────────── */}
      <motion.span style={T.sectionTitle} custom={10} variants={CHILD_VARIANTS}>
        Daily Checklist — {today}
      </motion.span>

      <motion.div custom={11} variants={CHILD_VARIANTS} style={{ marginBottom: '8px' }}>
        <Toggle checked={cleaning} onChange={setCleaning} label="Cleaning Fulfilled" />
        <Toggle checked={cooking}  onChange={setCooking}  label="Cooking Fulfilled"  />
      </motion.div>

      <motion.div custom={12} variants={CHILD_VARIANTS} style={{ marginBottom: '16px' }}>
        <button
          style={logSaving || (!cleaning && !cooking) ? { ...T.btnPrimary, opacity: 0.4 } : T.btnPrimary}
          onClick={handleLogAttendance}
          disabled={logSaving || (!cleaning && !cooking)}
        >
          {logSaving ? 'Logging…' : 'Submit Attendance'}
        </button>
        {feedback && <FeedbackLine message={feedback.message} type={feedback.type} />}
      </motion.div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────
//  Root Export: ContextOverlayPanel
// ─────────────────────────────────────────────────────────────

/**
 * ContextOverlayPanel
 *
 * Props:
 *   isOpen        {boolean}   — Controls visibility / animation state
 *   onClose       {Function}  — Called when panel requests dismissal
 *   role          {'landlord'|'tenant'}
 *   property      {Object}    — Property document from DB
 *   unit          {Object}    — Selected unit from property.unitsLayout
 *   tenantId      {string}    — Current user ID (tenant persona)
 *   token         {string}    — JWT auth token for REST calls
 *   emitAttendance {Function} — From usePropertySocket (optional, falls back to REST)
 */
const ContextOverlayPanel = ({
  isOpen,
  onClose,
  role         = 'tenant',
  property     = null,
  unit         = null,
  tenantId     = null,
  token        = '',
  emitAttendance,
}) => {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const unitLabel = unit
    ? `${unit.unitType?.toUpperCase?.() ?? 'UNIT'} · RM ${unit.roomNumber}`
    : 'No Unit Selected';

  return (
    <>
      {/* Backdrop — transparent click-away zone */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 199,
              background: 'rgba(0,0,0,0.18)',
              backdropFilter: 'blur(2px)',
            }}
          />
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="panel"
            variants={PANEL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={T.panel}
          >
            {/* ── Header ────────────────────────────────── */}
            <div style={{
              padding: '28px 28px 0',
              borderBottom: '1px solid rgba(255,255,255,0.048)',
              marginBottom: '28px',
              paddingBottom: '20px',
            }}>
              {/* Role badge + close */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '8px',
                  letterSpacing: '0.45em',
                  textTransform: 'uppercase',
                  color: role === 'landlord' ? 'rgba(212, 165, 116, 0.7)' : 'rgba(180, 200, 220, 0.7)',
                  fontWeight: '400',
                }}>
                  {role === 'landlord' ? '◆ Landlord' : '○ Tenant'}
                </span>
                <button
                  onClick={onClose}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.3)',
                    cursor: 'pointer',
                    fontSize: '18px',
                    fontWeight: '200',
                    lineHeight: 1,
                    padding: '0',
                    transition: 'color 150ms ease',
                  }}
                  onMouseEnter={(e) => e.target.style.color = 'rgba(255,255,255,0.75)'}
                  onMouseLeave={(e) => e.target.style.color = 'rgba(255,255,255,0.3)'}
                  aria-label="Close panel"
                >
                  ×
                </button>
              </div>

              {/* Property name */}
              <h2 style={{
                fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
                fontSize: '15px',
                fontWeight: '300',
                letterSpacing: '0.06em',
                color: 'rgba(255,255,255,0.88)',
                margin: '0 0 4px',
              }}>
                {property?.propertyName ?? 'Property'}
              </h2>

              {/* Unit identifier */}
              <p style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '10px',
                letterSpacing: '0.22em',
                color: 'rgba(255,255,255,0.3)',
                margin: 0,
                textTransform: 'uppercase',
              }}>
                {unitLabel}
              </p>
            </div>

            {/* ── Scrollable Body ───────────────────────── */}
            <div style={{ flex: 1, padding: '0 28px 40px', overflowY: 'auto' }}>
              {/* Google Fonts import */}
              <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400&display=swap'); ::placeholder { color: rgba(255,255,255,0.18); } select option { background: #111; }`}</style>

              {role === 'landlord' ? (
                <LandlordView property={property} unit={unit} token={token} />
              ) : (
                <TenantView
                  unit={unit}
                  tenantId={tenantId}
                  propertyId={property?._id}
                  token={token}
                  emitAttendance={emitAttendance}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ContextOverlayPanel;
