import { useEffect, useState, useCallback } from 'react';
import { getAdminActivity } from '../../../services/api';
import {
  PageHeader, Card, Badge, THead, TRow, TD, Avatar,
  SearchBar, FilterChips, Pagination, Spinner, ErrorBanner, EmptyState,
  fmtDateTime,
} from '../ui';

const TYPE_FILTERS = [
  { value: 'all',      label: 'All' },
  { value: 'login',     label: '🔑 Logins' },
  { value: 'signup',    label: '🆕 Signups' },
  { value: 'code_run',  label: '💻 Code Runs' },
  { value: 'payment',   label: '💰 Payments' },
];

const TYPE_META = {
  login:    { icon: '🔑', label: 'Login',    variant: 'default' },
  signup:   { icon: '🆕', label: 'Signup',   variant: 'user' },
  code_run: { icon: '💻', label: 'Code Run', variant: 'open' },
  payment:  { icon: '💰', label: 'Payment',  variant: 'success' },
};

const PAGE_SIZE = 20;

export default function ActivityTab() {
  const [rows,    setRows]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState('');
  const [type,    setType]    = useState('all');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    getAdminActivity({ page, pageSize: PAGE_SIZE, type, search })
      .then(r => { setRows(r.data.activity || []); setTotal(r.data.total || 0); })
      .catch(() => setError('Failed to load activity.'))
      .finally(() => setLoading(false));
  }, [page, type, search]);

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
        {loading ? <Spinner /> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <THead cols={['User', 'Activity', 'Detail', 'When']} />
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={4}>
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
                              <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 13 }}>{a.FullName}</div>
                              <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.Email}</div>
                            </div>
                          </div>
                        </TD>
                        <TD><Badge variant={meta.variant}>{meta.icon} {meta.label}</Badge></TD>
                        <TD style={{ color: '#64748b' }}>{a.Detail || '—'}</TD>
                        <TD style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDateTime(a.CreatedAt)}</TD>
                      </TRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
