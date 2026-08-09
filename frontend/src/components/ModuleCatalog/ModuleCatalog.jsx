import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../common/AppShell';
import { getModules } from '../../services/api';

const FILTERS = ['all', 'free', 'premium'];

const STRUCT_ICONS = {
  'linked-list': '⛓',
  'array':       '▦',
  'stack':       '📚',
  'queue':       '🚦',
  'tree':        '🌳',
  'graph':       '🕸',
  'hash-table':  '#',
  'heap':        '⛰',
};

export default function ModuleCatalog() {
  const [modules, setModules]     = useState([]);
  const [filter, setFilter]       = useState('all');
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    setError('');
    getModules(filter)
      .then(res => setModules(res.data.modules || []))
      .catch(() => setError('Failed to load modules.'))
      .finally(() => setLoading(false));
  }, [filter]);

  function handleCardClick(m) {
    if (m.IsPremium) return; // locked — don't navigate
    navigate(`/workspace?module=${m.Slug}`);
  }

  return (
    <AppShell>
      <div style={{ padding: '32px 32px', minHeight: '100%' }}>

        {/* page header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>
            Module Catalog
          </h1>
          <p style={{ fontSize: 14, color: '#64748b' }}>
            Pick a data structure, write your code, watch it come alive.
          </p>
        </div>

        {/* filter chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '7px 18px', borderRadius: 999,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: '1.5px solid',
                borderColor: filter === f ? '#2E74B5' : '#e2e8f0',
                background: filter === f ? '#EFF6FF' : '#fff',
                color: filter === f ? '#2E74B5' : '#64748b',
                transition: 'all 150ms',
              }}
            >
              {f === 'all'     ? '⊞ All'      :
               f === 'free'    ? '✓ Free'     :
                                 '⭐ Premium'}
            </button>
          ))}
        </div>

        {/* error */}
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 10, padding: '12px 16px',
            color: '#dc2626', fontSize: 13, marginBottom: 24,
          }}>{error}</div>
        )}

        {/* grid */}
        {loading ? (
          <SkeletonGrid />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 20,
          }}>
            {modules.map(m => <ModuleCard key={m.ModuleId} module={m} onClick={() => handleCardClick(m)} />)}
            {modules.length === 0 && (
              <p style={{ color: '#94a3b8', gridColumn: '1/-1', textAlign: 'center', paddingTop: 40 }}>
                No modules found.
              </p>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ModuleCard({ module: m, onClick }) {
  const [hovered, setHovered] = useState(false);
  const icon = STRUCT_ICONS[m.Slug] || '◈';
  const locked = !!m.IsPremium;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: locked ? '#fafaf9' : '#fff',
        border: `1.5px solid ${hovered && !locked ? '#2E74B5' : '#e2e8f0'}`,
        borderRadius: 16,
        padding: '24px 22px',
        cursor: locked ? 'default' : 'pointer',
        opacity: locked ? 0.75 : 1,
        transition: 'all 200ms',
        transform: hovered && !locked ? 'translateY(-3px)' : 'none',
        boxShadow: hovered && !locked
          ? '0 8px 24px rgba(46,116,181,.14)'
          : '0 1px 4px rgba(0,0,0,.06)',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* premium overlay tint */}
      {locked && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'repeating-linear-gradient(45deg,transparent,transparent 8px,rgba(0,0,0,.02) 8px,rgba(0,0,0,.02) 16px)',
          borderRadius: 'inherit', pointerEvents: 'none',
        }} />
      )}

      {/* icon */}
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: locked ? '#f1f5f9' : '#EFF6FF',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24, marginBottom: 16,
        border: `1px solid ${locked ? '#e2e8f0' : '#bfdbfe'}`,
      }}>
        {locked ? '🔒' : icon}
      </div>

      {/* name + badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: locked ? '#94a3b8' : '#1e293b', lineHeight: 1.3 }}>
          {m.Name}
        </h3>
        {locked && (
          <span style={{
            flexShrink: 0, padding: '2px 8px', borderRadius: 999,
            background: '#FFF7ED', color: '#F2A93B',
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '.06em', border: '1px solid #fed7aa',
          }}>Premium</span>
        )}
      </div>

      <p style={{
        fontSize: 13, color: locked ? '#94a3b8' : '#64748b',
        lineHeight: 1.6, marginBottom: 16,
      }}>
        {m.Description}
      </p>

      {/* footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: locked ? '#94a3b8' : '#2E74B5',
          textTransform: 'uppercase', letterSpacing: '.05em',
        }}>
          {locked ? 'Upgrade to unlock' : 'Open module →'}
        </span>
        {!locked && m.Progress > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 60, height: 4, borderRadius: 2, background: '#e2e8f0', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', width: `${m.Progress}%`,
                background: '#4CAF50', borderRadius: 2, transition: 'width 400ms',
              }} />
            </div>
            <span style={{ fontSize: 10, color: '#4CAF50', fontWeight: 600 }}>{m.Progress}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
      gap: 20,
    }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{
          borderRadius: 16, padding: '24px 22px',
          border: '1.5px solid #e2e8f0', background: '#fff',
        }}>
          <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 12, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 16, width: '70%', marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 12, width: '100%', marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 12, width: '80%' }} />
        </div>
      ))}
    </div>
  );
}
