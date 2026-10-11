import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthShell from '../components/auth/AuthShell';
import RouteSplash from '../components/common/RouteSplash';
import NewPasswordFields from '../components/auth/NewPasswordFields';
import { Field, PasswordInput, Alert, PrimaryButton, IconCheck } from '../components/auth/authUi';
import { localProblems } from '../utils/passwordPolicy';

/**
 * Mandatory first password change after signing in with a temporary password.
 * (Also reachable only while MustChangePassword is true — the server blocks
 * every other API until this succeeds.)
 */
export default function ChangePasswordPage() {
  const { user, loading: authLoading, completePasswordChange, logout } = useAuth();
  const navigate = useNavigate();

  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [error, setError]     = useState('');
  const [busy, setBusy]       = useState(false);
  const [done, setDone]       = useState(false);
  // The context user flips to MustChangePassword=false the instant the API
  // succeeds; this keeps the guard below from redirecting before the success state shows.
  const submitting = useRef(false);

  const sameAsCurrent = !!next && next === current;
  const mismatch = !!confirm && confirm !== next;

  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => navigate('/dashboard', { replace: true }), 1400);
    return () => clearTimeout(t);
  }, [done, navigate]);

  if (authLoading) return <RouteSplash />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.MustChangePassword && !done && !submitting.current) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!current) { setError('Enter the temporary password from your email.'); return; }
    const problems = localProblems(next);
    if (problems.length) { setError('Your new password doesn’t meet all the requirements yet.'); return; }
    if (sameAsCurrent) { setError('New password must be different from your current password.'); return; }
    if (mismatch || !confirm) { setError('New password and confirmation must match.'); return; }

    setBusy(true);
    submitting.current = true;
    try {
      await completePasswordChange({ currentPassword: current, newPassword: next, confirmPassword: confirm });
      setCurrent(''); setNext(''); setConfirm('');
      setDone(true);
    } catch (err) {
      submitting.current = false;
      const code = err.response?.data?.code;
      if (code === 'TEMP_PASSWORD_EXPIRED' || code === 'PASSWORD_ALREADY_CHANGED') return; // global handler signs out + explains
      setError(err.response?.data?.message || 'Could not change your password. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function handleSignOut() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <AuthShell headline="One quick step." sub="Replace your temporary password with one only you know.">
      {done ? (
        <div className="auth-done" role="status">
          <div className="auth-done-badge"><IconCheck width={26} height={26} /></div>
          <div className="auth-head" style={{ marginBottom: 0 }}>
            <h1>Password updated</h1>
            <p>Taking you to your dashboard…</p>
          </div>
        </div>
      ) : (
        <>
          <div className="auth-head">
            <h1>Set a new password</h1>
            <p>You signed in with a temporary password. Choose a new one to continue.</p>
          </div>

          <Alert message={error} />

          <form onSubmit={handleSubmit} noValidate>
            <Field label="Current (temporary) password">
              {(id) => (
                <PasswordInput
                  id={id} name="current-password" value={current} required autoFocus
                  autoComplete="current-password" placeholder="Temporary password from your email"
                  show={showCurrent} onToggle={() => setShowCurrent((v) => !v)}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              )}
            </Field>

            <NewPasswordFields
              password={next} onPassword={setNext} confirm={confirm} onConfirm={setConfirm}
              disabled={busy} notice={sameAsCurrent ? 'Must be different from the current password' : ''}
            />

            <PrimaryButton loading={busy} label="Change password" loadingLabel="Updating…" />
          </form>

          <p className="auth-signout">
            Not now? <button type="button" className="auth-link" onClick={handleSignOut}>Sign out</button>
          </p>
        </>
      )}
    </AuthShell>
  );
}
