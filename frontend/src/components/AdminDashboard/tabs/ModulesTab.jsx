import { useEffect, useState, useCallback } from 'react';
import { getAdminModules, createAdminModule, updateAdminModule, deleteAdminModule } from '../../../services/api';
import {
  PageHeader, Card, Btn, Badge, THead, TRow, TD,
  SearchBar, FilterChips, Pagination, Spinner, ErrorBanner, EmptyState,
  Modal, FormField, Input, Select, Textarea, Toggle,
} from '../ui';

const CAT_FILTERS = [
  { value: 'all',     label: 'All' },
  { value: 'array',   label: 'Array' },
  { value: 'tree',    label: 'Tree' },
  { value: 'graph',   label: 'Graph' },
  { value: 'sorting', label: 'Sorting' },
];

const BLANK = { name: '', slug: '', category: 'array', description: '', isPremium: false, sortOrder: 0, isActive: true };
const PAGE_SIZE = 15;

export default function ModulesTab() {
  const [modules,  setModules]  = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [search,   setSearch]   = useState('');
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [catFilter, setCat]     = useState('all');
  const [form,     setForm]     = useState(null);   // null = closed, object = open
  const [saving,   setSaving]   = useState(false);
  const [confirm,  setConfirm]  = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError('');
    getAdminModules({ page, pageSize: PAGE_SIZE, category: catFilter, search })
      .then(r => { setModules(r.data.modules || []); setTotal(r.data.total || 0); })
      .catch(() => setError('Failed to load modules.'))
      .finally(() => setLoading(false));
  }, [page, catFilter, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [catFilter, search]);

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
      isPremium: !!m.IsPremium,
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
        description: form.description, isPremium: form.isPremium,
        sortOrder: parseInt(form.sortOrder) || 0, isActive: form.isActive,
      };
      if (form._mode === 'create') await createAdminModule(payload);
      else                          await updateAdminModule(form.ModuleId, payload);
      setForm(null); load();
    } catch (e) {
      setError(e.response?.data?.message || 'Save failed.');
    } finally { setSaving(false); }
  }

  async function handleDelete(m) {
    try {
      await deleteAdminModule(m.ModuleId);
      setConfirm(null);
      load();
    } catch { setError('Failed to deactivate module.'); setConfirm(null); }
  }

  return (
    <div style={{ padding: '32px 32px' }}>
      <PageHeader
        title="Modules"
        subtitle={`${total} total modules`}
        action={<Btn variant="success" onClick={openCreate}>+ New Module</Btn>}
      />

      <ErrorBanner message={error} />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search name or slug…" />
        <FilterChips options={CAT_FILTERS} value={catFilter} onChange={setCat} />
      </div>

      <Card>
        {loading ? <Spinner /> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <THead cols={['Name', 'Slug', 'Category', 'Type', 'Status', 'Order', '']} />
                <tbody>
                  {visible.length === 0 ? (
                    <tr><td colSpan={7}><EmptyState icon="📦" title="No modules" /></td></tr>
                  ) : visible.map(m => (
                    <TRow key={m.ModuleId}>
                      <TD><span style={{ fontWeight: 600, color: '#1e293b' }}>{m.Name}</span></TD>
                      <TD><code style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{m.Slug}</code></TD>
                      <TD><Badge variant="default">{m.Category}</Badge></TD>
                      <TD><Badge variant={m.IsPremium ? 'premium' : 'free'}>{m.IsPremium ? '⭐ Premium' : 'Free'}</Badge></TD>
                      <TD><Badge variant={m.IsActive ? 'active' : 'inactive'}>{m.IsActive ? 'Active' : 'Inactive'}</Badge></TD>
                      <TD style={{ color: '#94a3b8' }}>{m.SortOrder}</TD>
                      <TD>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Btn size="sm" variant="ghost"   onClick={() => openEdit(m)}>Edit</Btn>
                          <Btn size="sm" variant="danger"  onClick={() => setConfirm(m)}>Deactivate</Btn>
                        </div>
                      </TD>
                    </TRow>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </Card>

      {/* Create / Edit modal */}
      <Modal open={!!form} onClose={() => setForm(null)}
        title={form?._mode === 'create' ? 'New Module' : `Edit: ${form?.name}`}
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
            <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
              <Toggle checked={!!form.isPremium} onChange={v => setForm(f => ({ ...f, isPremium: v }))} label="Premium module" />
              {form._mode === 'edit' && (
                <Toggle checked={!!form.isActive} onChange={v => setForm(f => ({ ...f, isActive: v }))} label="Active" />
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
              <Btn variant="ghost" onClick={() => setForm(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : form._mode === 'create' ? 'Create module' : 'Save changes'}
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
