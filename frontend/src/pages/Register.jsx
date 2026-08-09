import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const pwStrength = password.length === 0 ? 0
    : password.length < 6  ? 1
    : password.length < 10 ? 2
    : 3;
  const strengthLabel = ['', 'Weak', 'Good', 'Strong'];
  const strengthColor = ['', '#E15759', '#F2A93B', '#4CAF50'];

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      await register(fullName, email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Try again.');
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
      {/* ── left decorative panel ── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '40px 5%',
        maxWidth: 520,
      }}>
        <LeftPanel />
      </div>

      {/* ── right form panel ── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 5%',
      }}>
        <Link to="/" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          textDecoration: 'none', marginBottom: 40,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'linear-gradient(135deg,#2E74B5,#4CAF50)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#fff',
          }}>D</div>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-.02em' }}>DSVP</span>
        </Link>

        <div style={{
          width: '100%', maxWidth: 420,
          background: '#fff', borderRadius: 20,
          padding: '40px 40px',
          boxShadow: '0 24px 60px rgba(0,0,0,.25)',
        }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>
            Create your account
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 28 }}>
            Free forever. No credit card needed.
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
            <Field label="Full name">
              <input
                type="text" value={fullName} required
                placeholder="Jane Smith"
                onChange={e => setFullName(e.target.value)}
                style={inputStyle}
                onFocus={focusStyle} onBlur={blurStyle}
              />
            </Field>

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
                  placeholder="At least 6 characters"
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

              {/* strength bar */}
              {password.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1,2,3].map(n => (
                      <div key={n} style={{
                        flex: 1, height: 3, borderRadius: 2,
                        background: pwStrength >= n ? strengthColor[pwStrength] : '#e2e8f0',
                        transition: 'background 200ms',
                      }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: strengthColor[pwStrength], marginTop: 4, display: 'block' }}>
                    {strengthLabel[pwStrength]}
                  </span>
                </div>
              )}
            </Field>

            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 10,
                fontSize: 15, fontWeight: 700, color: '#fff', border: 'none',
                background: loading ? '#86efac' : 'linear-gradient(135deg,#4CAF50,#2E74B5)',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 14px rgba(76,175,80,.35)',
                transition: 'all 150ms', marginTop: 8,
              }}
            >
              {loading ? 'Creating account…' : 'Create account →'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 22, fontSize: 13, color: '#64748b' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#2E74B5', fontWeight: 600 }}>Log in</Link>
          </p>
        </div>

        <Link to="/" style={{ marginTop: 24, fontSize: 13, color: 'rgba(255,255,255,.5)', textDecoration: 'none' }}>
          ← Back to home
        </Link>
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

const perks = [
  { icon: '🎓', title: 'Learn by doing',   desc: 'Run real code and watch it animate step by step.' },
  { icon: '🚀', title: 'Start immediately', desc: 'No setup, no install. Code right in the browser.' },
  { icon: '🆓', title: 'Free modules',      desc: 'Arrays, linked lists, stacks, queues — no paywall.' },
];
function LeftPanel() {
  return (
    <div style={{ maxWidth: 380, width: '100%' }}>
      <h2 style={{
        fontSize: 28, fontWeight: 800, color: '#fff',
        lineHeight: 1.2, marginBottom: 14,
      }}>
        The visual way to learn data structures
      </h2>
      <p style={{ fontSize: 15, color: 'rgba(255,255,255,.65)', lineHeight: 1.7, marginBottom: 36 }}>
        Join thousands of developers who stopped reading about algorithms and started watching them.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {perks.map(p => (
          <div key={p.title} style={{
            display: 'flex', gap: 14, alignItems: 'flex-start',
            background: 'rgba(255,255,255,.07)',
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 14, padding: '16px 18px',
          }}>
            <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>{p.icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{p.title}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', lineHeight: 1.55 }}>{p.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
