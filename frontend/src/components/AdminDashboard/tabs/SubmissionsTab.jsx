import { useEffect, useState, useCallback } from 'react';
import { getAdminSubmissions } from '../../../services/api';
import {
  PageHeader, Card, Badge, THead, TRow, TD, Avatar,
  FilterChips, Pagination, ErrorBanner, EmptyState,
  fmtDateTime, SkeletonRows,
} from '../ui';
import { useTheme } from '../../../context/ThemeContext';

const STATUS_FILTERS = [
  { value: 'all',            label: 'All' },
  { value: 'success',        label: 'Success' },
  { value: 'compile_error',  label: 'Compile Error' },
  { value: 'runtime_error',  label: 'Runtime Error' },
];

const PAGE_SIZE_DEFAULT = 20;

export default function SubmissionsTab() {
  const { T } = useTheme();
  const [rows,     setRows]     = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [status,   setStatus]   = useState('all');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    getAdminSubmissions({ page, pageSize, status: status !== 'all' ? status : undefined })
      .then(r => { setRows(r.data.data || []); setTotal(r.data.totalRecords || 0); })
      .catch(() => setError('Failed to load submissions.'))
      .finally(() => setLoading(false));
  }, [page, pageSize, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status]);

  return (
    <div style={{ padding: '32px 32px' }}>
      <PageHeader title="Submissions" subtitle={`${total} code execution attempts`} />

      <ErrorBanner message={error} />

      <div style={{ marginBottom: 20 }}>
        <FilterChips options={STATUS_FILTERS} value={status} onChange={setStatus} />
      </div>

      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={['User', 'Module', 'Language', 'Status', 'Error', 'Submitted']} />
            {loading ? <SkeletonRows cols={6} /> : (
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6}>
                    <EmptyState icon="📝" title="No submissions yet"
                      subtitle="Code execution attempts will appear here." />
                  </td></tr>
                ) : rows.map(s => (
                  <TRow key={s.TraceId}>
                    <TD>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={s.FullName} size={28} />
                        <div>
                          <div style={{ fontWeight: 600, color: T.mode === 'dark' ? T.text : '#1e293b', fontSize: 13 }}>{s.FullName}</div>
                          <div style={{ fontSize: 11, color: T.mode === 'dark' ? T.textSecondary : '#94a3b8' }}>{s.Email}</div>
                        </div>
                      </div>
                    </TD>
                    <TD style={{ color: T.mode === 'dark' ? T.text : '#64748b' }}>{s.ModuleName || '—'}</TD>
                    <TD><Badge variant="default">{s.Language}</Badge></TD>
                    <TD><Badge variant={s.Status === 'success' ? 'success' : 'failed'}>{s.Status.replace('_', ' ')}</Badge></TD>
                    <TD style={{ color: '#dc2626', fontSize: 12, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.ErrorMessage || '—'}
                    </TD>
                    <TD style={{ color: T.mode === 'dark' ? T.text : '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDateTime(s.CreatedAt)}</TD>
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
