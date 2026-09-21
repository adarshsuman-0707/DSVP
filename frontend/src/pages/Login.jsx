import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { forgotSendOtp, forgotVerifyOtp, forgotResetPass } from '../services/api';
import { useGsapContext, gsap } from '../hooks/useGsap';
import FloatingIcons from '../components/common/FloatingIcons';

/* ─────────────────────────────────────────────────────────
   MAIN LOGIN PAGE
   Shows either:
     - Normal login form
     - Forgot-password flow (3 steps)
───────────────────────────────────────────────────────── */
export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'forgot'

  useGsapContext(() => {
    gsap.timeline({ defaults: { ease: 'power3.out' } })
      .from('.auth-logo', { y: -16, opacity: 0, duration: 0.5 })
      .from('.auth-card', { y: 28, opacity: 0, scale: 0.97, duration: 0.65 }, '-=0.2')
      .from('.auth-back', { opacity: 0, duration: 0.4 }, '-=0.2')
      .from('.auth-right > *', { x: 24, opacity: 0, duration: 0.6, stagger: 0.08 }, '-=0.5');
  }, []);

  return (
    <div className="auth-shell" style={{
      minHeight: '100vh', display: 'flex', position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(135deg, #0f2942 0%, #1F4E79 50%, #163a5e 100%)',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* subtle static dot texture — no movement, keeps focus on the card's animated border */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(rgba(255,255,255,.06) 1px, transparent 1px)',
        backgroundSize: '26px 26px',
        maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, #000 40%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, #000 40%, transparent 100%)',
      }} />
      <FloatingIcons />

      {/* left panel */}
      <div className="auth-left" style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '32px 5%', position: 'relative', zIndex: 1, minWidth: 0,
      }}>
        {/* logo */}
        <Link to="/" className="auth-logo" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          textDecoration: 'none', marginBottom: 36,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'linear-gradient(135deg,#2E74B5,#4CAF50)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>D</div>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-.02em' }}>DSVP</span>
        </Link>

        {/* card — moving gradient border directly on the card itself + cursor spotlight */}
        <div
          className="auth-card gradient-border-move"
          onMouseMove={e => {
            const r = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
            e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
          }}
          style={{
            position: 'relative', width: '100%', maxWidth: 420,
            borderRadius: 20, padding: '40px', overflow: 'hidden',
            boxShadow: '0 24px 60px rgba(0,0,0,.35)',
          }}
        >
          {/* cursor spotlight */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5, zIndex: 1,
            background: 'radial-gradient(220px circle at var(--mx,50%) var(--my,0%), rgba(46,116,181,.08), transparent 70%)',
          }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            {mode === 'login'
              ? <LoginForm onForgot={() => setMode('forgot')} />
              : <ForgotFlow onBack={() => setMode('login')} />
            }
          </div>
        </div>

        <Link to="/" className="auth-back" style={{ marginTop: 22, fontSize: 13, color: 'rgba(255,255,255,.5)', textDecoration: 'none' }}>
          ← Back to home
        </Link>
      </div>

      {/* right decorative panel — hidden on tablet/mobile to keep the form the focus */}
      <div className="auth-right" style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '40px 5%',
        maxWidth: 520, position: 'relative', zIndex: 1,
      }}>
        <RightPanel />
      </div>

      <style>{`
        /* animated moving-gradient border directly on the card div (border-box + padding-box trick) */
        .gradient-border-move {
          border: 4px solid transparent;
          background:
            linear-gradient(#fff, #fff) padding-box,
            linear-gradient(90deg, #1d4ed8, #15803d, #6d28d9, #1d4ed8) border-box;
          background-size: 100% 100%, 300% 100%;
          animation: gradientBorderMove 5s linear infinite;
        }
        @keyframes gradientBorderMove {
          to { background-position: 0 0, -300% 0; }
        }

        @media (max-width: 980px) {
          .auth-shell { flex-direction: column !important; }
          .auth-right { display: none !important; }
          .auth-left { flex: 1 1 auto !important; width: 100% !important; max-width: 100% !important; min-height: 100vh; }
        }
        @media (max-width: 480px) {
          .auth-left { padding: 24px 5% !important; }
          .auth-card { padding: 28px 22px !important; }
          .auth-logo { margin-bottom: 26px !important; }
          .auth-logo span { font-size: 18px !important; }
        }
        @media (max-width: 360px) {
          .auth-card { padding: 22px 16px !important; }
        }
        @media (max-width: 380px) {
          .otp-box { width: 38px !important; height: 46px !important; font-size: 18px !important; }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   NORMAL LOGIN FORM
───────────────────────────────────────────────────────── */
function LoginForm({ onForgot }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  // Set by the global 401 handler (api.js) when an admin action — block,
  // deactivate, password reset — invalidated a session that was mid-use.
  useEffect(() => {
    try {
      const msg = sessionStorage.getItem('dsvp_auth_message');
      if (msg) {
        setError(msg);
        sessionStorage.removeItem('dsvp_auth_message');
      }
    } catch { /* ignore */ }
  }, []);

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
    <>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>
        Welcome back
      </h1>
      <p style={{ fontSize: 14, color: '#64748b', marginBottom: 28 }}>
        Log in to continue your learning journey.
      </p>

      <Alert type="error" message={error} />

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

        {/* Forgot password link */}
        <div style={{ textAlign: 'right', marginTop: -10, marginBottom: 18 }}>
          <button
            type="button"
            onClick={onForgot}
            style={{
              background: 'none', border: 'none', padding: 0,
              fontSize: 13, color: '#2E74B5', cursor: 'pointer',
              fontWeight: 600, textDecoration: 'underline',
            }}
          >
            Forgot password?
          </button>
        </div>

        <PrimaryBtn loading={loading} label="Sign in →" loadingLabel="Signing in…" />
      </form>

      <p style={{ textAlign: 'center', marginTop: 22, fontSize: 13, color: '#64748b' }}>
        No account?{' '}
        <Link to="/register" style={{ color: '#2E74B5', fontWeight: 600 }}>
          Create one free
        </Link>
      </p>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   FORGOT PASSWORD FLOW (3 steps)
───────────────────────────────────────────────────────── */
function ForgotFlow({ onBack }) {
  // step: 'email' | 'otp' | 'reset' | 'done'
  const [step, setStep]             = useState('email');
  const [email, setEmail]           = useState('');
  const [otp, setOtp]               = useState(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [resendSecs, setResendSecs] = useState(0);
  const timerRef                    = useRef(null);
  const otpRefs                     = useRef([]);

  // countdown timer for resend
  useEffect(() => {
    if (resendSecs <= 0) return;
    timerRef.current = setTimeout(() => setResendSecs(s => s - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [resendSecs]);

  /* ── Step 1: Send OTP ── */
  async function handleSendOtp(e) {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('Please enter your email.'); return; }
    setLoading(true);
    try {
      await forgotSendOtp(email.trim());
      setStep('otp');
      setResendSecs(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP. Try again.');
    } finally {
      setLoading(false);
    }
  }

  /* ── OTP input helpers ── */
  function handleOtpChange(idx, val) {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[idx] = val;
    setOtp(next);
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus();
  }

  function handleOtpKeyDown(idx, e) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && idx > 0) otpRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < 5) otpRefs.current[idx + 1]?.focus();
  }

  function handleOtpPaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = [...otp];
    pasted.split('').forEach((c, i) => { next[i] = c; });
    setOtp(next);
    otpRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  /* ── Step 2: Verify OTP ── */
  async function handleVerifyOtp(e) {
    e.preventDefault();
    setError('');
    const code = otp.join('');
    if (code.length < 6) { setError('Please enter the complete 6-digit OTP.'); return; }
    setLoading(true);
    try {
      const res = await forgotVerifyOtp(email.trim(), code);
      setResetToken(res.data.resetToken);
      setStep('reset');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP.');
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  }

  /* ── Resend OTP ── */
  async function handleResend() {
    if (resendSecs > 0) return;
    setError('');
    setLoading(true);
    try {
      await forgotSendOtp(email.trim());
      setOtp(['', '', '', '', '', '']);
      setResendSecs(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError('Failed to resend OTP.');
    } finally {
      setLoading(false);
    }
  }

  /* ── Step 3: Reset Password ── */
  async function handleReset(e) {
    e.preventDefault();
    setError('');
    if (newPw.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (newPw !== confirmPw) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await forgotResetPass(resetToken, newPw);
      setStep('done');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password. Please start over.');
    } finally {
      setLoading(false);
    }
  }

  /* ── Step indicators ── */
  const STEPS = ['Email', 'OTP', 'New Password'];
  const stepIdx = { email: 0, otp: 1, reset: 2, done: 2 }[step];

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        {step !== 'done' && (
          <button
            onClick={step === 'email' ? onBack : () => { setStep('email'); setError(''); setOtp(['','','','','','']); }}
            style={{
              width: 30, height: 30, borderRadius: 8, border: '1.5px solid #e2e8f0',
              background: '#f8fafc', cursor: 'pointer', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#64748b', flexShrink: 0,
            }}
            title="Go back"
          >←</button>
        )}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', margin: 0 }}>
            Reset Password
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0' }}>
            {step === 'email' && 'Enter your registered email to receive an OTP.'}
            {step === 'otp'   && `Enter the 6-digit OTP sent to ${email}`}
            {step === 'reset' && 'Create a new strong password.'}
            {step === 'done'  && 'Your password has been reset.'}
          </p>
        </div>
      </div>

      {/* Step pills */}
      {step !== 'done' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {STEPS.map((label, i) => (
            <div key={label} style={{ flex: 1 }}>
              <div style={{
                height: 4, borderRadius: 4,
                background: i <= stepIdx
                  ? 'linear-gradient(90deg,#2E74B5,#4CAF50)'
                  : '#e2e8f0',
                transition: 'background 300ms',
              }} />
              <div style={{
                fontSize: 10, fontWeight: 700, color: i <= stepIdx ? '#2E74B5' : '#94a3b8',
                textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 4,
              }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <Alert type="error" message={error} />

      {/* ── STEP 1: Email ── */}
      {step === 'email' && (
        <form onSubmit={handleSendOtp}>
          <Field label="Email address">
            <input
              type="email" value={email} required
              placeholder="you@example.com"
              onChange={e => setEmail(e.target.value)}
              style={inputStyle}
              onFocus={focusStyle} onBlur={blurStyle}
            />
          </Field>
          <PrimaryBtn loading={loading} label="Send OTP →" loadingLabel="Sending…" />
        </form>
      )}

      {/* ── STEP 2: OTP ── */}
      {step === 'otp' && (
        <form onSubmit={handleVerifyOtp}>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
              Enter 6-digit OTP
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={el => otpRefs.current[i] = el}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(i, e)}
                  onPaste={i === 0 ? handleOtpPaste : undefined}
                  className="otp-box"
                  style={{
                    width: 46, height: 52, textAlign: 'center',
                    fontSize: 22, fontWeight: 700, color: '#1e293b',
                    border: `2px solid ${digit ? '#2E74B5' : '#e2e8f0'}`,
                    borderRadius: 10, outline: 'none',
                    background: digit ? '#EFF6FF' : '#f8fafc',
                    transition: 'all 150ms', caretColor: '#2E74B5',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#2E74B5'; e.target.style.boxShadow = '0 0 0 3px rgba(46,116,181,.12)'; }}
                  onBlur={e  => { e.target.style.boxShadow = 'none'; if (!digit) e.target.style.borderColor = '#e2e8f0'; }}
                />
              ))}
            </div>

            {/* Resend */}
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              {resendSecs > 0 ? (
                <span style={{ fontSize: 13, color: '#94a3b8' }}>
                  Resend OTP in <strong style={{ color: '#2E74B5' }}>{resendSecs}s</strong>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    fontSize: 13, color: '#2E74B5', cursor: 'pointer',
                    fontWeight: 600, textDecoration: 'underline',
                  }}
                >
                  Resend OTP
                </button>
              )}
            </div>
          </div>

          <PrimaryBtn
            loading={loading}
            label="Verify OTP →"
            loadingLabel="Verifying…"
            disabled={otp.join('').length < 6}
          />
        </form>
      )}

      {/* ── STEP 3: New Password ── */}
      {step === 'reset' && (
        <form onSubmit={handleReset}>
          <Field label="New Password">
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={newPw} required
                placeholder="At least 6 characters"
                onChange={e => setNewPw(e.target.value)}
                style={{ ...inputStyle, paddingRight: 44 }}
                onFocus={focusStyle} onBlur={blurStyle}
              />
              <button type="button" onClick={() => setShowPw(p => !p)} style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 16, color: '#94a3b8',
              }}>{showPw ? '🙈' : '👁'}</button>
            </div>
          </Field>

          <Field label="Confirm New Password">
            <input
              type={showPw ? 'text' : 'password'}
              value={confirmPw} required
              placeholder="Re-enter password"
              onChange={e => setConfirmPw(e.target.value)}
              style={inputStyle}
              onFocus={focusStyle} onBlur={blurStyle}
            />
          </Field>

          {/* Password match indicator */}
          {confirmPw && (
            <p style={{
              fontSize: 12, marginTop: -10, marginBottom: 16,
              color: newPw === confirmPw ? '#15803d' : '#dc2626',
              fontWeight: 600,
            }}>
              {newPw === confirmPw ? '✓ Passwords match' : '✗ Passwords do not match'}
            </p>
          )}

          <PrimaryBtn loading={loading} label="Reset Password →" loadingLabel="Resetting…" />
        </form>
      )}

      {/* ── DONE ── */}
      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'linear-gradient(135deg,#4CAF50,#2E74B5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, margin: '0 auto 20px',
          }}>✓</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>
            Password Reset!
          </h2>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 28 }}>
            Your password has been changed successfully. You can now log in with your new password.
          </p>
          <button
            onClick={onBack}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 10,
              fontSize: 15, fontWeight: 700, color: '#fff', border: 'none',
              background: 'linear-gradient(135deg,#2E74B5,#1F4E79)',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(46,116,181,.4)',
            }}
          >
            Go to Login →
          </button>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   SHARED HELPERS
───────────────────────────────────────────────────────── */
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

function Alert({ type, message }) {
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

function PrimaryBtn({ loading, label, loadingLabel, disabled = false }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      style={{
        width: '100%', padding: '13px 0', borderRadius: 10,
        fontSize: 15, fontWeight: 700, color: '#fff', border: 'none',
        background: loading || disabled
          ? '#93c5fd'
          : 'linear-gradient(135deg,#2E74B5,#1F4E79)',
        cursor: loading || disabled ? 'not-allowed' : 'pointer',
        boxShadow: loading || disabled ? 'none' : '0 4px 14px rgba(46,116,181,.4)',
        transition: 'all 150ms',
      }}
    >
      {loading ? loadingLabel : label}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────
   RIGHT DECORATIVE PANEL
───────────────────────────────────────────────────────── */
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
        background: 'linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03))',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: 20, padding: '36px 32px',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 20px 50px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.08)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, marginBottom: 18,
          background: 'linear-gradient(135deg,#2E74B5,#4CAF50)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, boxShadow: '0 8px 22px rgba(46,116,181,.4)',
        }}>🎯</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 10, letterSpacing: '-.01em' }}>
          Visualize algorithms as they run
        </h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,.65)', lineHeight: 1.7, marginBottom: 28 }}>
          DSVP turns your code into live, step-by-step animations.
          See every pointer, every value, every state change.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bullets.map(b => (
            <div key={b.text} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 11, padding: '11px 14px', transition: 'background 150ms, border-color 150ms',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.18)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)'; }}
            >
              <span style={{ fontSize: 18 }}>{b.icon}</span>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,.85)', fontWeight: 500 }}>{b.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
