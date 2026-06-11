/**
 * @file Register.jsx
 * @description Mr. Heckles account creation page.
 * Same hyper-minimalist design system as Login.
 */

import React, { useState, useCallback } from 'react';
import { useNavigate, Link }            from 'react-router-dom';
import { motion }                        from 'framer-motion';
import { useAuth }                       from '../context/AuthContext.jsx';

const S = {
  page: {
    width: '100%', height: '100%',
    background: '#0A0A0A',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden',
  },
  glow: {
    position: 'absolute', width: '480px', height: '480px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255,255,255,0.022) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  card: { width: '100%', maxWidth: '360px', padding: '0 24px', position: 'relative', zIndex: 1 },
  wordmark: {
    fontFamily: "'Inter', sans-serif", fontSize: '10px', fontWeight: '300',
    letterSpacing: '0.55em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.28)', textAlign: 'center', display: 'block', marginBottom: '48px',
  },
  heading: {
    fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: '300',
    letterSpacing: '0.42em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)', textAlign: 'center', display: 'block', marginBottom: '40px',
  },
  fieldWrap: { marginBottom: '26px' },
  label: {
    fontFamily: "'Inter', sans-serif", fontSize: '8px', fontWeight: '400',
    letterSpacing: '0.36em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.25)', display: 'block', marginBottom: '10px',
  },
  input: (focused) => ({
    width: '100%', background: 'transparent',
    border: 'none', borderBottom: `1px solid ${focused ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
    outline: 'none', padding: '8px 0',
    fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: '300',
    color: 'rgba(255,255,255,0.85)', letterSpacing: '0.02em',
    transition: 'border-color 200ms ease', caretColor: 'rgba(255,255,255,0.6)',
  }),
  roleWrap: { display: 'flex', gap: '10px', marginBottom: '34px' },
  roleBtn: (active) => ({
    flex: 1, padding: '10px 0',
    fontFamily: "'Inter', sans-serif", fontSize: '9px', fontWeight: '300',
    letterSpacing: '0.36em', textTransform: 'uppercase',
    background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
    border: `1px solid ${active ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)'}`,
    color: active ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)',
    cursor: 'pointer', transition: 'all 200ms ease',
  }),
  submit: (loading) => ({
    width: '100%', padding: '13px 0',
    fontFamily: "'Inter', sans-serif", fontSize: '9px', fontWeight: '300',
    letterSpacing: '0.42em', textTransform: 'uppercase',
    background: 'transparent',
    border: `1px solid ${loading ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.18)'}`,
    color: loading ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)',
    cursor: loading ? 'not-allowed' : 'pointer',
    transition: 'all 220ms ease', marginBottom: '24px',
  }),
  error:   { fontFamily: "'Inter', sans-serif", fontSize: '10px', color: 'rgba(196, 98, 45, 0.9)', textAlign: 'center', marginBottom: '18px', letterSpacing: '0.02em' },
  footer:  { fontFamily: "'Inter', sans-serif", fontSize: '9px', fontWeight: '300', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', textAlign: 'center' },
  footerLink: { color: 'rgba(255,255,255,0.42)', textDecoration: 'none' },
};

const Field = ({ label, type = 'text', value, onChange, placeholder, index, autoComplete }) => {
  const [focused, setFocused] = useState(false);
  return (
    <motion.div
      style={S.fieldWrap}
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.065, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <span style={S.label}>{label}</span>
      <input
        type={type} value={value} onChange={onChange} placeholder={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={S.input(focused)} autoComplete={autoComplete}
      />
    </motion.div>
  );
};

const Register = () => {
  const { login }  = useAuth();
  const navigate   = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [role,     setRole]     = useState('tenant');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password) {
      setError('Please fill in all fields.'); return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.'); return;
    }
    setLoading(true);
    setError('');

    try {
      const res  = await fetch('/api/auth/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          fullName: fullName.trim(),
          email:    email.trim(),
          password,
          role,
        }),
      });
      const data = await res.json();

      if (!res.ok) { setError(data.message ?? 'Registration failed.'); return; }

      login(data.token, data.user);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [fullName, email, password, role, login, navigate]);

  return (
    <div style={S.page}>
      <div style={S.glow} />

      <form style={S.card} onSubmit={handleSubmit} noValidate>
        <motion.span style={S.wordmark}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>
          Mr. Heckles
        </motion.span>

        <motion.span style={S.heading}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1, duration: 0.6 }}>
          Create Account
        </motion.span>

        <Field label="Full Name"  value={fullName}  onChange={(e) => setFullName(e.target.value)}
          placeholder="Your name" index={1} autoComplete="name" />

        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com" index={2} autoComplete="email" />

        <Field label="Password" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters"
          index={3} autoComplete="new-password" />

        {/* Role selector */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26, duration: 0.45 }}>
          <span style={{ ...S.label, marginBottom: '12px' }}>I am a</span>
          <div style={S.roleWrap}>
            {['tenant', 'landlord'].map((r) => (
              <button key={r} type="button"
                style={S.roleBtn(role === r)}
                onClick={() => setRole(r)}>
                {r}
              </button>
            ))}
          </div>
        </motion.div>

        {error && (
          <motion.p style={S.error} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {error}
          </motion.p>
        )}

        <motion.button type="submit" disabled={loading}
          style={S.submit(loading)}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34, duration: 0.45 }}
          whileHover={!loading ? { borderColor: 'rgba(255,255,255,0.35)', color: 'rgba(255,255,255,0.9)' } : {}}>
          {loading ? 'Creating account…' : 'Create Account →'}
        </motion.button>

        <motion.p style={S.footer}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.42, duration: 0.5 }}>
          Have an account?{' '}
          <Link to="/login" style={S.footerLink}>Sign in</Link>
        </motion.p>
      </form>
    </div>
  );
};

export default Register;
