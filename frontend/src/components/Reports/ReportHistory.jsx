import { useState } from 'react';
import { Card, THead, TRow, TD, EmptyState, Spinner, Btn, fmtDateTime } from '../AdminDashboard/ui';
import { useTheme } from '../../context/ThemeContext';

/**
 * Recent reports table. There is no stored file server-side beyond the
 * history metadata row, so clicking [Download] re-runs the export call
 * with that row's type/format rather than fetching a saved file — the
 * button's title attribute makes that explicit so it doesn't read as instant.
 */
export default function ReportHistory({ rows = [], loading, onDownload }) {
  const { T } = useTheme();
  const [downloadingId, setDownloadingId] = useState(null);

  async function handleDownload(row) {
    const id = row.ReportId ?? row.reportId ?? row.id;
    setDownloadingId(id);
    try { await onDownload(row); } finally { setDownloadingId(null); }
  }

  return (
    <Card style={{ marginTop: 8 }}>
      <div style={{ padding: '18px 20px 4px' }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Recent Reports</h3>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <THead cols={['Report Name', 'Type', 'Format', 'Records', 'Created', 'Action']} />
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 0 }}><Spinner /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6}>
                <EmptyState icon="🕘" title="No reports generated yet"
                  subtitle="Reports you export will show up here." />
              </td></tr>
            ) : rows.map((r, i) => {
              const id = r.ReportId ?? r.reportId ?? r.id ?? i;
              const name = r.ReportName ?? r.reportName ?? r.Name ?? '—';
              const type = r.ReportType ?? r.reportType ?? r.Type ?? '—';
              const format = r.Format ?? r.format ?? '—';
              const count = r.RecordCount ?? r.recordCount ?? '—';
              const created = r.CreatedAt ?? r.createdAt ?? r.CreatedOn ?? null;
              return (
                <TRow key={id}>
                  <TD>{name}</TD>
                  <TD style={{ textTransform: 'capitalize' }}>{type}</TD>
                  <TD style={{ textTransform: 'uppercase' }}>{format}</TD>
                  <TD>{count}</TD>
                  <TD>{fmtDateTime(created)}</TD>
                  <TD>
                    <Btn size="sm" variant="ghost" disabled={downloadingId === id}
                      title="Regenerates the report fresh — nothing is stored server-side, so this is not an instant re-download."
                      onClick={() => handleDownload(r)}>
                      {downloadingId === id ? 'Generating…' : '📥 Download'}
                    </Btn>
                  </TD>
                </TRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
