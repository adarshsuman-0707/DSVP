import { useState } from 'react';
import AppShell from '../common/AppShell';
import { useTheme } from '../../context/ThemeContext';
import OverviewTab    from './tabs/OverviewTab';
import UsersTab       from './tabs/UsersTab';
import ModulesTab     from './tabs/ModulesTab';
import PaymentsTab    from './tabs/PaymentsTab';
import FeedbackTab    from './tabs/FeedbackTab';
import ActivityTab    from './tabs/ActivityTab';
import AuditLogTab    from './tabs/AuditLogTab';
import SubmissionsTab from './tabs/SubmissionsTab';

const GROUPS = [
  {
    label: 'Overview',
    tabs: [{ id: 'overview', label: 'Dashboard', icon: '⊞' }],
  },
  {
    label: 'User Management',
    tabs: [
      { id: 'users',    label: 'Users',         icon: '👥' },
      { id: 'activity', label: 'User Activity', icon: '📊' },
      { id: 'feedback', label: 'User Feedback', icon: '💬' },
    ],
  },
  {
    label: 'Content',
    tabs: [
      { id: 'modules',     label: 'Module Access', icon: '📦' },
      { id: 'submissions', label: 'Submissions', icon: '📝' },
    ],
  },
  {
    label: 'Payments',
    tabs: [{ id: 'payments', label: 'Payments', icon: '💰' }],
  },
  {
    label: 'System',
    tabs: [{ id: 'audit', label: 'Audit Logs', icon: '🛡' }],
  },
];

const TAB_COMPONENTS = {
  overview: OverviewTab,
  users: UsersTab,
  activity: ActivityTab,
  feedback: FeedbackTab,
  modules: ModulesTab,
  submissions: SubmissionsTab,
  payments: PaymentsTab,
  audit: AuditLogTab,
};

export default function AdminDashboard() {
  const { T } = useTheme();
  const [active, setActive] = useState('overview');
  const ActiveComponent = TAB_COMPONENTS[active] || OverviewTab;

  return (
    <AppShell>
      <div style={{ display: 'flex', minHeight: '100%', background: T.bg }}>

        {/* ── Admin sub-sidebar (grouped sections) ── */}
        <div style={{
          width: 210, flexShrink: 0, background: T.sidebarBg,
          borderRight: `1px solid ${T.border}`, padding: '20px 12px',
          overflowY: 'auto',
        }}>
          {GROUPS.map(g => (
            <div key={g.label} style={{ marginBottom: 20 }}>
              <p style={{
                fontSize: 10, fontWeight: 700, color: T.textMuted,
                textTransform: 'uppercase', letterSpacing: '.08em',
                padding: '0 8px', marginBottom: 6,
              }}>{g.label}</p>
              {g.tabs.map(t => (
                <button key={t.id} onClick={() => setActive(t.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                  padding: '8px 10px', border: 'none', cursor: 'pointer',
                  background: active === t.id ? T.chipBg : 'transparent',
                  color: active === t.id ? T.accent : T.textSecondary,
                  fontWeight: active === t.id ? 700 : 500, fontSize: 13,
                  borderRadius: 8, marginBottom: 2, textAlign: 'left',
                  borderLeft: active === t.id ? `3px solid ${T.accent}` : '3px solid transparent',
                  transition: 'all 150ms',
                }}
                  onMouseEnter={e => { if (active !== t.id) { e.currentTarget.style.background = T.hoverBg; e.currentTarget.style.color = T.text; } }}
                  onMouseLeave={e => { if (active !== t.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textSecondary; } }}
                >
                  <span style={{ fontSize: 15 }}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div style={{ flex: 1, background: T.bg, minWidth: 0 }}>
          <ActiveComponent />
        </div>
      </div>
    </AppShell>
  );
}
