import { useState } from 'react';
import Logo from '../components/common/Logo';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { forgotResetPass } from '../services/api';
import PasswordRequirements from '../components/common/PasswordRequirements';
import { localProblems } from '../utils/passwordPolicy';

const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none',
  background: '#f8fafc', boxSizing: 'border-box', fontFamily: 'inherit',
  transition: 'all 150ms', color: '#1e293b',
};
function focusStyle(e) { e.target.style.borderColor = '#2E74B5'; e.target.style.background = '#fff'; }
function blurStyle(e)  { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; }

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

/**
 * Consumes a password-reset link — either from the self-service "forgot
 * password" email or an admin-triggered reset. Both issue the same kind of
 * short-lived resetToken JWT (see authController.resetPassword), so this
 * page is just a UI for the existing POST /auth/forgot-password/reset call.
 */
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [done, setDone]           = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!token) { setError('This reset link is missing or invalid.'); return; }
    if (localProblems(newPw).length) { setError('Your new password doesn’t meet all the requirements yet.'); return; }
    if (newPw !== confirmPw) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await forgotResetPass(token, newPw);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'This reset link is invalid or has expired. Please request a new one.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f2942 0%, #1F4E79 50%, #163a5e 100%)',
      fontFamily: "'Inter', system-ui, sans-serif", padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 420, background: '#fff', borderRadius: 20,
        padding: 36, boxShadow: '0 24px 60px rgba(0,0,0,.35)',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 24 }}>
          <Logo size={34} />
          <span style={{ fontSize: 18, fontWeight: 700, color: '#1F4E79' }}>DSVP</span>
        </Link>

        {done ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'linear-gradient(135deg,#4CAF50,#2E74B5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, margin: '0 auto 18px', color: '#fff',
            }}>✓</div>
            <h2 style={{ fontSize: 19, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>Password Reset!</h2>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
              Your password has been changed successfully. You can now log in with your new password.
            </p>
            <button
              onClick={() => navigate('/login')}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg,#2E74B5,#1F4E79)', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >Go to Login →</button>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>Set a new password</h1>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 22 }}>
              Choose a new password for your DSVP account.
            </p>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 9, marginBottom: 16,
                background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13,
              }}>⚠ {error}</div>
            )}

            <form onSubmit={handleSubmit}>
              <Field label="New Password">
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPw ? 'text' : 'password'} value={newPw} required
                    placeholder="At least 12 characters"
                    onChange={e => setNewPw(e.target.value)}
                    style={{ ...inputStyle, paddingRight: 44 }}
                    onFocus={focusStyle} onBlur={blurStyle}
                  />
                  <button type="button" onClick={() => setShowPw(p => !p)} style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8',
                  }}>{showPw ? '🙈' : '👁'}</button>
                </div>
              </Field>
              <PasswordRequirements password={newPw} />
              <Field label="Confirm New Password">
                <input
                  type={showPw ? 'text' : 'password'} value={confirmPw} required
                  placeholder="Re-enter password"
                  onChange={e => setConfirmPw(e.target.value)}
                  style={inputStyle}
                  onFocus={focusStyle} onBlur={blurStyle}
                />
              </Field>
              {confirmPw && (
                <p style={{ fontSize: 12, marginTop: -10, marginBottom: 16, fontWeight: 600, color: newPw === confirmPw ? '#15803d' : '#dc2626' }}>
                  {newPw === confirmPw ? '✓ Passwords match' : '✗ Passwords do not match'}
                </p>
              )}
              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '13px 0', borderRadius: 10, border: 'none',
                background: loading ? 'rgba(46,116,181,.5)' : 'linear-gradient(135deg,#2E74B5,#1F4E79)',
                color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              }}>{loading ? 'Resetting…' : 'Reset Password →'}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
