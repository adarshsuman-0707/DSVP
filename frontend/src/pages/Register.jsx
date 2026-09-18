import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { signupSendOtp, signupVerifyOtp } from '../services/api';
import { useGsapContext, gsap } from '../hooks/useGsap';
import FloatingIcons from '../components/common/FloatingIcons';

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

  useGsapContext(() => {
    gsap.timeline({ defaults: { ease: 'power3.out' } })
      .from('.auth-left > *', { x: -24, opacity: 0, duration: 0.6, stagger: 0.08 })
      .from('.auth-logo', { y: -16, opacity: 0, duration: 0.5 }, '-=0.4')
      .from('.auth-card', { y: 28, opacity: 0, scale: 0.97, duration: 0.65 }, '-=0.2')
      .from('.auth-back', { opacity: 0, duration: 0.4 }, '-=0.2');
  }, [step]);

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

      {/* ── left decorative panel — hidden on tablet/mobile ── */}
      <div className="auth-decor" style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '40px 5%',
        maxWidth: 520, position: 'relative', zIndex: 1,
      }}>
        <LeftPanel />
      </div>

      {/* ── right form panel ── */}
      <div className="auth-form-col" style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '32px 5%', position: 'relative', zIndex: 1, minWidth: 0,
      }}>
        {/* Logo */}
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

        {/* Card — moving gradient border directly on the card itself + cursor spotlight */}
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
          <div aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5, zIndex: 1,
            background: 'radial-gradient(220px circle at var(--mx,50%) var(--my,0%), rgba(76,175,80,.08), transparent 70%)',
          }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
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
        </div>

        <Link to="/" className="auth-back" style={{ marginTop: 22, fontSize: 13, color: 'rgba(255,255,255,.5)', textDecoration: 'none' }}>
          ← Back to home
        </Link>
      </div>

      <style>{`
        /* animated moving-gradient border directly on the card div (border-box + padding-box trick) */
        .gradient-border-move {
          border: 4px solid transparent;
          background:
            linear-gradient(#fff, #fff) padding-box,
            linear-gradient(90deg, #15803d, #1d4ed8, #6d28d9, #15803d) border-box;
          background-size: 100% 100%, 300% 100%;
          animation: gradientBorderMove 5s linear infinite;
        }
        @keyframes gradientBorderMove {
          to { background-position: 0 0, -300% 0; }
        }

        @media (max-width: 980px) {
          .auth-shell { flex-direction: column !important; }
          .auth-decor { display: none !important; }
          .auth-form-col { flex: 1 1 auto !important; width: 100% !important; max-width: 100% !important; min-height: 100vh; }
        }
        @media (max-width: 480px) {
          .auth-form-col { padding: 24px 5% !important; }
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
                className="otp-box"
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
      <h2 style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 14, letterSpacing: '-.01em' }}>
        The visual way to learn data structures
      </h2>
      <p style={{ fontSize: 15, color: 'rgba(255,255,255,.65)', lineHeight: 1.7, marginBottom: 36 }}>
        Join thousands of developers who stopped reading about algorithms and started watching them.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {perks.map(p => (
          <div key={p.title} style={{
            display: 'flex', gap: 14, alignItems: 'flex-start',
            background: 'linear-gradient(135deg, rgba(255,255,255,.09), rgba(255,255,255,.03))',
            border: '1px solid rgba(255,255,255,.13)',
            borderRadius: 14, padding: '16px 18px',
            transition: 'transform 180ms, border-color 180ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(4px)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.28)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateX(0)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.13)'; }}
          >
            <span style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg,#4CAF50,#2E74B5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 19, boxShadow: '0 6px 16px rgba(46,116,181,.3)',
            }}>{p.icon}</span>
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
