import { Card } from '../AdminDashboard/ui';
import { useTheme } from '../../context/ThemeContext';
import ReportTable from './ReportTable';

/**
 * Report title + small summary block (key:value pairs) above the data table.
 * `summary`: [{ label, value }] — e.g. total records, generated-at timestamp.
 */
export default function ReportPreview({ title, summary = [], columns, records, loading, onResetFilters }) {
  const { T } = useTheme();
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
      <ReportTable columns={columns} records={records} loading={loading} onResetFilters={onResetFilters} />
    </Card>
  );
}
