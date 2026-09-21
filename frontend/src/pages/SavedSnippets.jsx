import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/common/AppShell';
import { getCodeHistory, loadCodeHistory, deleteCodeHistory } from '../services/api';
import {
  PageHeader, Card, Btn, Badge, THead, TRow, TD,
  Pagination, ErrorBanner, EmptyState, Spinner, Modal,
  fmtDateTime,
} from '../components/AdminDashboard/ui';
import { useTheme } from '../context/ThemeContext';
export default function SavedSnippets() {
  const navigate = useNavigate();
  const [rows,     setRows]     = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [confirm,  setConfirm]  = useState(null);
  const { T } = useTheme();
  const load = useCallback(() => {
    setLoading(true); setError('');
    getCodeHistory({ page, pageSize })
      .then(r => { setRows(r.data.data || []); setTotal(r.data.totalRecords || 0); })
      .catch(() => setError('Failed to load saved snippets.'))
      .finally(() => setLoading(false));
  }, [page, pageSize]);

  useEffect(() => { load(); }, [load]);

  async function handleOpen(snippet) {
    try {
      const r = await loadCodeHistory(snippet.SnippetId);
      navigate('/workspace', { state: { loadedSnippet: r.data.snippet } });
    } catch { setError('Failed to open snippet.'); }
  }

  async function handleDelete(snippet) {
    try {
      await deleteCodeHistory(snippet.SnippetId);
      setConfirm(null);
      load();
    } catch { setError('Failed to delete snippet.'); setConfirm(null); }
  }

  return (
    <AppShell>
      <div style={{ padding: '32px 32px' }}>
        <PageHeader title="Saved Snippets" subtitle={`${total} saved code snippets`} />
        <ErrorBanner message={error} />

        <Card>
          {loading ? <Spinner /> : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <THead cols={['Title', 'Language', 'Module', 'Saved', '']} />
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={5}>
                        <EmptyState icon="💾" title="No saved snippets"
                          subtitle="Code you save from the Workspace will appear here." />
                      </td></tr>
                    ) : rows.map(s => (
                      <TRow key={s.SnippetId}>
                        <TD style={{ fontWeight: 600, color: T.text }}>{s.Title}</TD>
                        <TD><Badge variant="default">{s.Language}</Badge></TD>
                        <TD style={{ color: T.text}}>{s.ModuleSlug || '—'}</TD>
                        <TD style={{ color: T.text, whiteSpace: 'nowrap' }}>{fmtDateTime(s.CreatedAt)}</TD>
                        <TD>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Btn size="sm" variant="ghost" onClick={() => handleOpen(s)}>Open</Btn>
                            <Btn size="sm" variant="danger" onClick={() => setConfirm(s)}>Delete</Btn>
                          </div>
                        </TD>
                      </TRow>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} onPageSizeChange={setPageSize} />
            </>
          )}
        </Card>
      </div>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Delete Snippet" width={400}>
        {confirm && (
          <div>
            <p style={{ fontSize: 14, color: '#374151', marginBottom: 20 }}>
              Delete <strong>{confirm.Title}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setConfirm(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={() => handleDelete(confirm)}>Yes, delete</Btn>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
