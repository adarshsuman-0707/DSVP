import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import FeedbackModal from './FeedbackModal';
import NotificationBell from './NotificationBell';
import { getCoinWallet } from '../../services/api';

/* ── nav items ── */
const NAV = [
  { to: '/dashboard',  icon: '⊞', label: 'Modules',        tour: 'tour-modules' },
  { to: '/workspace',  icon: '⌨', label: 'Workspace',       tour: 'tour-workspace' },
  { to: '/snippets',   icon: '💾', label: 'Saved Snippets', tour: 'tour-snippets' },
  { to: '/coins',      icon: '🪙', label: 'Coins',          tour: 'tour-coins' },
  { to: '/payments',   icon: '💳', label: 'Payments',       tour: 'tour-payments' },
  { to: '/profile',    icon: '👤', label: 'Profile',        tour: 'tour-profile' },
];

/* guided-tour steps — filtered at runtime (e.g. coin pill only if unlocked) */
const TOUR_STEPS_BASE = [
  { id: 'tour-modules',  title: 'Module Catalog', desc: 'Browse DSA topics — arrays, linked lists, trees, graphs and more. Pick one to start visualizing.' },
  { id: 'tour-workspace', title: 'Workspace', desc: 'Write your own code and watch it animate step-by-step — see exactly how loops, recursion and pointers move through your data structure.' },
  { id: 'tour-snippets', title: 'Saved Snippets', desc: 'Every piece of code you save lives here — reopen and rerun it anytime.' },
  { id: 'tour-coins', title: 'DSVP Coins', desc: 'Buy your first plan to unlock coins. Earn more on renewals and redeem them for plan discounts or temporary module unlocks.' },
  { id: 'tour-payments', title: 'Payments', desc: 'Your full billing history — every order, its status and amount.' },
  { id: 'tour-profile', title: 'Profile', desc: 'Your account details, plan and stats live here.' },
  { id: 'tour-search', title: 'Quick Search', desc: 'Press Ctrl+K anytime to jump straight to any page, from anywhere in the app.' },
  { id: 'tour-coinpill', title: 'Coin Balance', desc: 'Your live coin balance. Watch it pop up with a "+N" animation the moment you earn more coins.' },
  { id: 'tour-feedback', title: 'Feedback', desc: 'Found a bug or have an idea? Send feedback straight to the team from here.' },
  { id: 'tour-bell', title: 'Notifications', desc: "Get notified the moment there's a reply or status update on feedback you've submitted." },
  { id: 'tour-theme', title: 'Theme', desc: 'Switch between light and dark mode, whenever you like.' },
];

function tourTooltipStyle(rect) {
  const sidebar = rect.left < 260;
  if (sidebar) {
    const top = Math.min(Math.max(rect.top - 10, 12), window.innerHeight - 220);
    return { top, left: rect.right + 18 };
  }
  const top = rect.bottom + 14;
  const right = Math.max(16, window.innerWidth - rect.right);
  return { top, right };
}
const ADMIN_NAV = [
  { to: '/admin', icon: '⚙', label: 'Admin'  },
];

/* quick-nav palette entries — only real routes, nothing fabricated */
const QUICK_NAV = [
  { to: '/dashboard', icon: '⊞', label: 'Module Catalog',  hint: 'Browse DSA modules' },
  { to: '/workspace', icon: '⌨', label: 'Workspace',       hint: 'Visualize & code' },
  { to: '/snippets',  icon: '💾', label: 'Saved Snippets',  hint: 'Your saved code' },
  { to: '/coins',     icon: '🪙', label: 'DSVP Coins',      hint: 'Earn & redeem coins' },
  { to: '/payments',  icon: '💳', label: 'Payment History', hint: 'Billing & plan' },
  { to: '/profile',   icon: '👤', label: 'Profile',         hint: 'Stats & settings' },
];

function QuickNav({ open, onClose, T }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  useEffect(() => { if (!open) setQ(''); }, [open]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const results = QUICK_NAV.filter(n =>
    !q.trim() || n.label.toLowerCase().includes(q.toLowerCase()) || n.hint.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh',
        animation: 'dsvp-modal-fade 150ms ease both',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(520px, 90vw)', background: T.card, borderRadius: 14,
          border: `1px solid ${T.border}`, boxShadow: T.glow, overflow: 'hidden',
          animation: 'dsvp-modal-pop 180ms cubic-bezier(.16,1,.3,1) both',
        }}
      >
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search modules, workspace, snippets, payments, profile…"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '14px 18px', fontSize: 14,
            border: 'none', borderBottom: `1px solid ${T.border}`, outline: 'none',
            background: 'transparent', color: T.text,
          }}
        />
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: 6 }}>
          {results.length === 0 && (
            <div style={{ padding: '18px 14px', fontSize: 13, color: T.textMuted }}>No matches.</div>
          )}
          {results.map(n => (
            <div
              key={n.to}
              onClick={() => { navigate(n.to); onClose(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                borderRadius: 9, cursor: 'pointer', transition: 'background 120ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = T.hoverBg; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 16 }}>{n.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{n.label}</div>
                <div style={{ fontSize: 11, color: T.textMuted }}>{n.hint}</div>
              </div>
              <span style={{ fontSize: 11, color: T.textMuted }}>↵</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NavItem({ to, icon, label, collapsed, T, badge, tour }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link
      to={to}
      data-tour={tour}
      title={collapsed ? label : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: collapsed ? '10px 0' : '10px 14px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 10, textDecoration: 'none',
        background: active ? `linear-gradient(90deg, ${T.accent}26, transparent)` : 'transparent',
        color: active ? T.accent : T.textSecondary,
        fontWeight: active ? 600 : 400,
        fontSize: 14,
        transition: 'all 150ms',
        borderLeft: active ? `3px solid ${T.accent}` : '3px solid transparent',
        boxShadow: active ? `inset 0 0 0 1px ${T.accent}22` : 'none',
        marginBottom: 2,
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = T.hoverBg;
          e.currentTarget.style.color = T.text;
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = T.textSecondary;
        }
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
      {!collapsed && badge}
    </Link>
  );
}

export default function AppShell({ children }) {
  const { user, logout, updateUser } = useAuth();
  const { T, mode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [quickNavOpen, setQuickNavOpen] = useState(false);
  const [coinPop, setCoinPop] = useState(null); // { amount } — floats up then clears

  // ── guided tour ──
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [tourRect, setTourRect] = useState(null);
  const tourSteps = TOUR_STEPS_BASE.filter(s => s.id !== 'tour-coinpill' || user?.CoinsUnlocked);

  // auto-start once per browser, for first-time users, after layout settles
  useEffect(() => {
    if (!user) return;
    if (localStorage.getItem('dsvp_tour_done')) return;
    const t = setTimeout(() => setTourActive(true), 900);
    return () => clearTimeout(t);
  }, [user?.UserId]);

  useEffect(() => {
    if (!tourActive) return;
    const id = tourSteps[tourStep]?.id;
    if (!id) return;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${id}"]`);
      if (el) setTourRect(el.getBoundingClientRect());
    };
    const t = setTimeout(measure, 240); // let sidebar width/collapse transition settle
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [tourActive, tourStep, collapsed]);

  function finishTour() {
    localStorage.setItem('dsvp_tour_done', '1');
    setTourActive(false);
    setTourStep(0);
    setTourRect(null);
  }
  function nextTourStep() {
    if (tourStep < tourSteps.length - 1) setTourStep(s => s + 1);
    else finishTour();
  }
  function startTour() {
    setTourStep(0);
    setTourActive(true);
  }

  // Poll the wallet so a coin award (module unlock, payment, streak, etc.)
  // shows up here without needing a full page reload — and triggers the
  // LeetCode-style "+N" pop the moment the balance goes up.
  useEffect(() => {
    if (!user?.CoinsUnlocked) return;
    let prevBalance = user?.CoinBalance ?? 0;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await getCoinWallet();
        const balance = res.data?.coinBalance;
        if (cancelled || balance == null) return;
        if (balance > prevBalance) {
          setCoinPop({ amount: balance - prevBalance });
          setTimeout(() => setCoinPop(null), 1800);
        }
        if (balance !== prevBalance) updateUser({ CoinBalance: balance });
        prevBalance = balance;
      } catch (_) { /* silent — non-critical background refresh */ }
    };
    const id = setInterval(poll, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user?.CoinsUnlocked]);

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickNavOpen(o => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sideW = collapsed ? 64 : 240;

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const initials = user?.FullName
    ? user.FullName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: T.bgGradient, transition: 'background 200ms' }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width: sideW, flexShrink: 0,
        height: '100vh', display: 'flex', flexDirection: 'column',
        background: T.sidebarBg, borderRight: `1px solid ${T.border}`,
        transition: 'width 200ms ease, background 200ms',
        overflow: 'hidden',
        boxShadow: mode === 'dark' ? '2px 0 12px rgba(0,0,0,.25)' : '2px 0 8px rgba(0,0,0,.04)',
        zIndex: 50,
      }}>

        {/* brand */}
        <div style={{
          height: 60, display: 'flex', alignItems: 'center',
          padding: collapsed ? '0 14px' : '0 18px',
          justifyContent: collapsed ? 'center' : 'space-between',
          borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        }}>
          {!collapsed && (
            <Link to="/dashboard" style={{
              display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none',
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: 'linear-gradient(135deg,#2E74B5,#4CAF50)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 800, color: '#fff', flexShrink: 0,
                boxShadow: mode === 'dark' ? '0 0 12px rgba(59,130,196,.5)' : 'none',
              }}>D</div>
              <span style={{ fontSize: 16, fontWeight: 700, color: T.accent }}>DSVP</span>
            </Link>
          )}
          <button onClick={() => setCollapsed(c => !c)} style={{
            width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`,
            background: T.cardAlt, cursor: 'pointer', fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.textSecondary, transition: 'all 150ms', flexShrink: 0,
          }} title={collapsed ? 'Expand' : 'Collapse'} aria-label="Toggle sidebar">
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {/* nav */}
        <nav style={{ flex: 1, padding: '16px 10px', overflowY: 'auto' }}>
          {!collapsed && (
            <p style={{
              fontSize: 10, fontWeight: 700, color: T.textMuted,
              textTransform: 'uppercase', letterSpacing: '.08em',
              padding: '0 6px', marginBottom: 8,
            }}>Main</p>
          )}
          {NAV.map(n => (
            <NavItem key={n.to} {...n} tour={n.tour} collapsed={collapsed} T={T}
              badge={n.to === '/coins'
                ? (user?.CoinsUnlocked
                    ? <span style={{ fontSize: 10, fontWeight: 700, color: '#F2A93B' }}>{user?.CoinBalance ?? 0}</span>
                    : <span style={{ fontSize: 11, opacity: 0.6 }} title="Purchase a plan to unlock">🔒</span>)
                : null} />
          ))}

          {user?.Role === 'admin' && (
            <>
              {!collapsed && (
                <p style={{
                  fontSize: 10, fontWeight: 700, color: T.textMuted,
                  textTransform: 'uppercase', letterSpacing: '.08em',
                  padding: '0 6px', margin: '16px 0 8px',
                }}>Admin</p>
              )}
              {collapsed && <div style={{ borderTop: `1px solid ${T.border}`, margin: '12px 0' }} />}
              {ADMIN_NAV.map(n => <NavItem key={n.to} {...n} collapsed={collapsed} T={T} />)}
            </>
          )}
        </nav>

        {/* upgrade to premium */}
        {!user?.IsPremium && !collapsed && (
          <div style={{
            margin: '0 10px 14px', padding: '14px', borderRadius: 12,
            background: 'linear-gradient(135deg,#1F4E79,#2E74B5)',
            color: '#fff', flexShrink: 0,
            boxShadow: mode === 'dark' ? '0 0 22px rgba(46,116,181,.35)' : 'none',
            animation: mode === 'dark' ? 'dsvp-premium-glow 3.5s ease-in-out infinite' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
              <span>👑</span> Upgrade to Premium
            </div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.75)', margin: '0 0 10px' }}>
              Unlock unlimited practice, advanced analytics, and more.
            </p>
            <button
              onClick={() => navigate('/pricing')}
              style={{
                width: '100%', padding: '7px 0', borderRadius: 8, border: 'none',
                background: '#fff', color: '#1F4E79', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >Upgrade Now →</button>
          </div>
        )}

        {/* user footer */}
        <div style={{
          borderTop: `1px solid ${T.border}`,
          padding: collapsed ? '12px 0' : '12px',
          display: 'flex', alignItems: 'center',
          gap: 10, flexShrink: 0,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <div
            onClick={() => navigate('/profile')}
            title="View Profile"
            style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg,#1F4E79,#2E74B5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer',
            }}>{initials}</div>
          {!collapsed && (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: T.text,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{user?.FullName || 'User'}</div>
              <div style={{
                fontSize: 11, color: T.textMuted,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{user?.Email}</div>
              <div style={{
                display: 'inline-block', marginTop: 4,
                fontSize: 10, fontWeight: 700, letterSpacing: '.02em',
                padding: '2px 8px', borderRadius: 999, textTransform: 'capitalize',
                color: user?.SubscriptionPlan === 'premium' ? '#7C3AED' : user?.SubscriptionPlan === 'basic' ? '#2E74B5' : T.textMuted,
                background: user?.SubscriptionPlan === 'premium' ? 'rgba(124,58,237,.12)' : user?.SubscriptionPlan === 'basic' ? 'rgba(46,116,181,.12)' : T.cardAlt,
                border: `1px solid ${user?.SubscriptionPlan === 'premium' ? 'rgba(124,58,237,.3)' : user?.SubscriptionPlan === 'basic' ? 'rgba(46,116,181,.3)' : T.border}`,
              }}>{user?.SubscriptionPlan || 'free'}</div>
            </div>
          )}
          {!collapsed && (
            <button onClick={handleLogout} title="Log out" style={{
              width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`,
              background: T.cardAlt, cursor: 'pointer', fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: T.textMuted, transition: 'all 150ms', flexShrink: 0,
            }}
              onMouseEnter={e => { e.currentTarget.style.color = '#E15759'; e.currentTarget.style.borderColor = '#fecaca'; }}
              onMouseLeave={e => { e.currentTarget.style.color = T.textMuted; e.currentTarget.style.borderColor = T.border; }}
            >↩</button>
          )}
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* top bar */}
        <header style={{
          height: 60, flexShrink: 0, position: 'relative', zIndex: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', background: T.topbarBg,
          backdropFilter: 'blur(8px)',
          borderBottom: `1px solid ${T.border}`,
          boxShadow: mode === 'dark' ? '0 1px 3px rgba(0,0,0,.3)' : '0 1px 3px rgba(0,0,0,.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <Breadcrumb T={T} />
            <button
              data-tour="tour-search"
              onClick={() => setQuickNavOpen(true)}
              title="Quick navigation (Ctrl+K)"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.border}`,
                background: T.cardAlt, color: T.textMuted, fontSize: 12, cursor: 'pointer',
                transition: 'all 150ms', minWidth: 200,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.textSecondary; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textMuted; }}
            >
              <span>🔎</span>
              <span style={{ flex: 1, textAlign: 'left' }}>Search…</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
                background: T.mode === 'dark' ? 'rgba(255,255,255,.06)' : '#eef2f6', color: T.textMuted,
              }}>Ctrl+K</span>
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

            {/* Theme toggle */}
            <button
              data-tour="tour-theme"
              onClick={toggleTheme}
              title={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label="Toggle theme"
              style={{
                width: 34, height: 34, borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: T.cardAlt, border: `1px solid ${T.border}`,
                color: T.textSecondary, fontSize: 15, cursor: 'pointer',
                transition: 'all 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textSecondary; }}
            >
              {mode === 'dark' ? '☀️' : '🌙'}
            </button>

            {/* Coin balance pill — leetcode-style, with a floating "+N" pop
                whenever the poll above detects the balance went up. */}
            {user?.CoinsUnlocked && (
              <div data-tour="tour-coinpill" style={{ position: 'relative' }}>
                <button
                  onClick={() => navigate('/coins')}
                  title="DSVP Coins"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 999,
                    background: mode === 'dark' ? 'rgba(242,169,59,.12)' : '#FFF7ED',
                    border: `1px solid ${mode === 'dark' ? 'rgba(242,169,59,.3)' : '#fed7aa'}`,
                    color: '#F2A93B', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', transition: 'all 150ms',
                  }}
                >
                  <span style={{ fontSize: 14 }}>🪙</span>
                  {user?.CoinBalance ?? 0}
                </button>
                {coinPop && (
                  <span key={Date.now()} style={{
                    position: 'absolute', top: -6, left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: 12, fontWeight: 800, color: '#22C55E',
                    whiteSpace: 'nowrap', pointerEvents: 'none',
                    animation: 'dsvp-coin-pop 1.8s ease-out forwards',
                  }}>+{coinPop.amount} 🪙</span>
                )}
              </div>
            )}

            {/* Feedback Button */}
            <button
              data-tour="tour-feedback"
              onClick={() => setFeedbackOpen(true)}
              title="Send Feedback"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8,
                background: T.cardAlt, border: `1px solid ${T.border}`,
                color: T.textSecondary, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'all 150ms',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = T.chipBg;
                e.currentTarget.style.borderColor = T.accent;
                e.currentTarget.style.color = T.accent;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = T.cardAlt;
                e.currentTarget.style.borderColor = T.border;
                e.currentTarget.style.color = T.textSecondary;
              }}
            >
              <span style={{ fontSize: 14 }}>💬</span>
              Feedback
            </button>

            {/* Notification bell — shows status changes / replies on the
                user's own submitted feedback, which they otherwise have
                no way to discover. */}
            <span data-tour="tour-bell" style={{ display: 'inline-flex' }}>
              <NotificationBell />
            </span>

            {user?.Role === 'admin' && (
              <span style={{
                padding: '3px 10px', borderRadius: 999,
                background: '#FFF7ED', color: '#F2A93B',
                fontSize: 11, fontWeight: 700,
                border: '1px solid #fed7aa', textTransform: 'uppercase',
                letterSpacing: '.04em',
              }}>Admin</span>
            )}
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg,#1F4E79,#2E74B5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#fff',
            }}>{initials}</div>
          </div>
        </header>

        {/* page content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
          {children}
        </main>
      </div>

      {/* Feedback Modal */}
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      {/* Quick nav / Ctrl+K palette */}
      <QuickNav open={quickNavOpen} onClose={() => setQuickNavOpen(false)} T={T} />

      {/* Floating "Take a tour" button — bottom-right, replayable anytime */}
      {!tourActive && (
        <button
          onClick={startTour}
          title="Take a guided tour"
          aria-label="Take a guided tour"
          style={{
            position: 'fixed', right: 26, bottom: 26, zIndex: 300,
            width: 54, height: 54, borderRadius: '50%', border: 'none',
            background: 'linear-gradient(135deg,#F2A93B,#F97316)',
            color: '#fff', fontSize: 22, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 18px rgba(249,115,22,.45)',
            animation: 'dsvp-fab-float 2.6s ease-in-out infinite',
            transition: 'transform 150ms, box-shadow 150ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(249,115,22,.55)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(249,115,22,.45)'; }}
        >🎓</button>
      )}

      {/* Guided tour — spotlights each sidebar/topbar item in turn with a
          tooltip explaining what it does. Auto-runs once for new users,
          replayable anytime via the 🎓 topbar button. */}
      {tourActive && tourRect && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }}>
          <div
            onClick={finishTour}
            style={{
              position: 'fixed',
              top: tourRect.top - 6, left: tourRect.left - 6,
              width: tourRect.width + 12, height: tourRect.height + 12,
              borderRadius: 12,
              boxShadow: '0 0 0 9999px rgba(0,0,0,.6)',
              border: '2px solid #F2A93B',
              transition: 'all 280ms cubic-bezier(.4,0,.2,1)',
              cursor: 'default',
            }}
          />
          <div style={{
            position: 'fixed',
            ...tourTooltipStyle(tourRect),
            width: 270, background: T.card, color: T.text,
            borderRadius: 12, padding: '16px 18px',
            boxShadow: '0 16px 40px rgba(0,0,0,.35)',
            border: `1px solid ${T.border}`,
            animation: 'dsvp-tour-pop 240ms ease',
            transition: 'top 280ms ease, left 280ms ease, right 280ms ease',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#F2A93B', marginBottom: 6, letterSpacing: '.03em' }}>
              STEP {tourStep + 1} OF {tourSteps.length}
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 6, color: T.text }}>
              {tourSteps[tourStep].title}
            </div>
            <p style={{ fontSize: 12.5, color: T.textMuted, lineHeight: 1.55, margin: '0 0 14px' }}>
              {tourSteps[tourStep].desc}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={finishTour}
                style={{ fontSize: 11.5, color: T.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >Skip tour</button>
              <div style={{ display: 'flex', gap: 8 }}>
                {tourStep > 0 && (
                  <button
                    onClick={() => setTourStep(s => Math.max(0, s - 1))}
                    style={{
                      background: T.cardAlt, color: T.textSecondary, border: `1px solid ${T.border}`,
                      borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >Back</button>
                )}
                <button
                  onClick={nextTourStep}
                  style={{
                    background: '#F2A93B', color: '#fff', border: 'none',
                    borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}
                >{tourStep === tourSteps.length - 1 ? 'Finish' : 'Next'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes dsvp-premium-glow {
          0%, 100% { box-shadow: 0 0 22px rgba(46,116,181,.35); }
          50% { box-shadow: 0 0 34px rgba(139,92,246,.45); }
        }
        @keyframes dsvp-coin-pop {
          0% { opacity: 0; transform: translate(-50%, 4px) scale(.85); }
          15% { opacity: 1; transform: translate(-50%, -6px) scale(1.1); }
          70% { opacity: 1; transform: translate(-50%, -20px) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -32px) scale(1); }
        }
        @keyframes dsvp-fab-float {
          0%, 100% { transform: translateY(0); box-shadow: 0 6px 18px rgba(249,115,22,.45); }
          50% { transform: translateY(-6px); box-shadow: 0 10px 26px rgba(249,115,22,.6); }
        }
        @keyframes dsvp-tour-pop {
          from { opacity: 0; transform: translateY(-6px) scale(.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes dsvp-modal-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dsvp-modal-pop { from { opacity: 0; transform: translateY(-8px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  );
}

function Breadcrumb({ T }) {
  const { pathname } = useLocation();
  const map = {
    '/dashboard': { label: 'Module Catalog',  icon: '⊞' },
    '/workspace': { label: 'Workspace',        icon: '⌨' },
    '/snippets':  { label: 'Saved Snippets',   icon: '💾' },
    '/coins':     { label: 'DSVP Coins',       icon: '🪙' },
    '/payments':  { label: 'Payment History',  icon: '💳' },
    '/profile':   { label: 'Profile',          icon: '👤' },
    '/admin':     { label: 'Admin Dashboard',  icon: '⚙' },
  };
  const current = pathname.startsWith('/admin/users/')
    ? { label: 'User Detail', icon: '👥' }
    : (map[pathname] || { label: 'DSVP', icon: '⊞' });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 16 }}>{current.icon}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{current.label}</span>
    </div>
  );
}
