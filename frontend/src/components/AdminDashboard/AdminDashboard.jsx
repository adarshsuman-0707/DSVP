import { useState } from 'react';
import AppShell from '../common/AppShell';
import OverviewTab  from './tabs/OverviewTab';
import UsersTab     from './tabs/UsersTab';
import ModulesTab   from './tabs/ModulesTab';
import PaymentsTab  from './tabs/PaymentsTab';
import FeedbackTab  from './tabs/FeedbackTab';
import ActivityTab  from './tabs/ActivityTab';

const TABS = [
  { id: 'overview',  label: 'Overview',  icon: '⊞' },
  { id: 'users',     label: 'Users',     icon: '👥' },
  { id: 'modules',   label: 'Modules',   icon: '📦' },
  { id: 'payments',  label: 'Payments',  icon: '💰' },
  { id: 'feedback',  label: 'Feedback',  icon: '💬' },
  { id: 'activity',  label: 'Activity',  icon: '📊' },
];

export default function AdminDashboard() {
  const [active, setActive] = useState('overview');

  return (
    <AppShell>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

        {/* ── Tab bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          padding: '0 32px',
          borderBottom: '1px solid #e2e8f0',
          background: '#fff', flexShrink: 0,
        }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActive(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '14px 18px', border: 'none', cursor: 'pointer',
              background: 'none', fontSize: 13, fontWeight: active === t.id ? 700 : 500,
              color:  active === t.id ? '#2E74B5' : '#64748b',
              borderBottom: active === t.id ? '2px solid #2E74B5' : '2px solid transparent',
              transition: 'all 150ms', marginBottom: -1,
            }}>
              <span style={{ fontSize: 15 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div style={{ flex: 1, background: '#f8fafc' }}>
          {active === 'overview'  && <OverviewTab />}
          {active === 'users'     && <UsersTab />}
          {active === 'modules'   && <ModulesTab />}
          {active === 'payments'  && <PaymentsTab />}
          {active === 'feedback'  && <FeedbackTab />}
          {active === 'activity'  && <ActivityTab />}
        </div>
      </div>
    </AppShell>
  );
}
