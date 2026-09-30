import { useEffect, useState } from 'react';
import { Card, Pagination } from '../AdminDashboard/ui';
import { useTheme } from '../../context/ThemeContext';
import ReportTable from './ReportTable';

/**
 * Report title + small summary block (key:value pairs) above the data table.
 * `summary`: [{ label, value }] — e.g. total records, generated-at timestamp.
 * Records are paginated client-side so every report type gets the same paging.
 */
export default function ReportPreview({ title, summary = [], columns, records, loading, onResetFilters }) {
  const { T } = useTheme();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // New dataset (tab switch / filters applied) → back to first page.
  useEffect(() => { setPage(1); }, [records]);

  const total = records?.length || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRecords = (records || []).slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <Card style={{ marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.divider}` }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: summary.length ? 10 : 0 }}>{title}</h3>
        {summary.length > 0 && (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {summary.map(s => (
              <div key={s.label} style={{ fontSize: 12, color: T.textSecondary }}>
                <span style={{ color: T.textMuted }}>{s.label}: </span>
                <span style={{ fontWeight: 700, color: T.text }}>{s.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <ReportTable columns={columns} records={pageRecords} loading={loading} onResetFilters={onResetFilters} />
      {!loading && total > 0 && (
        <Pagination
          page={safePage}
          total={total}
          pageSize={pageSize}
          onChange={setPage}
          onPageSizeChange={s => { setPageSize(s); setPage(1); }}
        />
      )}
    </Card>
  );
}
