import { useState } from 'react';
import { Btn } from '../AdminDashboard/ui';

const FORMATS = [
  { format: 'excel', ext: 'xlsx', label: 'Export Excel' },
  { format: 'pdf',   ext: 'pdf',  label: 'Export PDF' },
  { format: 'csv',   ext: 'csv',  label: 'Export CSV' },
];

/**
 * [Export Excel] [Export PDF] [Export CSV] buttons. `exportFn(params)` must
 * return an axios promise resolving to a blob response (responseType: 'blob').
 * `reportType` is used for the download filename. `pushToast` is the
 * `push(type, message)` fn from useToasts(), used to surface failures.
 */
export default function ExportButtons({ exportFn, reportType, filters = {}, pushToast, disabled }) {
  const [pending, setPending] = useState(null); // format currently downloading

  async function handleExport(format, ext) {
    if (pending) return;
    setPending(format);
    try {
      const res = await exportFn({ type: reportType, format, ...filters });
      const blob = res.data;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}-report.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      pushToast?.('error', 'Unable to generate the report. Try again.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
      {FORMATS.map((f, i) => (
        <Btn
          key={f.format}
          variant={i === 0 ? 'primary' : 'ghost'}
          disabled={disabled || !!pending}
          onClick={() => handleExport(f.format, f.ext)}
        >
          {pending === f.format ? 'Generating…' : `📥 ${f.label}`}
        </Btn>
      ))}
    </div>
  );
}
