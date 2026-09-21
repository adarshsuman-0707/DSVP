import { useEffect, useState, useCallback } from 'react';
import { getAdminActivity } from '../../../services/api';
import {
  PageHeader, Card, Badge, THead, TRow, TD, Avatar,
  SearchBar, FilterChips, Pagination, ErrorBanner, EmptyState,
  fmtDateTime, SkeletonRows,
} from '../ui';
import { useTheme } from '../../../context/ThemeContext';

const TYPE_FILTERS = [
  { value: 'all',              label: 'All' },
  { value: 'login',            label: '🔑 Login' },
  { value: 'signup',           label: '🆕 Signup' },
  { value: 'profile_updated',  label: '✏ Profile' },
  { value: 'password_changed', label: '🔒 Password' },
  { value: 'module_viewed',    label: '📦 Module' },
  { value: 'code_run',         label: '💻 Code Run' },
  { value: 'snippet_created',  label: '💾 Snippet' },
  { value: 'payment_initiated',label: '🧾 Pay Initiated' },
  { value: 'payment',          label: '💰 Payment' },
  { value: 'feedback_submitted', label: '💬 Feedback' },
];

const TYPE_META = {
  login:              { icon: '🔑', label: 'Login',            variant: 'default' },
  signup:             { icon: '🆕', label: 'Signup',           variant: 'user' },
  profile_updated:    { icon: '✏',  label: 'Profile Updated',  variant: 'default' },
  password_changed:   { icon: '🔒', label: 'Password Changed', variant: 'default' },
  module_viewed:      { icon: '📦', label: 'Module Viewed',    variant: 'open' },
  code_run:           { icon: '💻', label: 'Code Run',         variant: 'open' },
  snippet_created:    { icon: '💾', label: 'Snippet Created',  variant: 'default' },
  snippet_deleted:    { icon: '🗑',  label: 'Snippet Deleted',  variant: 'default' },
  payment_initiated:  { icon: '🧾', label: 'Payment Initiated',variant: 'pending' },
  payment_success:    { icon: '💰', label: 'Payment Success',  variant: 'success' },
  payment_failed:     { icon: '⚠',  label: 'Payment Failed',   variant: 'failed' },
  payment:            { icon: '💰', label: 'Payment',          variant: 'success' },
  feedback_submitted: { icon: '💬', label: 'Feedback',         variant: 'default' },
};

function parseModule(a) {
  if (a.Type !== 'module_viewed' || !a.Detail) return '—';
  try {
    const meta = JSON.parse(a.Detail);
    return meta.slug || meta.moduleId || '—';
  } catch { return '—'; }
}

export default function ActivityTab() {
  const { T } = useTheme();
  const [rows,     setRows]     = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search,   setSearch]   = useState('');
  const [type,     setType]     = useState('all');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    getAdminActivity({ page, pageSize, type: type !== 'all' ? type : undefined, search })
      .then(r => { setRows(r.data.data || []); setTotal(r.data.totalRecords || 0); })
      .catch(() => setError('Failed to load activity.'))
      .finally(() => setLoading(false));
  }, [page, pageSize, type, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [type, search]);

  return (
    <div style={{ padding: '32px 32px' }}>
      <PageHeader title="User Activity" subtitle={`${total} recorded events`} />

      <ErrorBanner message={error} />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search name or email…" />
        <FilterChips options={TYPE_FILTERS} value={type} onChange={setType} />
      </div>

      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={['User', 'Activity', 'Module', 'Detail', 'When']} />
            {loading ? <SkeletonRows cols={5} /> : (
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={5}>
                    <EmptyState icon="📊" title="No activity yet"
                      subtitle="Logins, signups, code runs, and payments will appear here." />
                  </td></tr>
                ) : rows.map(a => {
                  const meta = TYPE_META[a.Type] || { icon: '•', label: a.Type, variant: 'default' };
                  return (
                    <TRow key={`${a.Type}-${a.ActivityId}`}>
                      <TD>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={a.FullName} size={30} />
                          <div>
                            <div style={{ fontWeight: 600, color: T.mode === 'dark' ? T.text : '#1e293b', fontSize: 13 }}>{a.FullName}</div>
                            <div style={{ fontSize: 11, color: T.mode === 'dark' ? T.textSecondary : '#94a3b8' }}>{a.Email}</div>
                          </div>
                        </div>
                      </TD>
                      <TD><Badge variant={meta.variant}>{meta.icon} {meta.label}</Badge></TD>
                      <TD style={{ color: T.mode === 'dark' ? T.text : '#64748b' }}>{parseModule(a)}</TD>
                      <TD style={{ color: T.mode === 'dark' ? T.text : '#64748b' }}>{a.Detail && a.Type !== 'module_viewed' ? a.Detail : '—'}</TD>
                      <TD style={{ color: T.mode === 'dark' ? T.text : '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDateTime(a.CreatedAt)}</TD>
                    </TRow>
                  );
                })}
              </tbody>
            )}
          </table>
        </div>
        <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} onPageSizeChange={setPageSize} />
      </Card>
    </div>
  );
}
