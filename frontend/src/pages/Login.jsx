import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      background: 'linear-gradient(135deg, #0f2942 0%, #1F4E79 50%, #163a5e 100%)',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>

      {/* ── left panel ── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 5%',
      }}>
        {/* logo */}
        <Link to="/" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          textDecoration: 'none', marginBottom: 48,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'linear-gradient(135deg,#2E74B5,#4CAF50)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#fff',
          }}>D</div>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-.02em' }}>DSVP</span>
        </Link>

        {/* card */}
        <div style={{
          width: '100%', maxWidth: 420,
          background: '#fff', borderRadius: 20,
          padding: '40px 40px',
          boxShadow: '0 24px 60px rgba(0,0,0,.25)',
        }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 28 }}>
            Log in to continue your learning journey.
          </p>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 10, padding: '12px 14px',
              marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>⚠</span>
              <span style={{ fontSize: 13, color: '#dc2626' }}>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <Field label="Email address">
              <input
                type="email" value={email} required
                placeholder="you@example.com"
                onChange={e => setEmail(e.target.value)}
                style={inputStyle}
                onFocus={focusStyle} onBlur={blurStyle}
              />
            </Field>

            <Field label="Password">
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'} value={password} required
                  placeholder="••••••••"
                  onChange={e => setPassword(e.target.value)}
                  style={{ ...inputStyle, paddingRight: 44 }}
                  onFocus={focusStyle} onBlur={blurStyle}
                />
                <button type="button" onClick={() => setShowPw(p => !p)} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 16, color: '#94a3b8', lineHeight: 1,
                }}>{showPw ? '🙈' : '👁'}</button>
              </div>
            </Field>

            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 10,
                fontSize: 15, fontWeight: 700, color: '#fff', border: 'none',
                background: loading
                  ? '#93c5fd'
                  : 'linear-gradient(135deg,#2E74B5,#1F4E79)',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 14px rgba(46,116,181,.4)',
                transition: 'all 150ms', marginTop: 8,
              }}
            >
              {loading ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 22, fontSize: 13, color: '#64748b' }}>
            No account?{' '}
            <Link to="/register" style={{ color: '#2E74B5', fontWeight: 600 }}>
              Create one free
            </Link>
          </p>
        </div>

        <Link to="/" style={{ marginTop: 24, fontSize: 13, color: 'rgba(255,255,255,.5)', textDecoration: 'none' }}>
          ← Back to home
        </Link>
      </div>

      {/* ── right decorative panel (hidden on small screens) ── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '40px 5%',
        maxWidth: 520,
      }}>
        <RightPanel />
      </div>
    </div>
  );
}

/* ── shared helpers ── */
const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '1.5px solid #e2e8f0', outline: 'none',
  fontSize: 14, color: '#1e293b',
  background: '#f8fafc', transition: 'border-color 150ms, box-shadow 150ms',
  boxSizing: 'border-box',
};
function focusStyle(e) {
  e.target.style.borderColor = '#2E74B5';
  e.target.style.boxShadow   = '0 0 0 3px rgba(46,116,181,.12)';
  e.target.style.background  = '#fff';
}
function blurStyle(e) {
  e.target.style.borderColor = '#e2e8f0';
  e.target.style.boxShadow   = 'none';
  e.target.style.background  = '#f8fafc';
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

/* ── decorative right panel ── */
const bullets = [
  { icon: '⚡', text: 'Step through any algorithm live' },
  { icon: '🎛', text: 'Scrub, rewind, replay at any speed' },
  { icon: '🌐', text: 'Python, C++, Java, C, C#' },
  { icon: '📦', text: 'Arrays, trees, graphs & more' },
];
function RightPanel() {
  return (
    <div style={{ maxWidth: 380, width: '100%' }}>
      <div style={{
        background: 'rgba(255,255,255,.06)',
        border: '1px solid rgba(255,255,255,.12)',
        borderRadius: 20, padding: '36px 32px',
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 10 }}>
          Visualize algorithms as they run
        </h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,.65)', lineHeight: 1.7, marginBottom: 28 }}>
          DSVP turns your code into live, step-by-step animations.
          See every pointer, every value, every state change.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {bullets.map(b => (
            <div key={b.text} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'rgba(255,255,255,.06)', borderRadius: 10,
              padding: '10px 14px',
            }}>
              <span style={{ fontSize: 18 }}>{b.icon}</span>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,.8)', fontWeight: 500 }}>{b.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
