import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/common/AppShell';
import { useAuth } from '../context/AuthContext';
import { getCoinWallet, getCoinTransactions, redeemModuleUnlock, getModules } from '../services/api';
import {
  PageHeader, Card, Btn, Badge, THead, TRow, TD,
  Pagination, ErrorBanner, EmptyState, Spinner, Select,
  useToasts, ToastStack, fmtDateTime,
} from '../components/AdminDashboard/ui';
import { useTheme } from '../context/ThemeContext';

const REASON_META = {
  login:               { icon: '📅', label: 'Daily Login' },
  streak_bonus:        { icon: '🔥', label: 'Streak Bonus' },
  module_complete:     { icon: '📦', label: 'Module Explored' },
  clean_run_streak:    { icon: '✨', label: 'Clean Run Streak' },
  feedback:            { icon: '💬', label: 'Feedback' },
  referral:            { icon: '🤝', label: 'Referral' },
  renewal:             { icon: '🔁', label: 'Plan Renewal' },
  redeem_discount:     { icon: '🏷', label: 'Discount Redeemed' },
  redeem_module_unlock:{ icon: '🔓', label: 'Module Unlock' },
  admin_adjust:        { icon: '⚙', label: 'Admin Adjustment' },
};

const EARN_RULES = [
  { icon: '📅', label: 'Daily login', coins: '+5' },
  { icon: '🔥', label: '7-day login streak bonus', coins: '+50' },
  { icon: '📦', label: 'First run of a new module', coins: '+10' },
  { icon: '💬', label: 'Feedback submitted (once/week)', coins: '+15' },
  { icon: '🔁', label: 'Every plan renewal', coins: '+50' },
];

function HeroPill({ children, bg = 'rgba(255,255,255,.16)' }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 12px', borderRadius: 999,
      background: bg, border: '1px solid rgba(255,255,255,.35)',
      fontSize: 12, fontWeight: 600, color: '#fff',
    }}>{children}</span>
  );
}

export default function Coins() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toasts, push } = useToasts();

  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [txRows, setTxRows] = useState([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState(10);
  const [txLoading, setTxLoading] = useState(false);

  const [modules, setModules] = useState([]);
  const [selectedModule, setSelectedModule] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const T=useTheme();
  const loadWallet = useCallback(() => {
    setLoading(true); setError('');
    getCoinWallet()
      .then(r => setWallet(r.data))
      .catch(() => setError('Failed to load your coin wallet.'))
      .finally(() => setLoading(false));
  }, []);
console.table(wallet)
  const loadTx = useCallback(() => {
    setTxLoading(true);
    getCoinTransactions({ page: txPage, pageSize: txPageSize })
      .then(r => { setTxRows(r.data.data || []); setTxTotal(r.data.totalRecords || 0); })
      .catch(() => {})
      .finally(() => setTxLoading(false));
  }, [txPage, txPageSize]);

  useEffect(() => { loadWallet(); }, [loadWallet]);
  useEffect(() => { loadTx(); }, [loadTx]);
  useEffect(() => {
    getModules('all').then(r => setModules(r.data.modules || [])).catch(() => {});
  }, []);

  async function handleUnlockModule() {
    if (!selectedModule) return;
    setRedeeming(true);
    try {
      const r = await redeemModuleUnlock(Number(selectedModule));
      push('success', `Module unlocked until ${new Date(r.data.expiresAt).toLocaleDateString('en-IN')}.`);
      setSelectedModule('');
      loadWallet(); loadTx();
    } catch (e) {
      push('error', e.response?.data?.message || 'Failed to unlock module.');
    } finally {
      setRedeeming(false);
    }
  }

  const locked = !wallet?.coinsUnlocked;

  return (
    <AppShell>
      <div style={{ padding: '32px 32px', maxWidth: 1100, margin: '0 auto' }}>
        <PageHeader
          title="🪙 DSVP Coins"
          subtitle="Earn coins by using DSVP, redeem them for discounts or temporary module unlocks."
        />

        <ErrorBanner message={error} />

        {loading ? <Spinner /> : wallet && (
          <>
            {/* Wallet hero */}
            <Card style={{
              padding: '28px 30px', marginBottom: 24,
              background: 'linear-gradient(135deg,#1F4E79 0%,#2E74B5 60%,#3B82C4 100%)',
              color: '#fff', border: 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                    Your Balance
                  </div>
                  <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>
                    🪙 {wallet.coinBalance.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6 }}>
                    {wallet.coinRate} coins = ₹1 off your next plan purchase (up to {Math.round(wallet.maxDiscountPct * 100 || 40)}% of the order)
                  </div>
                </div>
                {locked ? (
                  <div style={{ textAlign: 'right' }}>
                    <HeroPill>🔒 Locked</HeroPill>
                    <p style={{ fontSize: 13, opacity: 0.9,color:'white', margin: '10px 0 12px', maxWidth: 280 }}>
                      Purchase any plan once to unlock coin earning — every action after that starts counting.
                    </p>
                    <Btn variant="success" onClick={() => navigate('/pricing')}>View Plans →</Btn>
                  </div>
                ) : (
                  <HeroPill bg="rgba(76,175,80,.3)">✓ Unlocked</HeroPill>
                )}
              </div>
            </Card>

            {/* Active module unlocks */}
            {wallet.activeModuleUnlocks?.length > 0 && (
              <Card style={{ padding: 18, marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>🔓 Active Coin Unlocks</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {wallet.activeModuleUnlocks.map(u => (
                    <Badge key={u.ModuleId} variant="premium">
                      Module #{u.ModuleId} · until {new Date(u.ExpiresAt).toLocaleDateString('en-IN')}
                    </Badge>
                  ))}
                </div>
              </Card>
            )}

            {/* How to earn */}
            <Card style={{ padding: 20, marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color:T.text, marginBottom: 14 }}>How to earn coins</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
                {EARN_RULES.map(r => (
                  <div key={r.label} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
                  }}>
                    <span style={{ fontSize: 18 }}>{r.icon}</span>
                    <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>{r.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#4CAF50' }}>{r.coins}</span>
                  </div>
                ))}
              </div>
              {locked && (
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 14 }}>
                  These rules apply once your wallet is unlocked — see above.
                </p>
              )}
            </Card>

            {/* Redeem: module unlock */}
            {!locked && (
              <Card style={{ padding: 20, marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color:T.text, marginBottom: 4 }}>🔓 Unlock a module for 7 days</div>
                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
                  Spend {wallet.moduleUnlockCost} coins to try any Basic/Premium module for a week, without upgrading your plan.
                </p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Select value={selectedModule} onChange={setSelectedModule}>
                    <option value="">Choose a module…</option>
                    {modules.filter(m => !m.HasAccess).map(m => (
                      <option key={m.ModuleId} value={m.ModuleId}>{m.Name} ({m.RequiredPlan})</option>
                    ))}
                  </Select>
                  <Btn
                    variant="primary"
                    disabled={!selectedModule || redeeming || wallet.coinBalance < wallet.moduleUnlockCost}
                    onClick={handleUnlockModule}
                  >
                    {redeeming ? 'Unlocking…' : `Unlock (${wallet.moduleUnlockCost} 🪙)`}
                  </Btn>
                </div>
                {wallet.coinBalance < wallet.moduleUnlockCost && (
                  <p style={{ fontSize: 12, color: '#F2A93B', marginTop: 8 }}>
                    You need {wallet.moduleUnlockCost - wallet.coinBalance} more coins to unlock a module.
                  </p>
                )}
              </Card>
            )}

            {/* Transaction history */}
            <Card>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', fontSize: 14, fontWeight: 700, color: T.text }}>
                Coin History
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <THead cols={['Activity', 'Detail', 'Amount', 'Balance', 'Date']} />
                  <tbody>
                    {txLoading ? (
                      <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</td></tr>
                    ) : txRows.length === 0 ? (
                      <tr><td colSpan={5}><EmptyState icon="🪙" title="No coin activity yet"
                        subtitle={locked ? 'Purchase a plan to start earning.' : 'Log in daily, explore modules, and give feedback to earn coins.'} /></td></tr>
                    ) : txRows.map(t => {
                      const meta = REASON_META[t.Reason] || { icon: '🪙', label: t.Reason };
                      return (
                        <TRow key={t.TransactionId}>
                          <TD>{meta.icon} {meta.label}</TD>
                          <TD style={{ color: T.text }}>{t.Description || '—'}</TD>
                          <TD style={{ fontWeight: 700, color: t.Amount >= 0 ? '#4CAF50' : '#dc2626' }}>
                            {t.Amount >= 0 ? '+' : ''}{t.Amount}
                          </TD>
                          <TD style={{ color: T.text }}>{t.BalanceAfter}</TD>
                          <TD style={{ color: T.textSecondary, whiteSpace: 'nowrap' }}>{fmtDateTime(t.CreatedAt)}</TD>
                        </TRow>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={txPage} total={txTotal} pageSize={txPageSize} onChange={setTxPage} onPageSizeChange={setTxPageSize} />
            </Card>
          </>
        )}
      </div>
      <ToastStack toasts={toasts} />
    </AppShell>
  );
}
