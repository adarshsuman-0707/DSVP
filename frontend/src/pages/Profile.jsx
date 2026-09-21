import { useState, useEffect, useMemo } from 'react';
import AppShell from '../components/common/AppShell';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { updateProfile, changePassword, getCodeHistory, loadCodeHistory } from '../services/api';
import {
  Card, RichStat, ActivityHeatmap, LanguageDonut, TopicProgress,
  Achievements, DailyGoal, SummaryStrip, StreakCalendar, activityYears, StreakRiskAlert,
} from '../components/Dashboard/DashboardWidgets';

/* ── tiny reusable form pieces (unchanged behaviour) ── */
function Field({ label, children, hint, T }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{
        display: 'block', fontSize: 13, fontWeight: 600,
        color: T.textSecondary, marginBottom: 6,
      }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

const inputStyle = (focus, T) => ({
  width: '100%', padding: '9px 13px', borderRadius: 9,
  border: `1.5px solid ${focus ? T.accent : T.border}`,
  fontSize: 14, outline: 'none', background: focus ? T.card : T.inputBg,
  boxSizing: 'border-box', fontFamily: 'inherit', transition: 'all 150ms',
  color: T.text,
});

function TextInput({ value, onChange, placeholder, disabled, type = 'text', T }) {
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
      style={inputStyle(focus, T)}
    />
  );
}

/* ── password input with show/hide toggle ── */
function PasswordInput({ value, onChange, placeholder, disabled, T }) {
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
        style={{ ...inputStyle(focus, T), paddingRight: 38 }}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        tabIndex={-1}
        title={show ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          border: 'none', background: 'transparent', cursor: 'pointer',
          fontSize: 14, color: T.textMuted, padding: 4, lineHeight: 1,
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

function StrengthMeter({ pw, T }) {
  if (!pw) return null;
  const { score, label, color } = passwordStrength(pw);
  return (
    <div style={{ marginTop: -10, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{
            height: 4, flex: 1, borderRadius: 2,
            background: i < score ? color : T.divider, transition: 'background 200ms',
          }} />
        ))}
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color }}>{label}</span>
    </div>
  );
}

function Alert({ type, message, T }) {
  if (!message) return null;
  const cfg = {
    success: T.mode === 'dark'
      ? { bg: 'rgba(76,175,80,.12)', border: 'rgba(76,175,80,.35)', color: '#4ade80', icon: '✓' }
      : { bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', icon: '✓' },
    error: T.mode === 'dark'
      ? { bg: 'rgba(225,87,89,.12)', border: 'rgba(225,87,89,.35)', color: '#f87171', icon: '⚠' }
      : { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', icon: '⚠' },
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
  const { T } = useTheme();
  const navigate = useNavigate();

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [heatmapYear, setHeatmapYear] = useState(new Date().getFullYear());

  useEffect(() => {
    getCodeHistory({ page: 1, pageSize: 100 })
      .then(res => setHistory(res.data.data || []))
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

  // Recent Activity / snippet rows only carry list metadata (no Code
  // field) — fetch the full saved snippet, then hand it to Workspace via
  // router state so it opens with the actual saved code, language, and
  // module preselected (the same mechanism SavedSnippets.jsx's "Open"
  // button uses), instead of just linking to ?module=slug and landing on
  // that module's generic starter template in the default language.
  const [openingSnippetId, setOpeningSnippetId] = useState(null);
  async function handleOpenSnippet(h) {
    setOpeningSnippetId(h.SnippetId);
    try {
      const res = await loadCodeHistory(h.SnippetId);
      navigate('/workspace', { state: { loadedSnippet: res.data.snippet } });
    } catch {
      navigate(`/workspace?module=${h.ModuleSlug}`); // fall back to the old behavior if the fetch fails
    } finally {
      setOpeningSnippetId(null);
    }
  }

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
      <div className="dsvp-page-fade" style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 24px 48px' }}>

        {/* ── Profile hero banner ── */}
        <div style={{
          background: 'linear-gradient(135deg,#1F4E79 0%,#2E74B5 60%,#3B82C4 100%)',
          backgroundSize: '200% 200%',
          animation: 'dsvp-hero-gradient 12s ease-in-out infinite',
          borderRadius: 20, padding: '30px 28px', marginBottom: 20,
          position: 'relative', overflow: 'hidden',
          boxShadow: '0 8px 28px rgba(31,78,121,.28)',
        }}>
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(circle at 85% 15%, rgba(255,255,255,.14) 0%, transparent 55%), repeating-linear-gradient(45deg, transparent, transparent 22px, rgba(255,255,255,.035) 22px, rgba(255,255,255,.035) 44px)',
          }} />
          {/* soft floating particles — purely decorative, GPU-cheap (transform+opacity only) */}
          {[
            { top: '15%', left: '8%', size: 5, dur: '9s', delay: '0s' },
            { top: '65%', left: '18%', size: 3, dur: '11s', delay: '1.5s' },
            { top: '30%', left: '92%', size: 4, dur: '10s', delay: '.5s' },
            { top: '75%', left: '82%', size: 6, dur: '13s', delay: '2s' },
            { top: '50%', left: '55%', size: 3, dur: '8s', delay: '3s' },
          ].map((p, i) => (
            <span key={i} style={{
              position: 'absolute', top: p.top, left: p.left, width: p.size, height: p.size,
              borderRadius: '50%', background: 'rgba(255,255,255,.5)', pointerEvents: 'none',
              animation: `dsvp-particle-float ${p.dur} ease-in-out ${p.delay} infinite`,
            }} />
          ))}
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
          <RichStat T={T} delay={0} icon="📄" label="Saved Snippets" value={historyLoading ? '—' : stats.total} accent="#2E74B5" onClick={() => navigate('/snippets')} />
          <RichStat T={T} delay={40} icon="🧩" label="Modules Practiced" value={historyLoading ? '—' : stats.modules} accent="#4CAF50" onClick={() => navigate('/dashboard')} />
          <RichStat T={T} delay={80} icon="🔥" label="Current Streak" value={historyLoading ? '—' : stats.currentStreak} sub={historyLoading ? '' : `Longest: ${stats.longestStreak}d`} accent="#E15759" onClick={() => document.getElementById('streak-calendar-card')?.scrollIntoView({ behavior: 'smooth' })} />
          <RichStat T={T} delay={120} icon="💻" label="Top Language" value={historyLoading ? '—' : stats.language} accent="#8b5cf6" />
          <RichStat T={T} delay={160} icon="🕒" label="Last Active" value={historyLoading ? '—' : timeAgo(stats.lastActive)} accent="#F2A93B" />
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
              T={T}
              delay={0}
              title="Recent Activity"
              subtitle="Your most recently saved code snippets."
              icon="🕘"
              right={<Badge color={T.textSecondary} bg={T.chipBg} border={T.border}>{history.length} total</Badge>}
            >
              {historyLoading ? (
                <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>Loading activity…</p>
              ) : recent.length === 0 ? (
                <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>
                  No saved snippets yet — save code from the Workspace to see it here.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recent.map(h => (
                    <div
                      key={h.SnippetId}
                      onClick={() => handleOpenSnippet(h)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.divider}`,
                        cursor: openingSnippetId === h.SnippetId ? 'wait' : 'pointer',
                        opacity: openingSnippetId && openingSnippetId !== h.SnippetId ? 0.6 : 1,
                        transition: 'background 120ms, opacity 120ms',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = T.hoverBg; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{
                        width: 32, height: 32, borderRadius: 8, background: T.chipBg,
                        border: `1px solid ${T.chipBorder}`, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 15, flexShrink: 0,
                      }}>{STRUCT_ICONS[h.ModuleSlug] || '◈'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {h.Title || h.ModuleSlug}
                        </div>
                        <div style={{ fontSize: 11.5, color: T.textMuted }}>{h.Language} · {h.ModuleSlug}</div>
                      </div>
                      <span style={{ fontSize: 11.5, color: T.textMuted, flexShrink: 0 }}>{timeAgo(h.CreatedAt)}</span>
                    </div>
                  ))}
                  {history.length > 5 && (
                    <button
                      onClick={() => navigate('/snippets')}
                      className="dsvp-view-all"
                      style={{
                        alignSelf: 'flex-end', marginTop: 4, border: 'none', background: 'transparent',
                        color: T.accent, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >View All <span className="dsvp-view-all-arrow">→</span></button>
                  )}
                </div>
              )}
            </Card>

            <Card
              T={T} delay={60} title="Contribution Activity"
              subtitle={`Snippets saved in ${heatmapYear}.`} icon="📈"
              right={!historyLoading && (
                <select
                  value={heatmapYear}
                  onChange={e => setHeatmapYear(Number(e.target.value))}
                  style={{
                    padding: '6px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                    border: `1.5px solid ${T.border}`, background: T.inputBg, color: T.text,
                    outline: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {activityYears(history).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
            >
              {historyLoading ? (
                <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>Loading…</p>
              ) : (
                <ActivityHeatmap history={history} T={T} year={heatmapYear} />
              )}
            </Card>

            <div id="update-name-card">
              <Card T={T} delay={120} title="Update Name" subtitle="Change how your name appears across the platform." icon="✏️">
                <form onSubmit={handleUpdateName}>
                  <Alert type={nameAlert.type} message={nameAlert.msg} T={T} />
                  <Field label="Full Name" T={T}>
                    <TextInput value={fullName} onChange={setFullName} placeholder="Enter your full name" disabled={nameSaving} T={T} />
                  </Field>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <SaveBtn loading={nameSaving} />
                  </div>
                </form>
              </Card>
            </div>

            <Card T={T} delay={180} title="Change Password" subtitle="Use a strong password you don't use elsewhere." icon="🔒">
              <form onSubmit={handleChangePassword}>
                <Alert type={pwAlert.type} message={pwAlert.msg} T={T} />
                <Field label="Current Password" T={T}>
                  <PasswordInput value={currentPw} onChange={setCurrentPw} placeholder="Enter current password" disabled={pwSaving} T={T} />
                </Field>
                <Field label="New Password" hint="Minimum 6 characters." T={T}>
                  <PasswordInput value={newPw} onChange={setNewPw} placeholder="Enter new password" disabled={pwSaving} T={T} />
                </Field>
                <StrengthMeter pw={newPw} T={T} />
                <Field label="Confirm New Password" T={T}>
                  <PasswordInput value={confirmPw} onChange={setConfirmPw} placeholder="Re-enter new password" disabled={pwSaving} T={T} />
                </Field>

                {newPw && confirmPw && (
                  <p style={{
                    fontSize: 12, marginTop: -10, marginBottom: 16,
                    color: newPw === confirmPw ? '#4ade80' : '#f87171', fontWeight: 600,
                  }}>
                    {newPw === confirmPw ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </p>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <SaveBtn loading={pwSaving} label="Change Password" />
                </div>
              </form>
            </Card>

            <Card T={T} delay={210} title="Achievements" icon="🏆">
              {historyLoading ? <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>Loading…</p> : <Achievements stats={stats} T={T} />}
            </Card>
          </div>

          {/* RIGHT COLUMN */}
          <div style={colStyle}>
            {!historyLoading && stats.currentStreak > 0 && stats.todayCount === 0 && (
              <StreakRiskAlert currentStreak={stats.currentStreak} T={T} onPractice={() => navigate('/dashboard')} />
            )}

            <Card T={T} delay={20} title="Daily Coding Goal" icon="🎯">
              {historyLoading ? <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>Loading…</p> : (
                <DailyGoal todayCount={stats.todayCount} T={T} onStartPracticing={() => navigate('/dashboard')} />
              )}
            </Card>

            <div id="streak-calendar-card">
              <Card T={T} delay={50} title="Streak Calendar" subtitle="Your practice activity this week." icon="🗓️">
                {historyLoading ? <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>Loading…</p> : (
                  <StreakCalendar history={history} currentStreak={stats.currentStreak} longestStreak={stats.longestStreak} T={T} onAction={() => navigate('/dashboard')} />
                )}
              </Card>
            </div>

            <Card T={T} delay={80} title="Language Distribution" subtitle="Based on your saved snippets." icon="🧬">
              {historyLoading ? <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>Loading…</p> : <LanguageDonut history={history} T={T} />}
            </Card>

            <Card T={T} delay={110} title="DSA Topic Practice" subtitle="Relative practice level per topic, from your snippets." icon="📊">
              {historyLoading ? <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>Loading…</p> : <TopicProgress history={history} T={T} />}
            </Card>

            <Card T={T} delay={240} title="Progress Summary" icon="📌">
              {historyLoading ? <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>Loading…</p> : (
                <>
                  <SummaryStrip T={T} items={[
                    { label: 'Total Snippets', value: stats.total },
                    { label: 'DSA Modules', value: stats.modules },
                    { label: 'Current Streak', value: `${stats.currentStreak}d` },
                    { label: 'Longest Streak', value: `${stats.longestStreak}d` },
                  ]} />
                  <p style={{
                    fontSize: 11.5, color: T.textMuted, fontStyle: 'italic', textAlign: 'center',
                    margin: '14px 0 0', paddingTop: 12, borderTop: `1px solid ${T.divider}`,
                  }}>"Keep coding. Keep improving."</p>
                </>
              )}
            </Card>
          </div>
        </div>

        <style>{`
          @media (max-width: 900px) {
            .profile-dashboard-grid { grid-template-columns: 1fr !important; }
          }
          .dsvp-view-all-arrow { display: inline-block; transition: transform 150ms ease; }
          .dsvp-view-all:hover .dsvp-view-all-arrow { transform: translateX(3px); }
          .dsvp-page-fade { animation: dsvp-page-fade-in 400ms ease both; }
          @keyframes dsvp-page-fade-in { from { opacity: 0; } to { opacity: 1; } }
          @keyframes dsvp-hero-gradient {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }
          @keyframes dsvp-particle-float {
            0%, 100% { transform: translateY(0) translateX(0); opacity: .5; }
            50% { transform: translateY(-14px) translateX(6px); opacity: .9; }
          }
        `}</style>
      </div>
    </AppShell>
  );
}
