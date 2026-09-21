import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import AppShell from '../common/AppShell';
import {
  getAdminUserDetail, updateUserRole, updateUserPremium, updateUserStatus, resetUserPassword,
} from '../../services/api';
import {
  PageHeader, Card, Btn, Badge, THead, TRow, TD, Avatar,
  Spinner, ErrorBanner, EmptyState, fmtDate, fmtDateTime, fmtRupee,
} from './ui';

const TABS = ['Overview', 'Activity', 'Progress', 'Modules', 'Submissions', 'Payments', 'Feedback'];

export default function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [tab,     setTab]     = useState(() => TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'Overview');
  const [busy,    setBusy]    = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError('');
    getAdminUserDetail(id)
      .then(r => setData(r.data))
      .catch(() => setError('Failed to load user.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleRoleToggle() {
    setBusy(true);
    try {
      const newRole = data.user.Role === 'admin' ? 'user' : 'admin';
      await updateUserRole(data.user.UserId, newRole);
      setData(d => ({ ...d, user: { ...d.user, Role: newRole } }));
    } catch { setError('Failed to update role.'); }
    setBusy(false);
  }

  async function handlePremiumToggle() {
    setBusy(true);
    try {
      const newVal = !data.user.IsPremium;
      await updateUserPremium(data.user.UserId, newVal);
      setData(d => ({ ...d, user: { ...d.user, IsPremium: newVal } }));
    } catch { setError('Failed to update premium.'); }
    setBusy(false);
  }

  async function handleStatus(status) {
    setBusy(true);
    try {
      await updateUserStatus(data.user.UserId, status);
      setData(d => ({ ...d, user: { ...d.user, Status: status } }));
    } catch (e) { setError(e.response?.data?.message || 'Failed to update status.'); }
    setBusy(false);
  }

  async function handleResetPassword() {
    setBusy(true);
    try {
      await resetUserPassword(data.user.UserId);
      alert(`A temporary password has been emailed to ${data.user.Email}.`);
    } catch { setError('Failed to reset password.'); }
    setBusy(false);
  }

  return (
    <AppShell>
      <div style={{ padding: '32px 32px' }}>
        <div style={{ marginBottom: 12 }}>
          <Btn variant="ghost" size="sm" onClick={() => navigate('/admin')}>← Back to Users</Btn>
        </div>

        {loading ? <Spinner /> : error ? <ErrorBanner message={error} /> : data && (
          <>
            <PageHeader
              title={data.user.FullName}
              subtitle={data.user.Email}
              action={
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Btn size="sm" variant="ghost" disabled={busy} onClick={handleRoleToggle}>
                    {data.user.Role === 'admin' ? '↓ Make User' : '↑ Make Admin'}
                  </Btn>
                  <Btn size="sm" variant={data.user.IsPremium ? 'ghost' : 'accent'} disabled={busy} onClick={handlePremiumToggle}>
                    {data.user.IsPremium ? 'Revoke Premium' : 'Grant Premium'}
                  </Btn>
                  {data.user.Status !== 'active' && <Btn size="sm" variant="success" disabled={busy} onClick={() => handleStatus('active')}>Activate</Btn>}
                  {data.user.Status !== 'inactive' && <Btn size="sm" variant="ghost" disabled={busy} onClick={() => handleStatus('inactive')}>Deactivate</Btn>}
                  {data.user.Status !== 'blocked' && <Btn size="sm" variant="danger" disabled={busy} onClick={() => handleStatus('blocked')}>Block</Btn>}
                  <Btn size="sm" variant="ghost" disabled={busy} onClick={handleResetPassword}>Reset Password</Btn>
                </div>
              }
            />

            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <Badge variant={data.user.Role === 'admin' ? 'admin' : 'user'}>{data.user.Role}</Badge>
              <Badge variant={data.user.Status || 'active'}>{data.user.Status || 'active'}</Badge>
              <Badge variant={data.user.IsPremium ? 'premium' : 'free'}>{data.user.IsPremium ? '⭐ Premium' : 'Free'}</Badge>
              {data.user.SubscriptionPlan && <Badge variant="default">{data.user.SubscriptionPlan}</Badge>}
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #e2e8f0', margin: '20px 0' }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: tab === t ? 700 : 500,
                  color: tab === t ? '#2E74B5' : '#64748b',
                  borderBottom: tab === t ? '2px solid #2E74B5' : '2px solid transparent',
                }}>{t}</button>
              ))}
            </div>

            {tab === 'Overview' && <OverviewPane user={data.user} />}
            {tab === 'Activity' && <ActivityPane rows={data.activity} />}
            {tab === 'Progress' && <ProgressPane rows={data.progress} />}
            {tab === 'Modules' && <ModulesPane rows={data.modules} />}
            {tab === 'Submissions' && <SubmissionsPane rows={data.submissions} />}
            {tab === 'Payments' && <PaymentsPane rows={data.payments} />}
            {tab === 'Feedback' && <FeedbackPane rows={data.feedback} />}
          </>
        )}
      </div>
    </AppShell>
  );
}

function OverviewPane({ user }) {
  const fields = [
    ['User ID', `#${user.UserId}`],
    ['Joined', fmtDate(user.CreatedAt)],
    ['Last Login', fmtDateTime(user.LastLoginAt)],
    ['Last Updated', fmtDateTime(user.UpdatedAt)],
    ['Subscription Plan', user.SubscriptionPlan || 'free'],
    ['Subscription Expiry', user.SubscriptionExpiry ? fmtDate(user.SubscriptionExpiry) : '—'],
  ];
  return (
    <Card style={{ padding: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
        {fields.map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{k}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{v}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ActivityPane({ rows }) {
  return (
    <Card>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <THead cols={['Activity', 'Detail', 'When']} />
          <tbody>
            {(!rows || rows.length === 0) ? (
              <tr><td colSpan={3}><EmptyState icon="📊" title="No activity yet" /></td></tr>
            ) : rows.map(a => (
              <TRow key={`${a.Type}-${a.ActivityId}`}>
                <TD><Badge variant="default">{a.Type}</Badge></TD>
                <TD style={{ color: '#64748b' }}>{a.Detail || '—'}</TD>
                <TD style={{ color: '#94a3b8' }}>{fmtDateTime(a.CreatedAt)}</TD>
              </TRow>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ProgressPane({ rows }) {
  return (
    <Card>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <THead cols={['Module', 'Problem', 'Status', 'Completion', 'Last Accessed']} />
          <tbody>
            {(!rows || rows.length === 0) ? (
              <tr><td colSpan={5}><EmptyState icon="📈" title="No progress recorded" subtitle="This user hasn't started tracked problems yet." /></td></tr>
            ) : rows.map(p => (
              <TRow key={p.ProgressId}>
                <TD>#{p.ModuleId}</TD>
                <TD>{p.ProblemId ?? '—'}</TD>
                <TD><Badge variant={p.Status === 'completed' ? 'success' : 'default'}>{p.Status}</Badge></TD>
                <TD>{p.CompletionPct}%</TD>
                <TD style={{ color: '#94a3b8' }}>{fmtDateTime(p.LastAccessedAt)}</TD>
              </TRow>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ModulesPane({ rows }) {
  return (
    <Card>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <THead cols={['Module', 'Slug', 'Category']} />
          <tbody>
            {(!rows || rows.length === 0) ? (
              <tr><td colSpan={3}><EmptyState icon="📦" title="No modules used yet" /></td></tr>
            ) : rows.map(m => (
              <TRow key={m.ModuleId}>
                <TD style={{ fontWeight: 600 }}>{m.Name}</TD>
                <TD><code style={{ fontSize: 11 }}>{m.Slug}</code></TD>
                <TD><Badge variant="default">{m.Category}</Badge></TD>
              </TRow>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SubmissionsPane({ rows }) {
  return (
    <Card>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <THead cols={['Module', 'Language', 'Status', 'When']} />
          <tbody>
            {(!rows || rows.length === 0) ? (
              <tr><td colSpan={4}><EmptyState icon="📝" title="No submissions yet" /></td></tr>
            ) : rows.map(s => (
              <TRow key={s.TraceId}>
                <TD>{s.ModuleName || '—'}</TD>
                <TD><Badge variant="default">{s.Language}</Badge></TD>
                <TD><Badge variant={s.Status === 'success' ? 'success' : 'failed'}>{s.Status}</Badge></TD>
                <TD style={{ color: '#94a3b8' }}>{fmtDateTime(s.CreatedAt)}</TD>
              </TRow>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PaymentsPane({ rows }) {
  return (
    <Card>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <THead cols={['Plan', 'Amount', 'Status', 'Method', 'Date']} />
          <tbody>
            {(!rows || rows.length === 0) ? (
              <tr><td colSpan={5}><EmptyState icon="💳" title="No payments yet" /></td></tr>
            ) : rows.map(p => (
              <TRow key={p.PaymentId}>
                <TD style={{ fontWeight: 600 }}>{p.PlanName}</TD>
                <TD>{fmtRupee(p.Amount)} {p.Currency}</TD>
                <TD><Badge variant={p.Status}>{p.Status}</Badge></TD>
                <TD style={{ color: '#64748b' }}>{p.PaymentMethod || '—'}</TD>
                <TD style={{ color: '#94a3b8' }}>{fmtDate(p.CreatedAt)}</TD>
              </TRow>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FeedbackPane({ rows }) {
  return (
    <Card>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <THead cols={['Subject', 'Status', 'Submitted']} />
          <tbody>
            {(!rows || rows.length === 0) ? (
              <tr><td colSpan={3}><EmptyState icon="💬" title="No feedback submitted" /></td></tr>
            ) : rows.map(f => (
              <TRow key={f.FeedbackId}>
                <TD style={{ fontWeight: 600 }}>{f.Subject}</TD>
                <TD><Badge variant={f.Status}>{f.Status}</Badge></TD>
                <TD style={{ color: '#94a3b8' }}>{fmtDate(f.CreatedAt)}</TD>
              </TRow>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
