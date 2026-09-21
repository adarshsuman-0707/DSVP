import { useEffect, useState, useCallback } from 'react';
import { getAdminAuditLogs } from '../../../services/api';
import {
  PageHeader, Card, Badge, THead, TRow, TD, Avatar,
  SearchBar, Pagination, ErrorBanner, EmptyState,
  fmtDateTime, SkeletonRows,
} from '../ui';
import { useTheme } from '../../../context/ThemeContext';

const ACTION_VARIANT = {
  USER_BLOCKED: 'blocked', USER_ACTIVATED: 'active', USER_DEACTIVATED: 'inactive',
  USER_UPDATED: 'default', PASSWORD_RESET: 'pending', MODULE_UPDATED: 'open',
  PAYMENT_UPDATED: 'default', REFUND_PROCESSED: 'failed', FEEDBACK_RESOLVED: 'resolved',
};

const PAGE_SIZE_DEFAULT = 20;

export default function AuditLogTab() {
  const { T } = useTheme();
  const [rows,     setRows]     = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [search,   setSearch]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    getAdminAuditLogs({ page, pageSize, search })
      .then(r => { setRows(r.data.data || []); setTotal(r.data.totalRecords || 0); })
      .catch(() => setError('Failed to load audit logs.'))
      .finally(() => setLoading(false));
  }, [page, pageSize, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search]);

  return (
    <div style={{ padding: '32px 32px' }}>
      <PageHeader title="Audit Logs" subtitle={`${total} admin actions — separate from user activity`} />

      <ErrorBanner message={error} />

      <div style={{ marginBottom: 20 }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search admin, action, description…" />
      </div>

      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={['Admin', 'Action', 'Target', 'Description', 'IP', 'When']} />
            {loading ? <SkeletonRows cols={6} /> : (
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6}>
                    <EmptyState icon="🛡" title="No audit logs yet"
                      subtitle="Admin actions like blocking users, refunds, and module edits will appear here." />
                  </td></tr>
                ) : rows.map(a => (
                  <TRow key={a.AuditLogId}>
                    <TD>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={a.AdminName} size={28} />
                        <div>
                          <div style={{ fontWeight: 600, color: T.mode === 'dark' ? T.text : '#1e293b', fontSize: 13 }}>{a.AdminName}</div>
                          <div style={{ fontSize: 11, color: T.mode === 'dark' ? T.textSecondary : '#94a3b8' }}>{a.AdminEmail}</div>
                        </div>
                      </div>
                    </TD>
                    <TD><Badge variant={ACTION_VARIANT[a.Action] || 'default'}>{a.Action.replace(/_/g, ' ')}</Badge></TD>
                    <TD style={{ color: T.mode === 'dark' ? T.text : '#64748b' }}>{a.TargetType}{a.TargetId ? ` #${a.TargetId}` : ''}</TD>
                    <TD style={{ color: T.mode === 'dark' ? T.text : '#64748b', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.Description || '—'}</TD>
                    <TD style={{ color: T.mode === 'dark' ? T.text : '#94a3b8' }}>{a.IPAddress || '—'}</TD>
                    <TD style={{ color: T.mode === 'dark' ? T.text : '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDateTime(a.CreatedAt)}</TD>
                  </TRow>
                ))}
              </tbody>
            )}
          </table>
        </div>
        <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} onPageSizeChange={setPageSize} />
      </Card>
    </div>
  );
}
