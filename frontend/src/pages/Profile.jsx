import { useState } from 'react';
import AppShell from '../components/common/AppShell';
import { useAuth } from '../context/AuthContext';
import { updateProfile, changePassword } from '../services/api';

/* ── tiny reusable pieces (no external deps) ── */
function Section({ title, subtitle, children }) {
  return (
    <div style={{
      background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 16,
      boxShadow: '0 1px 4px rgba(0,0,0,.05)', marginBottom: 24,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 0 }}>{subtitle}</p>}
      </div>
      <div style={{ padding: '24px' }}>{children}</div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{
        display: 'block', fontSize: 13, fontWeight: 600,
        color: '#374151', marginBottom: 6,
      }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

const inputStyle = (focus) => ({
  width: '100%', padding: '9px 13px', borderRadius: 9,
  border: `1.5px solid ${focus ? '#2E74B5' : '#e2e8f0'}`,
  fontSize: 14, outline: 'none', background: focus ? '#fff' : '#f8fafc',
  boxSizing: 'border-box', fontFamily: 'inherit', transition: 'all 150ms',
  color: '#1e293b',
});

function TextInput({ value, onChange, placeholder, disabled, type = 'text' }) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={inputStyle(focus)}
    />
  );
}

function Alert({ type, message }) {
  if (!message) return null;
  const cfg = {
    success: { bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', icon: '✓' },
    error:   { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', icon: '⚠' },
  }[type] || {};
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 9, marginBottom: 16,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      color: cfg.color, fontSize: 13, display: 'flex', gap: 8, alignItems: 'center',
    }}>
      <span style={{ fontWeight: 700 }}>{cfg.icon}</span>
      {message}
    </div>
  );
}

function SaveBtn({ loading, label = 'Save Changes' }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        padding: '9px 24px', borderRadius: 9, border: 'none',
        background: loading ? 'rgba(46,116,181,.35)' : 'linear-gradient(135deg,#2E74B5,#1F4E79)',
        color: '#fff', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'all 150ms', boxShadow: loading ? 'none' : '0 2px 8px rgba(46,116,181,.3)',
      }}
    >
      {loading ? 'Saving…' : label}
    </button>
  );
}

/* ── Avatar initials ── */
function Avatar({ name, size = 72 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg,#1F4E79,#2E74B5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>{initials}</div>
  );
}

/* ── Badge ── */
function Badge({ children, color = '#2E74B5', bg = '#EFF6FF', border = '#bfdbfe' }) {
  return (
    <span style={{
      padding: '3px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
      background: bg, color, border: `1px solid ${border}`,
    }}>{children}</span>
  );
}

/* ═══════════════════════════════════════════════════
   PROFILE PAGE
   ═══════════════════════════════════════════════════ */
export default function Profile() {
  const { user, updateUser } = useAuth();

  /* ── Update Name ── */
  const [fullName, setFullName]     = useState(user?.FullName || '');
  const [nameAlert, setNameAlert]   = useState({ type: '', msg: '' });
  const [nameSaving, setNameSaving] = useState(false);

  async function handleUpdateName(e) {
    e.preventDefault();
    setNameAlert({ type: '', msg: '' });

    if (!fullName.trim() || fullName.trim().length < 2) {
      setNameAlert({ type: 'error', msg: 'Name must be at least 2 characters.' });
      return;
    }

    setNameSaving(true);
    try {
      const res = await updateProfile({ fullName: fullName.trim() });
      updateUser({ FullName: res.data.user.FullName });
      setNameAlert({ type: 'success', msg: 'Name updated successfully!' });
    } catch (err) {
      setNameAlert({ type: 'error', msg: err.response?.data?.message || 'Failed to update name.' });
    } finally {
      setNameSaving(false);
    }
  }

  /* ── Change Password ── */
  const [currentPw, setCurrentPw]   = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [pwAlert, setPwAlert]       = useState({ type: '', msg: '' });
  const [pwSaving, setPwSaving]     = useState(false);

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwAlert({ type: '', msg: '' });

    if (!currentPw) {
      setPwAlert({ type: 'error', msg: 'Enter your current password.' });
      return;
    }
    if (newPw.length < 6) {
      setPwAlert({ type: 'error', msg: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPw !== confirmPw) {
      setPwAlert({ type: 'error', msg: 'New passwords do not match.' });
      return;
    }

    setPwSaving(true);
    try {
      await changePassword({ currentPassword: currentPw, newPassword: newPw });
      setPwAlert({ type: 'success', msg: 'Password changed successfully!' });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      setPwAlert({ type: 'error', msg: err.response?.data?.message || 'Failed to change password.' });
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <AppShell>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '36px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>Profile</h1>
          <p style={{ fontSize: 14, color: '#64748b' }}>Manage your account details and security.</p>
        </div>

        {/* User info card */}
        <Section title="Account Info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <Avatar name={user?.FullName} size={72} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                {user?.FullName}
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>{user?.Email}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {user?.Role === 'admin' && (
                  <Badge color="#D97706" bg="#FEF3C7" border="#fde68a">Admin</Badge>
                )}
                {user?.IsPremium ? (
                  <Badge color="#D97706" bg="#FEF3C7" border="#fde68a">
                    ⭐ {user?.SubscriptionPlan || 'Premium'}
                  </Badge>
                ) : (
                  <Badge color="#4CAF50" bg="#F0FDF4" border="#bbf7d0">Free Plan</Badge>
                )}
                <Badge color="#64748b" bg="#f1f5f9" border="#e2e8f0">
                  Member since {user?.CreatedAt
                    ? new Date(user.CreatedAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
                    : '—'}
                </Badge>
              </div>
            </div>
          </div>
        </Section>

        {/* Update Name */}
        <Section title="Update Name" subtitle="Change how your name appears across the platform.">
          <form onSubmit={handleUpdateName}>
            <Alert type={nameAlert.type} message={nameAlert.msg} />
            <Field label="Full Name">
              <TextInput
                value={fullName}
                onChange={setFullName}
                placeholder="Enter your full name"
                disabled={nameSaving}
              />
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <SaveBtn loading={nameSaving} />
            </div>
          </form>
        </Section>

        {/* Change Password */}
        <Section title="Change Password" subtitle="Use a strong password you don't use elsewhere.">
          <form onSubmit={handleChangePassword}>
            <Alert type={pwAlert.type} message={pwAlert.msg} />
            <Field label="Current Password">
              <TextInput
                type="password"
                value={currentPw}
                onChange={setCurrentPw}
                placeholder="Enter current password"
                disabled={pwSaving}
              />
            </Field>
            <Field label="New Password" hint="Minimum 6 characters.">
              <TextInput
                type="password"
                value={newPw}
                onChange={setNewPw}
                placeholder="Enter new password"
                disabled={pwSaving}
              />
            </Field>
            <Field label="Confirm New Password">
              <TextInput
                type="password"
                value={confirmPw}
                onChange={setConfirmPw}
                placeholder="Re-enter new password"
                disabled={pwSaving}
              />
            </Field>

            {/* Password match indicator */}
            {newPw && confirmPw && (
              <p style={{
                fontSize: 12, marginTop: -10, marginBottom: 16,
                color: newPw === confirmPw ? '#15803d' : '#dc2626',
                fontWeight: 600,
              }}>
                {newPw === confirmPw ? '✓ Passwords match' : '✗ Passwords do not match'}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <SaveBtn loading={pwSaving} label="Change Password" />
            </div>
          </form>
        </Section>

      </div>
    </AppShell>
  );
}
