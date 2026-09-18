import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import FeedbackModal from './FeedbackModal';
import NotificationBell from './NotificationBell';

/* ── nav items ── */
const NAV = [
  { to: '/dashboard',  icon: '⊞', label: 'Modules'   },
  { to: '/workspace',  icon: '⌨', label: 'Workspace'  },
  { to: '/profile',    icon: '👤', label: 'Profile'    },
];
const ADMIN_NAV = [
  { to: '/admin', icon: '⚙', label: 'Admin'  },
];

function NavItem({ to, icon, label, collapsed }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: collapsed ? '10px 0' : '10px 14px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 10, textDecoration: 'none',
        background: active ? 'rgba(46,116,181,.15)' : 'transparent',
        color: active ? '#2E74B5' : '#64748b',
        fontWeight: active ? 600 : 400,
        fontSize: 14,
        transition: 'all 150ms',
        borderLeft: active ? '3px solid #2E74B5' : '3px solid transparent',
        marginBottom: 2,
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = '#f1f5f9';
          e.currentTarget.style.color = '#1e293b';
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#64748b';
        }
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const sideW = collapsed ? 64 : 240;

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const initials = user?.FullName
    ? user.FullName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f8fafc' }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width: sideW, flexShrink: 0,
        height: '100vh', display: 'flex', flexDirection: 'column',
        background: '#fff', borderRight: '1px solid #e2e8f0',
        transition: 'width 200ms ease', overflow: 'hidden',
        boxShadow: '2px 0 8px rgba(0,0,0,.04)',
        zIndex: 50,
      }}>

        {/* brand */}
        <div style={{
          height: 60, display: 'flex', alignItems: 'center',
          padding: collapsed ? '0 14px' : '0 18px',
          justifyContent: collapsed ? 'center' : 'space-between',
          borderBottom: '1px solid #e2e8f0', flexShrink: 0,
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
              }}>D</div>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#1F4E79' }}>DSVP</span>
            </Link>
          )}
          <button onClick={() => setCollapsed(c => !c)} style={{
            width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#f8fafc', cursor: 'pointer', fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#64748b', transition: 'all 150ms', flexShrink: 0,
          }} title={collapsed ? 'Expand' : 'Collapse'} aria-label="Toggle sidebar">
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {/* nav */}
        <nav style={{ flex: 1, padding: '16px 10px', overflowY: 'auto' }}>
          {!collapsed && (
            <p style={{
              fontSize: 10, fontWeight: 700, color: '#94a3b8',
              textTransform: 'uppercase', letterSpacing: '.08em',
              padding: '0 6px', marginBottom: 8,
            }}>Main</p>
          )}
          {NAV.map(n => <NavItem key={n.to} {...n} collapsed={collapsed} />)}

          {user?.Role === 'admin' && (
            <>
              {!collapsed && (
                <p style={{
                  fontSize: 10, fontWeight: 700, color: '#94a3b8',
                  textTransform: 'uppercase', letterSpacing: '.08em',
                  padding: '0 6px', margin: '16px 0 8px',
                }}>Admin</p>
              )}
              {collapsed && <div style={{ borderTop: '1px solid #e2e8f0', margin: '12px 0' }} />}
              {ADMIN_NAV.map(n => <NavItem key={n.to} {...n} collapsed={collapsed} />)}
            </>
          )}
        </nav>

        {/* upgrade to premium */}
        {!user?.IsPremium && !collapsed && (
          <div style={{
            margin: '0 10px 14px', padding: '14px', borderRadius: 12,
            background: 'linear-gradient(135deg,#1F4E79,#2E74B5)',
            color: '#fff', flexShrink: 0,
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
          borderTop: '1px solid #e2e8f0',
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
                fontSize: 13, fontWeight: 600, color: '#1e293b',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{user?.FullName || 'User'}</div>
              <div style={{
                fontSize: 11, color: '#94a3b8',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{user?.Email}</div>
            </div>
          )}
          {!collapsed && (
            <button onClick={handleLogout} title="Log out" style={{
              width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0',
              background: '#f8fafc', cursor: 'pointer', fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#94a3b8', transition: 'all 150ms', flexShrink: 0,
            }}
              onMouseEnter={e => { e.currentTarget.style.color = '#E15759'; e.currentTarget.style.borderColor = '#fecaca'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
            >↩</button>
          )}
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* top bar */}
        <header style={{
          height: 60, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,.04)',
        }}>
          <Breadcrumb />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Feedback Button */}
            <button
              onClick={() => setFeedbackOpen(true)}
              title="Send Feedback"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8,
                background: '#f8fafc', border: '1px solid #e2e8f0',
                color: '#64748b', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'all 150ms',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#EFF6FF';
                e.currentTarget.style.borderColor = '#2E74B5';
                e.currentTarget.style.color = '#2E74B5';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.color = '#64748b';
              }}
            >
              <span style={{ fontSize: 14 }}>💬</span>
              Feedback
            </button>

            {/* Notification bell — shows status changes / replies on the
                user's own submitted feedback, which they otherwise have
                no way to discover. */}
            <NotificationBell />

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
    </div>
  );
}

function Breadcrumb() {
  const { pathname } = useLocation();
  const map = {
    '/dashboard': { label: 'Module Catalog',  icon: '⊞' },
    '/workspace': { label: 'Workspace',        icon: '⌨' },
    '/profile':   { label: 'Profile',          icon: '👤' },
    '/admin':     { label: 'Admin Dashboard',  icon: '⚙' },
  };
  const current = map[pathname] || { label: 'DSVP', icon: '⊞' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 16 }}>{current.icon}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{current.label}</span>
    </div>
  );
}
