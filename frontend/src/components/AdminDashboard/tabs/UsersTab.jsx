import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getMe, getAdminUsers, getAdminUserSummary, updateUserRole, updateUserSubscription, updateUserStatus,
  resetUserPassword, deleteAdminUser,
} from '../../../services/api';
import {
  PageHeader, Card, KpiCard, Btn, Badge, THead, TRow, TD, Avatar,
  SearchBar, Select, Pagination, ErrorBanner, EmptyState, SkeletonRows,
  ActionMenu, ConfirmModal, useToasts, ToastStack, fmtDate, fmtDateTime,
} from '../ui';
import { useTheme } from '../../../context/ThemeContext';
import { useAuth } from '../../../context/AuthContext';

const ROLE_OPTIONS   = [['', 'All roles'], ['user', 'User'], ['admin', 'Admin']];
const STATUS_OPTIONS = [['', 'All status'], ['active', 'Active'], ['inactive', 'Inactive'], ['blocked', 'Blocked']];
const PLAN_OPTIONS   = [['', 'All plans'], ['free', 'Free'], ['basic', 'Basic'], ['premium', 'Premium']];

const BLANK_FILTERS = { search: '', role: '', status: '', plan: '', joinedFrom: '', joinedTo: '' };

export default function UsersTab() {
  const { T } = useTheme();
  const { user: me, updateUser: updateMe } = useAuth();
  const navigate = useNavigate();
  const [users,    setUsers]    = useState([]);
  const [summary,  setSummary]  = useState(null);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters,  setFilters]  = useState(BLANK_FILTERS);
  const [applied,  setApplied]  = useState(BLANK_FILTERS);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [confirm,  setConfirm]  = useState(null);   // { type, user }
  const { toasts, push } = useToasts();

  const load = useCallback(() => {
    setLoading(true); setError('');
    getAdminUsers({
      page, pageSize, search: applied.search,
      role: applied.role || undefined,
      status: applied.status || undefined,
      plan: applied.plan || undefined,
      joinedFrom: applied.joinedFrom || undefined,
      joinedTo: applied.joinedTo || undefined,
    })
      .then(r => { setUsers(r.data.data || []); setTotal(r.data.totalRecords || 0); })
      .catch(() => setError('Failed to load users.'))
      .finally(() => setLoading(false));
  }, [page, pageSize, applied]);

  const loadSummary = useCallback(() => {
    getAdminUserSummary().then(r => setSummary(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { setPage(1); }, [applied]);

  function applyFilters() { setApplied(filters); }
  function resetFilters() { setFilters(BLANK_FILTERS); setApplied(BLANK_FILTERS); }

  function updateRow(userId, patch) {
    setUsers(prev => prev.map(u => u.UserId === userId ? { ...u, ...patch } : u));
  }

  async function handleRoleToggle(user) {
    const newRole = user.Role === 'admin' ? 'user' : 'admin';
    try {
      await updateUserRole(user.UserId, newRole);
      updateRow(user.UserId, { Role: newRole });
      push('success', `${user.FullName} is now ${newRole === 'admin' ? 'an Admin' : 'a User'}.`);
    } catch { push('error', 'Failed to update role.'); }
  }

  async function handlePlanChange(user, plan) {
    try {
      await updateUserSubscription(user.UserId, plan);
      if (user.UserId === me?.UserId) getMe().then(res => updateMe(res.data.user)).catch(() => {});
      updateRow(user.UserId, { IsPremium: plan !== 'free', SubscriptionPlan: plan });
      push('success', `Plan set to ${plan}.`);
    } catch { push('error', 'Failed to update plan.'); }
  }

  async function handleStatusChange(user, status) {
    try {
      await updateUserStatus(user.UserId, status);
      updateRow(user.UserId, { Status: status });
      loadSummary();
      const verb = { active: 'activated', inactive: 'deactivated', blocked: 'blocked' }[status];
      push('success', `User ${verb} successfully.`);
    } catch (e) { push('error', e.response?.data?.message || 'Failed to update status.'); }
  }

  async function handleResetPassword(user) {
    try {
      await resetUserPassword(user.UserId);
      push('success', 'Password reset email sent successfully.');
    } catch (e) { push('error', e.response?.data?.message || 'Failed to reset password.'); }
  }

  async function handleDelete(user) {
    try {
      await deleteAdminUser(user.UserId);
      setUsers(prev => prev.filter(u => u.UserId !== user.UserId));
      setTotal(t => t - 1);
      loadSummary();
      push('success', 'User deleted successfully.');
    } catch { push('error', 'Failed to delete user.'); }
  }

  function openConfirm(type, user) { setConfirm({ type, user }); }
  function closeConfirm() { setConfirm(null); }

  async function runConfirmed() {
    if (!confirm) return;
    const { type, user } = confirm;
    if (type === 'activate')   await handleStatusChange(user, 'active');
    if (type === 'deactivate') await handleStatusChange(user, 'inactive');
    if (type === 'block')      await handleStatusChange(user, 'blocked');
    if (type === 'reset')      await handleResetPassword(user);
    if (type === 'delete')     await handleDelete(user);
    closeConfirm();
  }

  const CONFIRM_COPY = {
    activate:   { title: 'Activate User',   message: `Are you sure you want to activate ${confirm?.user?.FullName}?`, label: 'Activate' },
    deactivate: { title: 'Deactivate User', message: `Are you sure you want to deactivate ${confirm?.user?.FullName}? Their current session will be ended immediately.`, label: 'Deactivate', danger: true },
    block:      { title: 'Block User',      message: `Are you sure you want to block ${confirm?.user?.FullName}? Their current session will be ended immediately and access revoked.`, label: 'Block', danger: true },
    reset:      { title: 'Reset Password',  message: `Reset ${confirm?.user?.FullName}'s password and invalidate all active sessions? A secure reset link will be emailed to them.`, label: 'Send Reset Link' },
    delete:     { title: 'Delete User',     message: `Delete ${confirm?.user?.FullName}? This removes all their data and cannot be undone.`, label: 'Delete', danger: true },
  }[confirm?.type] || {};

  return (
    <div style={{ padding: '32px 32px' }}>
      <PageHeader title="Users" subtitle="Manage users, access, plans and account status." />

      <ErrorBanner message={error} />

      {/* Statistics cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 16, marginBottom: 24 }}>
          <KpiCard icon="👥" label="Total Users"    value={summary.TotalUsers}    color="#2E74B5" bg="#EFF6FF" />
          <KpiCard icon="🟢" label="Active Users"   value={summary.ActiveUsers}   color="#4CAF50" bg="#F0FDF4" />
          <KpiCard icon="🟡" label="Inactive Users" value={summary.InactiveUsers} color="#F2A93B" bg="#FFF7ED" />
          <KpiCard icon="🔴" label="Blocked Users"  value={summary.BlockedUsers}  color="#dc2626" bg="#fef2f2" />
        </div>
      )}

      {/* Filters */}
      <Card style={{ padding: 18, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 240px', minWidth: 220 }}>
            <SearchBar value={filters.search} onChange={v => setFilters(f => ({ ...f, search: v }))} placeholder="Search name, email, or user ID…" />
          </div>
          <FilterSelect label="Role" value={filters.role} options={ROLE_OPTIONS} onChange={v => setFilters(f => ({ ...f, role: v }))} />
          <FilterSelect label="Status" value={filters.status} options={STATUS_OPTIONS} onChange={v => setFilters(f => ({ ...f, status: v }))} />
          <FilterSelect label="Plan" value={filters.plan} options={PLAN_OPTIONS} onChange={v => setFilters(f => ({ ...f, plan: v }))} />
          <div>
            <label style={labelStyle}>Joined from</label>
            <input type="date" value={filters.joinedFrom} onChange={e => setFilters(f => ({ ...f, joinedFrom: e.target.value }))} style={dateInputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Joined to</label>
            <input type="date" value={filters.joinedTo} onChange={e => setFilters(f => ({ ...f, joinedTo: e.target.value }))} style={dateInputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="primary" onClick={applyFilters}>Apply Filters</Btn>
            <Btn variant="ghost" onClick={resetFilters}>Reset</Btn>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={['User', 'Email', 'Role', 'Plan', 'Status', 'Joined', 'Last Login', 'Modules', 'Actions']} />
            {loading ? <SkeletonRows cols={9} /> : (
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={9}><EmptyState icon="👥" title="No users found" /></td></tr>
                ) : users.map(u => (
                  <TRow key={u.UserId}>
                    <TD>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={u.FullName} size={32} />
                        <div>
                          <div style={{ fontWeight: 600, color: T.mode === 'dark' ? T.text : '#1e293b' }}>{u.FullName}</div>
                          <div style={{ fontSize: 11, color: T.mode === 'dark' ? T.textSecondary : '#94a3b8' }}>#{u.UserId}</div>
                        </div>
                      </div>
                    </TD>
                    <TD style={{ color: T.mode === 'dark' ? T.text : '#64748b' }}>{u.Email}</TD>
                    <TD><Badge variant={u.Role === 'admin' ? 'admin' : 'user'}>{u.Role}</Badge></TD>
                    <TD><Badge variant={u.SubscriptionPlan || 'free'}>{u.SubscriptionPlan || 'free'}</Badge></TD>
                    <TD><Badge variant={u.Status || 'active'}>{u.Status || 'active'}</Badge></TD>
                    <TD style={{ color: T.mode === 'dark' ? T.text : '#94a3b8' }}>{fmtDate(u.CreatedAt)}</TD>
                    <TD style={{ color: T.mode === 'dark' ? T.text : '#94a3b8' }}>{fmtDateTime(u.LastLoginAt)}</TD>
                    <TD>
                      <Btn size="sm" variant="ghost" onClick={() => navigate(`/admin/users/${u.UserId}`)}>View →</Btn>
                    </TD>
                    <TD>
                      <ActionMenu items={[
                        { label: 'View Details', icon: '👁', onClick: () => navigate(`/admin/users/${u.UserId}`) },
                        { label: u.Role === 'admin' ? 'Revoke Admin' : 'Make Admin', icon: '🛡', onClick: () => handleRoleToggle(u) },
                        ...['free', 'basic', 'premium']
                          .filter(p => p !== (u.SubscriptionPlan || 'free'))
                          .map(p => ({ label: `Set plan: ${p[0].toUpperCase()}${p.slice(1)}`, icon: '⭐', onClick: () => handlePlanChange(u, p) })),
                        null,
                        u.Status !== 'active'   && { label: 'Activate User',   icon: '🟢', onClick: () => openConfirm('activate', u) },
                        u.Status !== 'inactive' && { label: 'Deactivate User', icon: '🟡', onClick: () => openConfirm('deactivate', u) },
                        u.Status !== 'blocked'  && { label: 'Block User',      icon: '🔴', onClick: () => openConfirm('block', u) },
                        { label: 'Reset Password', icon: '🔑', onClick: () => openConfirm('reset', u) },
                        null,
                        { label: 'View Activity', icon: '📊', onClick: () => navigate(`/admin/users/${u.UserId}?tab=Activity`) },
                        { label: 'View Payments', icon: '💳', onClick: () => navigate(`/admin/users/${u.UserId}?tab=Payments`) },
                        { label: 'View Feedback', icon: '💬', onClick: () => navigate(`/admin/users/${u.UserId}?tab=Feedback`) },
                        null,
                        { label: 'Delete User', icon: '🗑', danger: true, onClick: () => openConfirm('delete', u) },
                      ].filter(Boolean)} />
                    </TD>
                  </TRow>
                ))}
              </tbody>
            )}
          </table>
        </div>
        <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} onPageSizeChange={setPageSize} />
      </Card>

      <ConfirmModal
        open={!!confirm}
        onClose={closeConfirm}
        title={CONFIRM_COPY.title}
        message={CONFIRM_COPY.message}
        confirmLabel={CONFIRM_COPY.label}
        danger={CONFIRM_COPY.danger}
        onConfirm={runConfirmed}
      />

      <ToastStack toasts={toasts} />
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 };
const dateInputStyle = {
  padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0',
  fontSize: 13, outline: 'none', background: '#f8fafc', fontFamily: 'inherit',
};

function FilterSelect({ label, value, options, onChange }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <Select value={value} onChange={onChange}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
    </div>
  );
}
