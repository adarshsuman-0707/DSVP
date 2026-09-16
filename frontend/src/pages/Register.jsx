import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { signupSendOtp, signupVerifyOtp } from '../services/api';

/* ─────────────────────────────────────────────
   REGISTER PAGE  (2 steps)
   Step 1 — Fill form + Send OTP
   Step 2 — Enter OTP → account created
───────────────────────────────────────────── */
export default function Register() {
  const [step, setStep] = useState('form'); // 'form' | 'otp' | 'done'

  // Form data — kept in parent so OTP step can read it
  const [fullName, setFullName] = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');

  const { loadUser } = useAuth();
  const navigate  = useNavigate();

  function handleFormDone(name, mail, pw) {
    setFullName(name);
    setEmail(mail);
    setPassword(pw);
    setStep('otp');
  }

  async function handleOtpDone(token) {
    // Token returned from OTP verification — store and load user
    localStorage.setItem('dsvp_token', token);
    await loadUser();
    navigate('/dashboard');
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
        {/* Logo */}
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

        {/* Card */}
        <div style={{
          width: '100%', maxWidth: 420,
          background: '#fff', borderRadius: 20,
          padding: '40px',
          boxShadow: '0 24px 60px rgba(0,0,0,.25)',
        }}>
          {step === 'form' && (
            <RegisterForm onDone={handleFormDone} />
          )}
          {step === 'otp' && (
            <OtpStep
              fullName={fullName}
              email={email}
              password={password}
              onBack={() => setStep('form')}
              onDone={handleOtpDone}
            />
          )}
        </div>

        <Link to="/" style={{ marginTop: 24, fontSize: 13, color: 'rgba(255,255,255,.5)', textDecoration: 'none' }}>
          ← Back to home
        </Link>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   STEP 1 — Registration form
───────────────────────────────────────────── */
function RegisterForm({ onDone }) {
  const [fullName, setFullName] = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const pwStrength = password.length === 0 ? 0
    : password.length < 6  ? 1
    : password.length < 10 ? 2
    : 3;
  const strengthLabel = ['', 'Weak', 'Good', 'Strong'];
  const strengthColor = ['', '#E15759', '#F2A93B', '#4CAF50'];

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!fullName.trim() || fullName.trim().length < 2) {
      setError('Please enter your full name.'); return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.'); return;
    }

    setLoading(true);
    try {
      await signupSendOtp(email.trim());
      onDone(fullName.trim(), email.trim().toLowerCase(), password);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send OTP. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>
        Create your account
      </h1>
      <p style={{ fontSize: 14, color: '#64748b', marginBottom: 28 }}>
        Free forever. No credit card needed.
      </p>

      <Alert message={error} />

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

          {password.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3].map(n => (
                  <div key={n} style={{
                    flex: 1, height: 3, borderRadius: 2,
                    background: pwStrength >= n ? strengthColor[pwStrength] : '#e2e8f0',
                    transition: 'background 200ms',
                  }} />
                ))}
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: strengthColor[pwStrength], marginTop: 4, display: 'block',
              }}>{strengthLabel[pwStrength]}</span>
            </div>
          )}
        </Field>

        <PrimaryBtn loading={loading} label="Send verification OTP →" loadingLabel="Sending OTP…" color="green" />
      </form>

      <p style={{ textAlign: 'center', marginTop: 22, fontSize: 13, color: '#64748b' }}>
        Already have an account?{' '}
        <Link to="/login" style={{ color: '#2E74B5', fontWeight: 600 }}>Log in</Link>
      </p>
    </>
  );
}

/* ─────────────────────────────────────────────
   STEP 2 — OTP Entry
───────────────────────────────────────────── */
function OtpStep({ fullName, email, password, onBack, onDone }) {
  const [otp,        setOtp]        = useState(['', '', '', '', '', '']);
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [resendSecs, setResendSecs] = useState(60);
  const [resending,  setResending]  = useState(false);
  const otpRefs = useRef([]);
  const timerRef = useRef(null);

  // Countdown timer
  useEffect(() => {
    if (resendSecs <= 0) return;
    timerRef.current = setTimeout(() => setResendSecs(s => s - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [resendSecs]);

  function handleChange(idx, val) {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[idx] = val;
    setOtp(next);
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus();
  }

  function handleKeyDown(idx, e) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowLeft'  && idx > 0) otpRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < 5) otpRefs.current[idx + 1]?.focus();
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = [...otp];
    pasted.split('').forEach((c, i) => { next[i] = c; });
    setOtp(next);
    otpRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError('');
    const code = otp.join('');
    if (code.length < 6) { setError('Please enter the complete 6-digit OTP.'); return; }
    setLoading(true);
    try {
      const res = await signupVerifyOtp(fullName, email, password, code);
      onDone(res.data.token);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP.');
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendSecs > 0 || resending) return;
    setError('');
    setResending(true);
    try {
      await signupSendOtp(email);
      setOtp(['', '', '', '', '', '']);
      setResendSecs(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError('Failed to resend OTP. Try again.');
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      {/* Header with back button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{
            width: 30, height: 30, borderRadius: 8, border: '1.5px solid #e2e8f0',
            background: '#f8fafc', cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#64748b', flexShrink: 0,
          }}
        >←</button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', margin: 0 }}>
            Verify your email
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '3px 0 0' }}>
            OTP sent to <strong style={{ color: '#1e293b' }}>{email}</strong>
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {['Details', 'Verify'].map((label, i) => (
          <div key={label} style={{ flex: 1 }}>
            <div style={{
              height: 4, borderRadius: 4,
              background: i === 0
                ? 'linear-gradient(90deg,#4CAF50,#2E74B5)'
                : 'linear-gradient(90deg,#4CAF50,#2E74B5)',
              transition: 'background 300ms',
            }} />
            <div style={{
              fontSize: 10, fontWeight: 700, color: '#2E74B5',
              textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 4,
            }}>{label}</div>
          </div>
        ))}
      </div>

      <Alert message={error} />

      <form onSubmit={handleVerify}>
        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: 'block', fontSize: 13, fontWeight: 600,
            color: '#374151', marginBottom: 12,
          }}>
            Enter 6-digit OTP
          </label>

          {/* OTP boxes */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={el => otpRefs.current[i] = el}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                autoFocus={i === 0}
                style={{
                  width: 46, height: 52, textAlign: 'center',
                  fontSize: 22, fontWeight: 700, color: '#1e293b',
                  border: `2px solid ${digit ? '#4CAF50' : '#e2e8f0'}`,
                  borderRadius: 10, outline: 'none',
                  background: digit ? '#f0fdf4' : '#f8fafc',
                  transition: 'all 150ms', caretColor: '#4CAF50',
                }}
                onFocus={e => { e.target.style.borderColor = '#4CAF50'; e.target.style.boxShadow = '0 0 0 3px rgba(76,175,80,.15)'; }}
                onBlur={e  => { e.target.style.boxShadow = 'none'; if (!digit) e.target.style.borderColor = '#e2e8f0'; }}
              />
            ))}
          </div>

          {/* Resend */}
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            {resendSecs > 0 ? (
              <span style={{ fontSize: 13, color: '#94a3b8' }}>
                Resend OTP in <strong style={{ color: '#4CAF50' }}>{resendSecs}s</strong>
              </span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  fontSize: 13, color: '#2E74B5', cursor: 'pointer',
                  fontWeight: 600, textDecoration: 'underline',
                }}
              >
                {resending ? 'Sending…' : 'Resend OTP'}
              </button>
            )}
          </div>
        </div>

        <PrimaryBtn
          loading={loading}
          label="Verify & Create Account →"
          loadingLabel="Creating account…"
          color="green"
          disabled={otp.join('').length < 6}
        />
      </form>
    </>
  );
}

/* ─────────────────────────────────────────────
   SHARED COMPONENTS
───────────────────────────────────────────── */
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

function Alert({ message }) {
  if (!message) return null;
  return (
    <div style={{
      background: '#fef2f2', border: '1px solid #fecaca',
      borderRadius: 10, padding: '12px 14px',
      marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ fontSize: 16 }}>⚠</span>
      <span style={{ fontSize: 13, color: '#dc2626' }}>{message}</span>
    </div>
  );
}

function PrimaryBtn({ loading, label, loadingLabel, color = 'blue', disabled = false }) {
  const bg = color === 'green'
    ? 'linear-gradient(135deg,#4CAF50,#2E74B5)'
    : 'linear-gradient(135deg,#2E74B5,#1F4E79)';
  const shadow = color === 'green'
    ? '0 4px 14px rgba(76,175,80,.35)'
    : '0 4px 14px rgba(46,116,181,.4)';
  const disabledBg = color === 'green' ? '#86efac' : '#93c5fd';

  return (
    <button
      type="submit"
      disabled={loading || disabled}
      style={{
        width: '100%', padding: '13px 0', borderRadius: 10,
        fontSize: 15, fontWeight: 700, color: '#fff', border: 'none',
        background: (loading || disabled) ? disabledBg : bg,
        cursor: (loading || disabled) ? 'not-allowed' : 'pointer',
        boxShadow: (loading || disabled) ? 'none' : shadow,
        transition: 'all 150ms', marginTop: 8,
      }}
    >
      {loading ? loadingLabel : label}
    </button>
  );
}

/* ─────────────────────────────────────────────
   LEFT DECORATIVE PANEL
───────────────────────────────────────────── */
const perks = [
  { icon: '🎓', title: 'Learn by doing',    desc: 'Run real code and watch it animate step by step.' },
  { icon: '🚀', title: 'Start immediately', desc: 'No setup, no install. Code right in the browser.' },
  { icon: '🆓', title: 'Free modules',      desc: 'Arrays, linked lists, stacks, queues — no paywall.' },
];
function LeftPanel() {
  return (
    <div style={{ maxWidth: 380, width: '100%' }}>
      <h2 style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 14 }}>
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
