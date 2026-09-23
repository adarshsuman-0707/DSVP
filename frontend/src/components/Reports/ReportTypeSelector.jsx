import { useTheme } from '../../context/ThemeContext';
import { Select } from '../AdminDashboard/ui';

/**
 * Row of pill/tab buttons to pick the active report type. Falls back to a
 * <Select> dropdown on narrow screens.
 */
export default function ReportTypeSelector({ types, value, onChange }) {
  const { T } = useTheme();
  return (
    <div>
      {/* Wide screens: pill tabs */}
      <div className="report-type-pills" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        {types.map(t => (
          <button key={t.value} onClick={() => onChange(t.value)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600,
            border: '1.5px solid', cursor: 'pointer', transition: 'all 150ms',
            borderColor: value === t.value ? T.accent : T.border,
            background:  value === t.value ? T.chipBg : T.card,
            color:       value === t.value ? T.accent : T.textSecondary,
          }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Narrow-screen alternative — a plain dropdown, usable standalone if a page prefers it. */
export function ReportTypeDropdown({ types, value, onChange }) {
  return (
    <Select value={value} onChange={onChange}>
      {types.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
    </Select>
  );
}
