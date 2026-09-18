import { useState, useEffect, useMemo } from 'react';
import AppShell from '../components/common/AppShell';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { updateProfile, changePassword, getCodeHistory } from '../services/api';
import {
  Card, RichStat, ActivityHeatmap, LanguageDonut, TopicProgress,
  Achievements, DailyGoal, SummaryStrip,
} from '../components/Dashboard/DashboardWidgets';

/* ── tiny reusable form pieces (unchanged behaviour) ── */
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

/* ── password input with show/hide toggle ── */
function PasswordInput({ value, onChange, placeholder, disabled }) {
  const [focus, setFocus] = useState(false);
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{ ...inputStyle(focus), paddingRight: 38 }}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        tabIndex={-1}
        title={show ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          border: 'none', background: 'transparent', cursor: 'pointer',
          fontSize: 14, color: '#94a3b8', padding: 4, lineHeight: 1,
        }}
      >{show ? '🙈' : '👁'}</button>
    </div>
  );
}

/* ── password strength meter (client-side heuristic, no new deps) ── */
function passwordStrength(pw) {
  if (!pw) return { score: 0, label: '', color: '#e2e8f0' };
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = [
    { label: 'Very weak', color: '#E15759' },
    { label: 'Weak', color: '#E15759' },
    { label: 'Fair', color: '#F2A93B' },
    { label: 'Good', color: '#3B82C4' },
    { label: 'Strong', color: '#4CAF50' },
    { label: 'Very strong', color: '#15803d' },
  ];
  return { score, ...levels[Math.min(score, levels.length - 1)] };
}

function StrengthMeter({ pw }) {
  if (!pw) return null;
  const { score, label, color } = passwordStrength(pw);
  return (
    <div style={{ marginTop: -10, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{
            height: 4, flex: 1, borderRadius: 2,
            background: i < score ? color : '#e2e8f0', transition: 'background 200ms',
          }} />
        ))}
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color }}>{label}</span>
    </div>
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
function Avatar({ name, size = 72, ring }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg,#3B82C4,#1F4E79)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color: '#fff', flexShrink: 0,
      border: ring ? `3px solid ${ring}` : 'none',
      boxShadow: '0 4px 14px rgba(31,78,121,.35)',
    }}>{initials}</div>
  );
}

function Badge({ children, color = '#2E74B5', bg = '#EFF6FF', border = '#bfdbfe' }) {
  return (
    <span style={{
      padding: '3px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
      background: bg, color, border: `1px solid ${border}`,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>{children}</span>
  );
}

const STRUCT_ICONS = {
  'linked-list': '⛓', 'doubly-linked-list': '⇌', 'array': '▦', 'stack': '📚',
  'queue': '🚦', 'bst': '🌲', 'avl-tree': '⚖', 'graph': '🕸', 'hashing': '#',
  'heap': '⛰', 'trie': '🔤', 'dynamic-programming': '🧮', 'segment-tree': '📊',
  'red-black-tree': '🔴', 'circular-linked-list': '↻',
};

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dateKey(d) { return new Date(d).toISOString().slice(0, 10); }

/* compute current + longest streak from real CreatedAt dates */
function computeStreaks(history) {
  const daySet = new Set(history.filter(h => h.CreatedAt).map(h => dateKey(h.CreatedAt)));
  if (daySet.size === 0) return { current: 0, longest: 0 };

  const days = [...daySet].sort();
  let longest = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]), cur = new Date(days[i]);
    const diff = Math.round((cur - prev) / 86400000);
    run = diff === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let cursor = new Date(today);
  if (!daySet.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1); // allow "yesterday" to keep streak alive
  let current = 0;
  while (daySet.has(dateKey(cursor))) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, longest };
}

/* ═══════════════════════════════════════════════════
   PROFILE / DASHBOARD PAGE
   ═══════════════════════════════════════════════════ */
export default function Profile() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    getCodeHistory({ limit: 100 })
      .then(res => setHistory(res.data.history || []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  const stats = useMemo(() => {
    if (history.length === 0) {
      return { total: 0, modules: 0, language: '—', lastActive: null, currentStreak: 0, longestStreak: 0, languageCount: 0, todayCount: 0 };
    }
    const modules = new Set(history.map(h => h.ModuleSlug).filter(Boolean));
    const langCounts = {};
    history.forEach(h => { if (h.Language) langCounts[h.Language] = (langCounts[h.Language] || 0) + 1; });
    const topLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    const lastActive = history.map(h => h.CreatedAt).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0];
    const { current, longest } = computeStreaks(history);
    const todayKey = dateKey(new Date());
    const todayCount = history.filter(h => h.CreatedAt && dateKey(h.CreatedAt) === todayKey).length;
    return {
      total: history.length, modules: modules.size, language: topLang, lastActive,
      currentStreak: current, longestStreak: longest, languageCount: Object.keys(langCounts).length,
      todayCount,
    };
  }, [history]);

  const recent = useMemo(() => history.slice(0, 5), [history]);

  /* ── Update Name ── */
  const [fullName, setFullName] = useState(user?.FullName || '');
  const [nameAlert, setNameAlert] = useState({ type: '', msg: '' });
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
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwAlert, setPwAlert] = useState({ type: '', msg: '' });
  const [pwSaving, setPwSaving] = useState(false);

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

  const colStyle = { display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 };

  return (
    <AppShell>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 24px 48px' }}>

        {/* ── Profile hero banner ── */}
        <div style={{
          background: 'linear-gradient(135deg,#1F4E79 0%,#2E74B5 60%,#3B82C4 100%)',
          borderRadius: 20, padding: '30px 28px', marginBottom: 20,
          position: 'relative', overflow: 'hidden',
          boxShadow: '0 8px 28px rgba(31,78,121,.28)',
        }}>
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(circle at 85% 15%, rgba(255,255,255,.14) 0%, transparent 55%), repeating-linear-gradient(45deg, transparent, transparent 22px, rgba(255,255,255,.035) 22px, rgba(255,255,255,.035) 44px)',
          }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <Avatar name={user?.FullName} size={76} ring="rgba(255,255,255,.5)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{user?.FullName}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.75)', marginBottom: 4 }}>{user?.Email}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', fontStyle: 'italic', marginBottom: 12 }}>
                "Code. Learn. Solve. Repeat."
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {user?.Role === 'admin' && (
                  <Badge color="#fff" bg="rgba(255,255,255,.16)" border="rgba(255,255,255,.35)">🛡 Admin</Badge>
                )}
                {user?.IsPremium ? (
                  <Badge color="#fff" bg="rgba(255,255,255,.16)" border="rgba(255,255,255,.35)">⭐ {user?.SubscriptionPlan || 'Premium'}</Badge>
                ) : (
                  <Badge color="#fff" bg="rgba(255,255,255,.16)" border="rgba(255,255,255,.35)">Free Plan</Badge>
                )}
                <Badge color="#fff" bg="rgba(255,255,255,.16)" border="rgba(255,255,255,.35)">
                  Member since {user?.CreatedAt ? new Date(user.CreatedAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'}
                </Badge>
              </div>
            </div>
            <button
              onClick={() => document.getElementById('update-name-card')?.scrollIntoView({ behavior: 'smooth' })}
              style={{
                padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,.4)',
                background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', whiteSpace: 'nowrap', backdropFilter: 'blur(4px)',
              }}
            >✏️ Edit Profile</button>
          </div>
        </div>

        {/* ── Stat tiles ── */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <RichStat icon="📄" label="Saved Snippets" value={historyLoading ? '—' : stats.total} accent="#2E74B5" />
          <RichStat icon="🧩" label="Modules Practiced" value={historyLoading ? '—' : stats.modules} accent="#4CAF50" />
          <RichStat icon="🔥" label="Current Streak" value={historyLoading ? '—' : `${stats.currentStreak}d`} accent="#E15759" sub={historyLoading ? '' : `Longest: ${stats.longestStreak}d`} />
          <RichStat icon="💻" label="Top Language" value={historyLoading ? '—' : stats.language} accent="#8b5cf6" />
          <RichStat icon="🕒" label="Last Active" value={historyLoading ? '—' : timeAgo(stats.lastActive)} accent="#F2A93B" />
        </div>

        {/* ── Two-column dashboard grid ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)', gap: 20,
        }}
          className="profile-dashboard-grid"
        >
          {/* LEFT COLUMN */}
          <div style={colStyle}>
            <Card
              title="Recent Activity"
              subtitle="Your most recently saved code snippets."
              icon="🕘"
              right={<Badge color="#64748b" bg="#f1f5f9" border="#e2e8f0">{history.length} total</Badge>}
            >
              {historyLoading ? (
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Loading activity…</p>
              ) : recent.length === 0 ? (
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                  No saved snippets yet — save code from the Workspace to see it here.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recent.map(h => (
                    <div
                      key={h.SnippetId}
                      onClick={() => navigate(`/workspace?module=${h.ModuleSlug}`)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 12px', borderRadius: 10, border: '1px solid #f1f5f9',
                        cursor: 'pointer', transition: 'background 120ms',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{
                        width: 32, height: 32, borderRadius: 8, background: '#EFF6FF',
                        border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 15, flexShrink: 0,
                      }}>{STRUCT_ICONS[h.ModuleSlug] || '◈'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {h.Title || h.ModuleSlug}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{h.Language} · {h.ModuleSlug}</div>
                      </div>
                      <span style={{ fontSize: 11.5, color: '#94a3b8', flexShrink: 0 }}>{timeAgo(h.CreatedAt)}</span>
                    </div>
                  ))}
                  {history.length > 5 && (
                    <button
                      onClick={() => navigate('/workspace')}
                      style={{
                        alignSelf: 'flex-end', marginTop: 4, border: 'none', background: 'transparent',
                        color: '#2E74B5', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                      }}
                    >View All →</button>
                  )}
                </div>
              )}
            </Card>

            <Card title="Contribution Activity" subtitle="Snippets saved over the last 12 months." icon="📈">
              {historyLoading ? (
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Loading…</p>
              ) : (
                <ActivityHeatmap history={history} />
              )}
            </Card>

            <div id="update-name-card">
              <Card title="Update Name" subtitle="Change how your name appears across the platform." icon="✏️">
                <form onSubmit={handleUpdateName}>
                  <Alert type={nameAlert.type} message={nameAlert.msg} />
                  <Field label="Full Name">
                    <TextInput value={fullName} onChange={setFullName} placeholder="Enter your full name" disabled={nameSaving} />
                  </Field>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <SaveBtn loading={nameSaving} />
                  </div>
                </form>
              </Card>
            </div>

            <Card title="Change Password" subtitle="Use a strong password you don't use elsewhere." icon="🔒">
              <form onSubmit={handleChangePassword}>
                <Alert type={pwAlert.type} message={pwAlert.msg} />
                <Field label="Current Password">
                  <PasswordInput value={currentPw} onChange={setCurrentPw} placeholder="Enter current password" disabled={pwSaving} />
                </Field>
                <Field label="New Password" hint="Minimum 6 characters.">
                  <PasswordInput value={newPw} onChange={setNewPw} placeholder="Enter new password" disabled={pwSaving} />
                </Field>
                <StrengthMeter pw={newPw} />
                <Field label="Confirm New Password">
                  <PasswordInput value={confirmPw} onChange={setConfirmPw} placeholder="Re-enter new password" disabled={pwSaving} />
                </Field>

                {newPw && confirmPw && (
                  <p style={{
                    fontSize: 12, marginTop: -10, marginBottom: 16,
                    color: newPw === confirmPw ? '#15803d' : '#dc2626', fontWeight: 600,
                  }}>
                    {newPw === confirmPw ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </p>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <SaveBtn loading={pwSaving} label="Change Password" />
                </div>
              </form>
            </Card>
          </div>

          {/* RIGHT COLUMN */}
          <div style={colStyle}>
            <Card title="Daily Coding Goal" icon="🎯">
              {historyLoading ? <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Loading…</p> : <DailyGoal todayCount={stats.todayCount} />}
            </Card>

            <Card title="Language Distribution" subtitle="Based on your saved snippets." icon="🧬">
              {historyLoading ? <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Loading…</p> : <LanguageDonut history={history} />}
            </Card>

            <Card title="DSA Topic Practice" subtitle="Relative practice level per topic, from your snippets." icon="📊">
              {historyLoading ? <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Loading…</p> : <TopicProgress history={history} />}
            </Card>

            <Card title="Achievements" icon="🏆">
              {historyLoading ? <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Loading…</p> : <Achievements stats={stats} />}
            </Card>

            <Card title="Progress Summary" icon="📌">
              {historyLoading ? <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Loading…</p> : (
                <SummaryStrip items={[
                  { label: 'Total Snippets', value: stats.total },
                  { label: 'DSA Modules', value: stats.modules },
                  { label: 'Current Streak', value: `${stats.currentStreak}d` },
                  { label: 'Longest Streak', value: `${stats.longestStreak}d` },
                ]} />
              )}
            </Card>
          </div>
        </div>

        <style>{`
          @media (max-width: 900px) {
            .profile-dashboard-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </AppShell>
  );
}
