import { useEffect, useState, useCallback } from 'react';
import {
  getAdminModules, getAdminModuleSummary, createAdminModule, updateAdminModule, deleteAdminModule,
} from '../../../services/api';
import {
  PageHeader, Card, KpiCard, Btn, Badge, THead, TRow, TD,
  SearchBar, FilterChips, Pagination, Spinner, ErrorBanner, EmptyState,
  Modal, FormField, Input, Select, Textarea, Toggle, fmtDate, SkeletonRows,
} from '../ui';
import { useTheme } from '../../../context/ThemeContext';

const CAT_FILTERS = [
  
];
// { value: 'all',     label: 'All Categories' },
//   { value: 'array',   label: 'Array' },
//   { value: 'tree',    label: 'Tree' },
//   { value: 'graph',   label: 'Graph' },
//   { value: 'sorting', label: 'Sorting' },

const ACCESS_FILTERS = [
  { value: 'all',     label: 'All Access' },
  { value: 'free',    label: '🟢 Free' },
  { value: 'basic',   label: '🔵 Basic' },
  { value: 'premium', label: '🟣 Premium' },
];

const ACCESS_META = {
  free:    { icon: '🟢', label: 'Free',    variant: 'free' },
  basic:   { icon: '🔵', label: 'Basic',   variant: 'basic' },
  premium: { icon: '🟣', label: 'Premium', variant: 'premium' },
};

const BLANK = { name: '', slug: '', category: 'array', description: '', requiredPlan: 'free', sortOrder: 0, isActive: true };

export default function ModulesTab() {
  const { T } = useTheme();
  const [modules,  setModules]  = useState([]);
  const [summary,  setSummary]  = useState(null);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search,   setSearch]   = useState('');
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [catFilter, setCat]         = useState('all');
  const [accessFilter, setAccess]   = useState('all');
  const [form,     setForm]     = useState(null);   // null = closed, object = open
  const [saving,   setSaving]   = useState(false);
  const [confirm,  setConfirm]  = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError('');
    getAdminModules({ page, pageSize, category: catFilter, access: accessFilter, search })
      .then(r => { setModules(r.data.data || []); setTotal(r.data.totalRecords || 0); })
      .catch(() => setError('Failed to load modules.'))
      .finally(() => setLoading(false));
  }, [page, pageSize, catFilter, accessFilter, search]);

  const loadSummary = useCallback(() => {
    getAdminModuleSummary().then(r => setSummary(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { setPage(1); }, [catFilter, accessFilter, search]);

  const visible = modules;

  function openCreate() { setForm({ ...BLANK, _mode: 'create' }); }
  function openEdit(m)  {
    setForm({
      _mode: 'edit',
      ModuleId: m.ModuleId,
      name: m.Name ?? '',
      slug: m.Slug ?? '',
      category: m.Category ?? 'array',
      description: m.Description ?? '',
      requiredPlan: m.RequiredPlan ?? 'free',
      isActive: !!m.IsActive,
      sortOrder: m.SortOrder ?? 0,
    });
  }

  async function handleSave() {
    if (!form.name?.trim() || !form.slug?.trim() || !form.category) {
      setError('Name, slug, and category are required.'); return;
    }
    setSaving(true); setError('');
    try {
      const payload = {
        name: form.name, slug: form.slug, category: form.category,
        description: form.description, requiredPlan: form.requiredPlan,
        sortOrder: parseInt(form.sortOrder) || 0, isActive: form.isActive,
      };
      if (form._mode === 'create') await createAdminModule(payload);
      else                          await updateAdminModule(form.ModuleId, payload);
      setForm(null); load(); loadSummary();
    } catch (e) {
      setError(e.response?.data?.message || 'Save failed.');
    } finally { setSaving(false); }
  }

  async function handleDelete(m) {
    try {
      await deleteAdminModule(m.ModuleId);
      setConfirm(null);
      load(); loadSummary();
    } catch { setError('Failed to deactivate module.'); setConfirm(null); }
  }

  async function handleActivate(m) {
    try {
      await updateAdminModule(m.ModuleId, {
        name: m.Name, slug: m.Slug, category: m.Category, description: m.Description,
        requiredPlan: m.RequiredPlan, sortOrder: m.SortOrder, isActive: true,
      });
      load(); loadSummary();
    } catch { setError('Failed to activate module.'); }
  }

  return (
    <div style={{ padding: '32px 32px' }}>
      <PageHeader
        title="Module Access / Plan Management"
        subtitle="Configure which modules are Free, Basic, or Premium — a user's plan automatically unlocks everything at or below their tier."
        action={<Btn variant="success" onClick={openCreate}>+ New Module</Btn>}
      />

      <ErrorBanner message={error} />

      {/* Access-level summary */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 16, marginBottom: 24 }}>
          <KpiCard icon="📦" label="Total Modules"   value={summary.TotalModules}   color="#2E74B5" bg="#EFF6FF" />
          <KpiCard icon="🟢" label="Free Modules"    value={summary.FreeModules}    color="#4CAF50" bg="#F0FDF4" />
          <KpiCard icon="🔵" label="Basic Modules"   value={summary.BasicModules}   color="#2E74B5" bg="#EFF6FF" />
          <KpiCard icon="🟣" label="Premium Modules" value={summary.PremiumModules} color="#7c3aed" bg="#F5F3FF" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search name or slug…" />
        <FilterChips options={ACCESS_FILTERS} value={accessFilter} onChange={setAccess} />
        <FilterChips options={CAT_FILTERS} value={catFilter} onChange={setCat} />
      </div>

      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={['Name', 'Category', 'Access', 'Status', 'Problems', 'Active Users', 'Created', 'Actions']} />
            {loading ? <SkeletonRows cols={8} /> : (
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan={8}><EmptyState icon="📦" title="No modules" /></td></tr>
                ) : visible.map(m => {
                  const meta = ACCESS_META[m.RequiredPlan] || ACCESS_META.free;
                  return (
                    <TRow key={m.ModuleId}>
                      <TD>
                        <div>
                          <span style={{ fontWeight: 600, color: T.mode === 'dark' ? T.text : '#1e293b' }}>{m.Name}</span>
                          <div><code style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 ,color: T.mode === 'dark' ?  '#1e293b':T.text}}>{m.Slug}</code></div>
                        </div>
                      </TD>
                      <TD><Badge variant="default">{m.Category}</Badge></TD>
                      <TD><Badge variant={meta.variant}>{meta.icon} {meta.label}</Badge></TD>
                      <TD><Badge variant={m.IsActive ? 'active' : 'inactive'}>{m.IsActive ? 'Active' : 'Inactive'}</Badge></TD>
                      <TD style={{ color: T.mode === 'dark' ? T.text : '#94a3b8' }}>{m.ProblemCount ?? 0}</TD>
                      <TD style={{ color: T.mode === 'dark' ? T.text : '#94a3b8' }}>{m.ActiveUsers ?? 0}</TD>
                      <TD style={{ color: T.mode === 'dark' ? T.text : '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDate(m.CreatedAt)}</TD>
                      <TD>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Btn size="sm" variant="ghost"   onClick={() => openEdit(m)}>Edit</Btn>
                          {m.IsActive ? (
                            <Btn size="sm" variant="danger" onClick={() => setConfirm(m)}>Deactivate</Btn>
                          ) : (
                            <Btn size="sm" variant="success" onClick={() => handleActivate(m)}>Activate</Btn>
                          )}
                        </div>
                      </TD>
                    </TRow>
                  );
                })}
              </tbody>
            )}
          </table>
        </div>
        <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} onPageSizeChange={setPageSize} />
      </Card>

      {/* Create / Edit modal */}
      <Modal open={!!form} onClose={() => setForm(null)}
        title={form?._mode === 'create' ? 'New Module' : `Configure: ${form?.name}`}
        width={520}>
        {form && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <FormField label="Name *">
                <Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Linked List" />
              </FormField>
              <FormField label="Slug *">
                <Input value={form.slug} onChange={v => setForm(f => ({ ...f, slug: v }))} placeholder="linked-list" />
              </FormField>
              <FormField label="Category *">
                <Select value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))}>
                  <option value="array">Array</option>
                  <option value="tree">Tree</option>
                  <option value="graph">Graph</option>
                  <option value="sorting">Sorting</option>
                  <option value="linked-list">Linked List</option>
                  <option value="stack">Stack</option>
                  <option value="queue">Queue</option>
                </Select>
              </FormField>
              <FormField label="Sort Order">
                <Input type="number" value={form.sortOrder} onChange={v => setForm(f => ({ ...f, sortOrder: v }))} />
              </FormField>
            </div>
            <FormField label="Description">
              <Textarea value={form.description || ''} onChange={v => setForm(f => ({ ...f, description: v }))}
                placeholder="What does this module cover?" rows={3} />
            </FormField>

            <FormField label="Access Level">
              <div style={{ display: 'flex', gap: 10 }}>
                {['free', 'basic', 'premium'].map(level => {
                  const meta = ACCESS_META[level];
                  const active = form.requiredPlan === level;
                  return (
                    <button key={level} type="button"
                      onClick={() => setForm(f => ({ ...f, requiredPlan: level }))}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                        border: `1.5px solid ${active ? '#2E74B5' : '#e2e8f0'}`,
                        background: active ? '#EFF6FF' : '#fff',
                        color: active ? '#2E74B5' : '#64748b',
                        fontWeight: active ? 700 : 500, fontSize: 13,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      }}>
                      <span style={{ fontSize: 18 }}>{meta.icon}</span>
                      {meta.label}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                {form.requiredPlan === 'free' && 'Available to every user, including those without any paid plan.'}
                {form.requiredPlan === 'basic' && 'Available to Basic and Premium plan users only.'}
                {form.requiredPlan === 'premium' && 'Available to Premium plan users only.'}
              </p>
            </FormField>

            {form._mode === 'edit' && (
              <div style={{ marginBottom: 24 }}>
                <Toggle checked={!!form.isActive} onChange={v => setForm(f => ({ ...f, isActive: v }))} label="Active" />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
              <Btn variant="ghost" onClick={() => setForm(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : form._mode === 'create' ? 'Create module' : 'Save Changes'}
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Deactivate confirm */}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Deactivate Module" width={400}>
        {confirm && (
          <div>
            <p style={{ fontSize: 14, color: '#374151', marginBottom: 20 }}>
              Deactivate <strong>{confirm.Name}</strong>? It will be hidden from the catalog but not deleted.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setConfirm(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={() => handleDelete(confirm)}>Deactivate</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
