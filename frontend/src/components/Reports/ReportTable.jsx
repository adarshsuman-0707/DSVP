import { THead, TRow, TD, EmptyState, SkeletonRows, Btn } from '../AdminDashboard/ui';

/**
 * Generic report data table. `columns`: [{key,label}] or plain strings.
 * `records`: array of row objects; cells are resolved defensively via `??`
 * against a few possible casings/keys since the exact backend field names
 * may not be finalized yet.
 */
export default function ReportTable({ columns = [], records = [], loading, onResetFilters }) {
  const cols = columns.map(c => (typeof c === 'string' ? { key: c, label: c } : c));
  const headers = cols.map(c => c.label);

  function cellValue(row, col) {
    if (row == null) return '—';
    // Try key as-is, then a few common alternate castings.
    const key = col.key;
    const candidates = [
      key,
      key.replace(/\s+/g, ''),
      key.replace(/\s+/g, '_'),
      key.charAt(0).toLowerCase() + key.slice(1).replace(/\s+/g, ''),
    ];
    for (const k of candidates) {
      if (row[k] !== undefined && row[k] !== null) return row[k];
    }
    return row[col.label] ?? '—';
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <THead cols={headers} />
        {loading ? (
          <SkeletonRows cols={headers.length || 5} />
        ) : (
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={headers.length || 1}>
                <EmptyState icon="📄" title="No report data available"
                  subtitle="Try changing your filters or date range." />
                {onResetFilters && (
                  <div style={{ textAlign: 'center', marginTop: -20, paddingBottom: 24 }}>
                    <Btn variant="ghost" size="sm" onClick={onResetFilters}>Reset Filters</Btn>
                  </div>
                )}
              </td></tr>
            ) : records.map((row, i) => (
              <TRow key={row.Id ?? row.id ?? i}>
                {cols.map(c => <TD key={c.key}>{String(cellValue(row, c))}</TD>)}
              </TRow>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}
