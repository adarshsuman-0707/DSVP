import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { forgotSendOtp, forgotVerifyOtp, forgotResetPass } from '../services/api';
import AuthShell from '../components/auth/AuthShell';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import NewPasswordFields from '../components/auth/NewPasswordFields';
import { localProblems } from '../utils/passwordPolicy';
import {
  Field, TextInput, PasswordInput, Alert, PrimaryButton, Steps, OtpBoxes, useOtp,
  IconArrowLeft, IconCheck,
} from '../components/auth/authUi';

/* ─────────────────────────────────────────────────────────
   LOGIN PAGE
   Shows either the sign-in form or the 3-step forgot-password flow.
───────────────────────────────────────────────────────── */
export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'forgot'

  return (
    <AuthShell
      headline="See your code think."
      sub="Trace every operation. Understand every state change."
    >
      {mode === 'login'
        ? <LoginForm onForgot={() => setMode('forgot')} />
        : <ForgotFlow onBack={() => setMode('login')} />}
    </AuthShell>
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
  const [notice, setNotice]     = useState('');
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

  function handleGoogleSuccess(result) {
    setError('');
    if (result.created) {
      setNotice(result.welcomeEmailSent
        ? 'Account created. We emailed your account details — Google sign-in keeps working without a password.'
        : 'Account created. Welcome to DSVP!');
      setTimeout(() => navigate('/dashboard'), 1800);
    } else {
      navigate('/dashboard');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;            // no duplicate submissions
    setError('');
    setLoading(true);
    try {
      const u = await login(email, password);
      // Temporary-password sign-in: the server only allows a password change next.
      navigate(u?.MustChangePassword ? '/change-password' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="auth-head">
        <h1>Welcome back</h1>
        <p>Pick up where your next algorithm journey begins.</p>
      </div>

      <Alert message={error} />
      {notice && (
        <div className="auth-success" role="status"><IconCheck width={16} height={16} /><span>{notice}</span></div>
      )}

      <form onSubmit={handleSubmit}>
        <Field label="Email address">
          {id => (
            <TextInput
              id={id} type="email" name="email" value={email} required
              autoComplete="email" inputMode="email" placeholder="you@example.com"
              onChange={e => setEmail(e.target.value)}
            />
          )}
        </Field>

        <Field
          label="Password"
          aside={<button type="button" className="auth-link" onClick={onForgot}>Forgot password?</button>}
        >
          {id => (
            <PasswordInput
              id={id} name="password" value={password} required
              autoComplete="current-password" placeholder="Enter your password"
              show={showPw} onToggle={() => setShowPw(p => !p)}
              onChange={e => setPassword(e.target.value)}
            />
          )}
        </Field>

        <PrimaryButton loading={loading} label="Sign in" loadingLabel="Signing in…" />
      </form>

      <div className="auth-divider" role="separator"><span>or</span></div>
      <GoogleSignInButton onSuccess={handleGoogleSuccess} onError={setError} />

      <p className="auth-foot">
        New to DSVP? <Link to="/register" className="auth-link">Create an account</Link>
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
  const [resetToken, setResetToken] = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [resendSecs, setResendSecs] = useState(0);
  const otp = useOtp();

  // countdown timer for resend
  useEffect(() => {
    if (resendSecs <= 0) return undefined;
    const t = setTimeout(() => setResendSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendSecs]);

  /* ── Step 1: Send OTP ── */
  async function handleSendOtp(e) {
    e.preventDefault();
    if (loading) return;
    setError('');
    if (!email.trim()) { setError('Please enter your email.'); return; }
    setLoading(true);
    try {
      await forgotSendOtp(email.trim());
      setStep('otp');
      setResendSecs(60);
      otp.focusFirst();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP. Try again.');
    } finally {
      setLoading(false);
    }
  }

  /* ── Step 2: Verify OTP ── */
  async function handleVerifyOtp(e) {
    e.preventDefault();
    if (loading) return;
    setError('');
    if (otp.code.length < 6) { setError('Please enter the complete 6-digit OTP.'); return; }
    setLoading(true);
    try {
      const res = await forgotVerifyOtp(email.trim(), otp.code);
      setResetToken(res.data.resetToken);
      setStep('reset');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP.');
      otp.reset();
    } finally {
      setLoading(false);
    }
  }

  /* ── Resend OTP ── */
  async function handleResend() {
    if (resendSecs > 0 || loading) return;
    setError('');
    setLoading(true);
    try {
      await forgotSendOtp(email.trim());
      otp.reset();
      setResendSecs(60);
    } catch {
      setError('Failed to resend OTP.');
    } finally {
      setLoading(false);
    }
  }

  /* ── Step 3: Reset Password ── */
  async function handleReset(e) {
    e.preventDefault();
    if (loading) return;
    setError('');
    if (localProblems(newPw).length) { setError('Your new password doesn’t meet all the requirements yet.'); return; }
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

  const stepIdx = { email: 0, otp: 1, reset: 2, done: 2 }[step];

  return (
    <>
      <div className="auth-head auth-head-row">
        {step !== 'done' && (
          <button
            type="button" className="auth-back" aria-label="Go back"
            onClick={step === 'email' ? onBack : () => { setStep('email'); setError(''); otp.reset(); }}
          ><IconArrowLeft /></button>
        )}
        <div>
          <h1>{step === 'done' ? 'Password updated' : 'Reset password'}</h1>
          <p>
            {step === 'email' && 'Enter your registered email and we’ll send you a code.'}
            {step === 'otp'   && `Enter the 6-digit code sent to ${email}.`}
            {step === 'reset' && 'Choose a new password for your account.'}
            {step === 'done'  && 'You can now sign in with your new password.'}
          </p>
        </div>
      </div>

      {step !== 'done' && <Steps labels={['Email', 'Code', 'New password']} active={stepIdx} />}

      <Alert message={error} />

      {step === 'email' && (
        <form onSubmit={handleSendOtp}>
          <Field label="Email address">
            {id => (
              <TextInput
                id={id} type="email" name="email" value={email} required
                autoComplete="email" inputMode="email" placeholder="you@example.com"
                onChange={e => setEmail(e.target.value)}
              />
            )}
          </Field>
          <PrimaryButton loading={loading} label="Send code" loadingLabel="Sending…" />
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={handleVerifyOtp}>
          <div className="auth-field">
            <div className="auth-label-row"><span className="auth-label" id="otp-label">Verification code</span></div>
            <OtpBoxes state={otp} />
            <div className="auth-resend">
              {resendSecs > 0
                ? <>Resend code in <b>{resendSecs}s</b></>
                : <button type="button" className="auth-link" onClick={handleResend} disabled={loading}>Resend code</button>}
            </div>
          </div>
          <PrimaryButton loading={loading} label="Verify code" loadingLabel="Verifying…" disabled={otp.code.length < 6} />
        </form>
      )}

      {step === 'reset' && (
        <form onSubmit={handleReset}>
          <NewPasswordFields
            password={newPw} onPassword={setNewPw} confirm={confirmPw} onConfirm={setConfirmPw} disabled={loading}
          />

          <PrimaryButton loading={loading} label="Reset password" loadingLabel="Resetting…" />
        </form>
      )}

      {step === 'done' && (
        <div className="auth-done">
          <div className="auth-done-badge"><IconCheck width={26} height={26} /></div>
          <button type="button" className="auth-btn" onClick={onBack}>Go to sign in</button>
        </div>
      )}
    </>
  );
}
