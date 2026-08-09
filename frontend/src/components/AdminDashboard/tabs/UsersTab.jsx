import { useEffect, useState, useCallback } from 'react';
import { getAdminUsers, updateUserRole, updateUserPremium, deleteAdminUser } from '../../../services/api';
import {
  PageHeader, Card, Btn, Badge, THead, TRow, TD, Avatar,
  SearchBar, FilterChips, Pagination, Spinner, ErrorBanner,
  EmptyState, Modal, Toggle, fmtDate, fmtDateTime,
} from '../ui';

const ROLE_FILTERS = [
  { value: 'all',   label: 'All' },
  { value: 'user',  label: 'Users' },
  { value: 'admin', label: 'Admins' },
];

export default function UsersTab() {
  const [users,    setUsers]    = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [search,   setSearch]   = useState('');
  const [roleFilter, setRole]   = useState('all');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [selected, setSelected] = useState(null);   // user detail modal
  const [confirm,  setConfirm]  = useState(null);   // delete confirmation

  const PAGE_SIZE = 15;

  const load = useCallback(() => {
    setLoading(true); setError('');
    getAdminUsers({ page, pageSize: PAGE_SIZE, search })
      .then(r => {
        let rows = r.data.users || [];
        if (roleFilter !== 'all') rows = rows.filter(u => u.Role === roleFilter);
        setUsers(rows);
        setTotal(roleFilter !== 'all' ? rows.length : r.data.total);
      })
      .catch(() => setError('Failed to load users.'))
      .finally(() => setLoading(false));
  }, [page, search, roleFilter]);

  useEffect(() => { load(); }, [load]);
  // debounce search
  useEffect(() => { setPage(1); }, [search, roleFilter]);

  async function handleRoleToggle(user) {
    const newRole = user.Role === 'admin' ? 'user' : 'admin';
    try {
      await updateUserRole(user.UserId, newRole);
      setUsers(prev => prev.map(u => u.UserId === user.UserId ? { ...u, Role: newRole } : u));
      if (selected?.UserId === user.UserId) setSelected(s => ({ ...s, Role: newRole }));
    } catch { setError('Failed to update role.'); }
  }

  async function handlePremiumToggle(user) {
    const newVal = !user.IsPremium;
    try {
      await updateUserPremium(user.UserId, newVal);
      setUsers(prev => prev.map(u => u.UserId === user.UserId ? { ...u, IsPremium: newVal } : u));
      if (selected?.UserId === user.UserId) setSelected(s => ({ ...s, IsPremium: newVal }));
    } catch { setError('Failed to update premium.'); }
  }

  async function handleDelete(user) {
    try {
      await deleteAdminUser(user.UserId);
      setUsers(prev => prev.filter(u => u.UserId !== user.UserId));
      setTotal(t => t - 1);
      setConfirm(null);
      setSelected(null);
    } catch { setError('Failed to delete user.'); setConfirm(null); }
  }

  return (
    <div style={{ padding: '32px 32px' }}>
      <PageHeader
        title="Users"
        subtitle={`${total} total users`}
      />

      <ErrorBanner message={error} />

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search name or email…" />
        <FilterChips options={ROLE_FILTERS} value={roleFilter} onChange={setRole} />
      </div>

      <Card>
        {loading ? <Spinner /> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <THead cols={['User', 'Email', 'Role', 'Premium', 'Joined', 'Last Login', '']} />
                <tbody>
                  {users.length === 0 ? (
                    <tr><td colSpan={7}><EmptyState icon="👥" title="No users found" /></td></tr>
                  ) : users.map(u => (
                    <TRow key={u.UserId} onClick={() => setSelected(u)}>
                      <TD>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={u.FullName} size={32} />
                          <span style={{ fontWeight: 600, color: '#1e293b' }}>{u.FullName}</span>
                        </div>
                      </TD>
                      <TD style={{ color: '#64748b' }}>{u.Email}</TD>
                      <TD><Badge variant={u.Role === 'admin' ? 'admin' : 'user'}>{u.Role}</Badge></TD>
                      <TD>
                        <Badge variant={u.IsPremium ? 'premium' : 'free'}>
                          {u.IsPremium ? '⭐ Premium' : 'Free'}
                        </Badge>
                      </TD>
                      <TD style={{ color: '#94a3b8' }}>{fmtDate(u.CreatedAt)}</TD>
                      <TD style={{ color: '#94a3b8' }}>{fmtDateTime(u.LastLoginAt)}</TD>
                      <TD>
                        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                          <Btn size="sm" variant="ghost" onClick={() => handleRoleToggle(u)}>
                            {u.Role === 'admin' ? '↓ User' : '↑ Admin'}
                          </Btn>
                          <Btn size="sm" variant={u.IsPremium ? 'ghost' : 'accent'} onClick={() => handlePremiumToggle(u)}>
                            {u.IsPremium ? 'Revoke' : 'Upgrade'}
                          </Btn>
                          <Btn size="sm" variant="danger" onClick={() => setConfirm(u)}>Delete</Btn>
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

      {/* User detail modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="User Details" width={480}>
        {selected && (
          <div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
              <Avatar name={selected.FullName} size={56} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>{selected.FullName}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>{selected.Email}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Badge variant={selected.Role === 'admin' ? 'admin' : 'user'}>{selected.Role}</Badge>
                  <Badge variant={selected.IsPremium ? 'premium' : 'free'}>{selected.IsPremium ? '⭐ Premium' : 'Free'}</Badge>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24, padding: 16,
              background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              {[
                ['User ID', `#${selected.UserId}`],
                ['Joined',  fmtDate(selected.CreatedAt)],
                ['Last Login', fmtDateTime(selected.LastLoginAt)],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
              <Toggle checked={selected.Role === 'admin'} onChange={() => handleRoleToggle(selected)} label="Admin privileges" />
              <Toggle checked={!!selected.IsPremium} onChange={() => handlePremiumToggle(selected)} label="Premium access" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
              <Btn variant="ghost" onClick={() => setSelected(null)}>Close</Btn>
              <Btn variant="danger" onClick={() => { setConfirm(selected); setSelected(null); }}>Delete user</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirmation */}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Confirm Deletion" width={400}>
        {confirm && (
          <div>
            <p style={{ fontSize: 14, color: '#374151', marginBottom: 20 }}>
              Delete <strong>{confirm.FullName}</strong>? This removes all their data and cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setConfirm(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={() => handleDelete(confirm)}>Yes, delete</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
