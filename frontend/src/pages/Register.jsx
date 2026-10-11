import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { signupSendOtp, signupVerifyOtp } from '../services/api';
import AuthShell from '../components/auth/AuthShell';
import NewPasswordFields from '../components/auth/NewPasswordFields';
import { localProblems } from '../utils/passwordPolicy';
import {
  Field, TextInput, Alert, PrimaryButton, Steps, OtpBoxes, useOtp, IconArrowLeft,
} from '../components/auth/authUi';

/* ─────────────────────────────────────────────
   REGISTER PAGE  (2 steps)
   Step 1 — Fill form + Send OTP
   Step 2 — Enter OTP → account created
───────────────────────────────────────────── */
export default function Register() {
  const [step, setStep] = useState('form'); // 'form' | 'otp'

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
    <AuthShell
      headline="Start tracing in minutes."
      sub="Run real code in the browser and watch every step unfold — no setup required."
    >
      {step === 'form' && <RegisterForm onDone={handleFormDone} />}
      {step === 'otp' && (
        <OtpStep
          fullName={fullName}
          email={email}
          password={password}
          onBack={() => setStep('form')}
          onDone={handleOtpDone}
        />
      )}
    </AuthShell>
  );
}

/* ─────────────────────────────────────────────
   STEP 1 — Registration form
───────────────────────────────────────────── */
function RegisterForm({ onDone }) {
  const [fullName, setFullName] = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    setError('');

    if (!fullName.trim() || fullName.trim().length < 2) {
      setError('Please enter your full name.'); return;
    }
    const problems = localProblems(password);
    if (problems.length) { setError('Your password doesn’t meet all the requirements yet.'); return; }
    if (password !== confirm) { setError('Password and confirmation must match.'); return; }

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
      <div className="auth-head">
        <h1>Create your account</h1>
        <p>Free to start. No credit card needed.</p>
      </div>

      <Alert message={error} />

      <form onSubmit={handleSubmit}>
        <Field label="Full name">
          {id => (
            <TextInput
              id={id} type="text" name="name" value={fullName} required
              autoComplete="name" placeholder="Jane Smith"
              onChange={e => setFullName(e.target.value)}
            />
          )}
        </Field>

        <Field label="Email address">
          {id => (
            <TextInput
              id={id} type="email" name="email" value={email} required
              autoComplete="email" inputMode="email" placeholder="you@example.com"
              onChange={e => setEmail(e.target.value)}
            />
          )}
        </Field>

        <NewPasswordFields
          label="Password" confirmLabel="Confirm password" placeholder="Create a strong password"
          password={password} onPassword={setPassword} confirm={confirm} onConfirm={setConfirm} disabled={loading}
        />

        <PrimaryButton loading={loading} label="Send verification code" loadingLabel="Sending code…" />
      </form>

      <p className="auth-foot">
        Already have an account? <Link to="/login" className="auth-link">Sign in</Link>
      </p>
    </>
  );
}

/* ─────────────────────────────────────────────
   STEP 2 — OTP Entry
───────────────────────────────────────────── */
function OtpStep({ fullName, email, password, onBack, onDone }) {
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [resendSecs, setResendSecs] = useState(60);
  const [resending,  setResending]  = useState(false);
  const otp = useOtp();

  useEffect(() => { otp.focusFirst(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer
  useEffect(() => {
    if (resendSecs <= 0) return undefined;
    const t = setTimeout(() => setResendSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendSecs]);

  async function handleVerify(e) {
    e.preventDefault();
    if (loading) return;
    setError('');
    if (otp.code.length < 6) { setError('Please enter the complete 6-digit OTP.'); return; }
    setLoading(true);
    try {
      const res = await signupVerifyOtp(fullName, email, password, otp.code);
      onDone(res.data.token);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP.');
      otp.reset();
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
      otp.reset();
      setResendSecs(60);
    } catch {
      setError('Failed to resend OTP. Try again.');
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      <div className="auth-head auth-head-row">
        <button type="button" className="auth-back" aria-label="Go back" onClick={onBack}><IconArrowLeft /></button>
        <div>
          <h1>Verify your email</h1>
          <p>We sent a 6-digit code to {email}.</p>
        </div>
      </div>

      <Steps labels={['Details', 'Verify']} active={1} />

      <Alert message={error} />

      <form onSubmit={handleVerify}>
        <div className="auth-field">
          <div className="auth-label-row"><span className="auth-label">Verification code</span></div>
          <OtpBoxes state={otp} />
          <div className="auth-resend">
            {resendSecs > 0
              ? <>Resend code in <b>{resendSecs}s</b></>
              : <button type="button" className="auth-link" onClick={handleResend} disabled={resending}>
                  {resending ? 'Sending…' : 'Resend code'}
                </button>}
          </div>
        </div>

        <PrimaryButton
          loading={loading}
          label="Verify and create account"
          loadingLabel="Creating account…"
          disabled={otp.code.length < 6}
        />
      </form>
    </>
  );
}
