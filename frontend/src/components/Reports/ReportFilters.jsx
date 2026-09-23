import { useEffect, useState } from 'react';
import { FormField, Input, Select, Btn } from '../AdminDashboard/ui';
import { useTheme } from '../../context/ThemeContext';
import { getModules } from '../../services/api';
import { LANGUAGES, LANG_LABELS, STATUS_OPTIONS_BY_TYPE, HIDE_MODULE_LANGUAGE_FOR } from './reportTypes';

/**
 * Context-aware filter bar for report generation.
 * `type` drives which fields show (Module/Language hidden for payments/coins/etc).
 * Calls onApply(filters) / onReset() — filters are NOT fetched on every keystroke,
 * only when the user clicks Apply (or Reset).
 */
export default function ReportFilters({ type, onApply, onReset, resultCount, loaded }) {
  const { T } = useTheme();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [module, setModule] = useState('all');
  const [language, setLanguage] = useState('all');
  const [status, setStatus] = useState('all');
  const [modules, setModules] = useState([]);

  useEffect(() => {
    getModules('all').then(res => setModules(res.data.modules || [])).catch(() => {});
  }, []);

  const hideModuleLanguage = HIDE_MODULE_LANGUAGE_FOR.has(type);
  const statusOptions = STATUS_OPTIONS_BY_TYPE[type] || [{ value: 'all', label: 'All' }];

  function apply() {
    onApply({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      module: !hideModuleLanguage && module !== 'all' ? module : undefined,
      language: !hideModuleLanguage && language !== 'all' ? language : undefined,
      status: status !== 'all' ? status : undefined,
    });
  }

  function reset() {
    setDateFrom(''); setDateTo(''); setModule('all'); setLanguage('all'); setStatus('all');
    onReset();
  }

  return (
    <div style={{
      background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 14,
      padding: '18px 20px', marginBottom: 20,
    }}>
      <div style={{
        display: 'grid', gap: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      }}>
        <FormField label="Date From">
          <Input type="date" value={dateFrom} onChange={setDateFrom} />
        </FormField>
        <FormField label="Date To">
          <Input type="date" value={dateTo} onChange={setDateTo} />
        </FormField>
        {!hideModuleLanguage && (
          <FormField label="Module">
            <Select value={module} onChange={setModule}>
              <option value="all">All Modules</option>
              {modules.map(m => (
                <option key={m.ModuleId ?? m.Slug ?? m.slug} value={m.Slug ?? m.slug}>
                  {m.Name ?? m.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        {!hideModuleLanguage && (
          <FormField label="Language">
            <Select value={language} onChange={setLanguage}>
              <option value="all">All Languages</option>
              {LANGUAGES.map(l => <option key={l} value={l}>{LANG_LABELS[l]}</option>)}
            </Select>
          </FormField>
        )}
        <FormField label="Status">
          <Select value={status} onChange={setStatus}>
            {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </FormField>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        <Btn variant="primary" onClick={apply}>Apply Filters</Btn>
        <Btn variant="ghost" onClick={reset}>Reset</Btn>
        {loaded && (
          <span style={{ fontSize: 12, color: T.textMuted, marginLeft: 'auto' }}>
            {resultCount} record{resultCount === 1 ? '' : 's'} found
          </span>
        )}
      </div>
    </div>
  );
}
