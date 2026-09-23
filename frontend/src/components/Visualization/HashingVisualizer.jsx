/**
 * HashingVisualizer — separate-chaining hash table visualizer
 * ─────────────────────────────────────────────────────────────
 * Renders each bucket as a horizontal row; a bucket with more than one
 * entry (a collision) shows its entries chained left-to-right, mirroring
 * how a real linked-chain hash table stores colliding keys. Driven by
 * hash_init/hash_put/hash_get/hash_remove events (hashState/tableSize/
 * activeBucket/activeKey/found from traceGeneratorService's buildHashEvt).
 */

import { useEffect, useRef, useState } from 'react';

// Above this many buckets, a one-row-per-bucket list means constant
// scrolling just to see where an operation landed — a compact grid (each
// bucket as a small cell, entry count instead of full chain) fits the
// whole table on screen and reads much better for large hash tables.
const GRID_VIEW_THRESHOLD = 24;

const OP_META_DARK = {
  hash_put:    { color: '#10b981', border: 'rgba(16,185,129,0.5)', bg: 'rgba(16,185,129,0.14)', label: 'PUT',    icon: '✎' },
  hash_get:    { color: '#06b6d4', border: 'rgba(6,182,212,0.5)',  bg: 'rgba(6,182,212,0.14)',  label: 'GET',    icon: '👁' },
  hash_remove: { color: '#ef4444', border: 'rgba(239,68,68,0.5)',  bg: 'rgba(239,68,68,0.14)',  label: 'REMOVE', icon: '✕' },
  hash_init:   { color: '#a855f7', border: 'rgba(168,85,247,0.5)', bg: 'rgba(168,85,247,0.14)', label: 'INIT',   icon: '⚡' },
};
const OP_META_LIGHT = {
  hash_put:    { color: '#047857', border: 'rgba(4,120,87,0.4)',   bg: 'rgba(16,185,129,0.12)', label: 'PUT',    icon: '✎' },
  hash_get:    { color: '#0e7490', border: 'rgba(14,116,144,0.4)', bg: 'rgba(6,182,212,0.12)',  label: 'GET',    icon: '👁' },
  hash_remove: { color: '#b91c1c', border: 'rgba(185,28,28,0.4)',  bg: 'rgba(239,68,68,0.12)',  label: 'REMOVE', icon: '✕' },
  hash_init:   { color: '#7e22ce', border: 'rgba(126,34,206,0.4)', bg: 'rgba(168,85,247,0.12)', label: 'INIT',   icon: '⚡' },
};

const PALETTE = {
  dark: {
    bg: '#0d1117', text: '#e6edf3', textMuted: '#8b949e', textFaint: '#475569',
    hairline: 'rgba(255,255,255,.07)',
    bucketBg: 'rgba(30,41,59,0.6)', bucketBorder: 'rgba(255,255,255,0.1)',
    entryBg: 'rgba(51,65,85,0.7)', entryBorder: 'rgba(255,255,255,0.12)',
    descBg: 'rgba(15,23,42,0.72)',
    emptyIconBg: 'rgba(255,255,255,0.03)', emptyIconBorder: 'rgba(255,255,255,0.1)',
    consolePre: '#f8fafc', notFoundBg: 'rgba(239,68,68,0.1)', notFoundBorder: 'rgba(239,68,68,0.35)', notFoundText: '#fca5a5',
  },
  light: {
    bg: '#ffffff', text: '#1e293b', textMuted: '#64748b', textFaint: '#94a3b8',
    hairline: '#e2e8f0',
    bucketBg: '#f6f8fa', bucketBorder: '#d0d7de',
    entryBg: '#eef2f7', entryBorder: '#d0d7de',
    descBg: '#f6f8fa',
    emptyIconBg: '#f6f8fa', emptyIconBorder: '#d0d7de',
    consolePre: '#1e293b', notFoundBg: '#fef2f2', notFoundBorder: '#fecaca', notFoundText: '#b91c1c',
  },
};

function getOpMeta(type, theme = 'dark') {
  const map = theme === 'light' ? OP_META_LIGHT : OP_META_DARK;
  return map[type] || map.hash_init;
}

const MODE_LABELS = {
  chaining: 'Separate Chaining',
  linear: 'Linear Probing',
  quadratic: 'Quadratic Probing',
  double: 'Double Hashing',
};

export default function HashingVisualizer({
  hashState   = [],
  tableSize   = 0,
  hashMode    = 'chaining',
  activeBucket = null,
  activeKey   = null,
  found       = null,
  tombstones  = [],
  probeSeq    = [],
  type        = 'hash_init',
  description = '',
  step        = 0,
  totalSteps  = 0,
  userOutput  = '',
  theme       = 'dark',
}) {
  const pal = PALETTE[theme] || PALETTE.dark;
  const meta = getOpMeta(type, theme);
  const buckets = hashState.length > 0 ? hashState : Array.from({ length: tableSize }, () => []);
  const listRef = useRef(null);
  const [viewMode, setViewMode] = useState(buckets.length > GRID_VIEW_THRESHOLD ? 'grid' : 'list');
  const autoSwitched = useRef(false);

  // Once the table crosses the threshold (e.g. after a resize), default to
  // grid automatically — but only once, so a manual switch back to list
  // isn't overridden on every subsequent step.
  useEffect(() => {
    if (!autoSwitched.current && buckets.length > GRID_VIEW_THRESHOLD) {
      setViewMode('grid');
      autoSwitched.current = true;
    }
  }, [buckets.length]);

  // The active bucket can easily be scrolled out of view on a table with
  // many buckets (e.g. Java's default capacity 16) — without this, an
  // operation on a lower bucket looks like nothing happened at all, since
  // the highlighted row is simply off-screen below the fold.
  useEffect(() => {
    if (activeBucket == null || !listRef.current) return;
    const row = listRef.current.querySelector(`[data-bucket-idx="${activeBucket}"]`);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeBucket, type, viewMode]);

  if (buckets.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', background: pal.bg, fontFamily: "'Inter', system-ui, sans-serif",
        gap: 16, padding: 32,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: pal.emptyIconBg, border: `1.5px solid ${pal.emptyIconBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30,
        }}>#</div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: pal.text, fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Hash Table Visualizer</p>
          <p style={{ color: pal.textMuted, fontSize: 13, lineHeight: 1.65, maxWidth: 320 }}>
            Write a normal hash-table implementation (any hash function, separate chaining or
            your own collision handling) and run it — DSVP auto-detects put/get/remove and
            animates each bucket here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: pal.bg, fontFamily: "'Inter', system-ui, sans-serif", overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
        borderBottom: `1px solid ${pal.hairline}`, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999,
          background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color,
          fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
        }}>{meta.icon} {meta.label}</span>
        <span style={{ fontSize: 12, color: pal.textMuted }}>{tableSize} buckets</span>
        <span style={{ fontSize: 12, color: pal.textFaint }}>
          {buckets.reduce((n, b) => n + b.length, 0)} entries
        </span>
        {hashMode !== 'chaining' && (
          <span style={{
            padding: '3px 10px', borderRadius: 999, background: pal.bucketBg,
            border: `1px solid ${pal.bucketBorder}`, color: pal.textMuted,
            fontSize: 11, fontWeight: 600,
          }}>{MODE_LABELS[hashMode] || hashMode}</span>
        )}
        {found === false && (
          <span style={{
            padding: '3px 10px', borderRadius: 999, background: pal.notFoundBg,
            border: `1px solid ${pal.notFoundBorder}`, color: pal.notFoundText,
            fontSize: 11, fontWeight: 700,
          }}>NOT FOUND</span>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: pal.bucketBg, border: `1px solid ${pal.hairline}` }}>
          {['list', 'grid'].map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: viewMode === m ? meta.bg : 'transparent',
              color: viewMode === m ? meta.color : pal.textMuted,
              fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
            }}>{m}</button>
          ))}
        </div>
        {totalSteps > 0 && (
          <span style={{ fontSize: 11, color: pal.textFaint }}>Step {step} / {totalSteps}</span>
        )}
      </div>

      {/* Description */}
      {description && (
        <div style={{
          padding: '8px 16px', background: pal.descBg, borderBottom: `1px solid ${pal.hairline}`,
          fontSize: 12.5, color: pal.text, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0,
        }}>{description}</div>
      )}

      {/* Probe trail — open addressing only; shows every slot tried for the
          current operation, in order, so a probing sequence (linear/
          quadratic/double) reads as an animated path rather than just a
          single highlighted slot. */}
      {hashMode !== 'chaining' && probeSeq.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          padding: '8px 16px', borderBottom: `1px solid ${pal.hairline}`, flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: pal.textFaint, textTransform: 'uppercase', letterSpacing: '.05em', marginRight: 4 }}>
            Probe path
          </span>
          {probeSeq.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999,
                fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                background: p.occupied ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.14)',
                border: `1px solid ${p.occupied ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)'}`,
                color: p.occupied ? (theme === 'light' ? '#b91c1c' : '#fca5a5') : (theme === 'light' ? '#047857' : '#10b981'),
              }}>{p.index}</span>
              {i < probeSeq.length - 1 && <span style={{ color: pal.textFaint, fontSize: 12 }}>→</span>}
            </div>
          ))}
        </div>
      )}

      {/* Buckets */}
      {viewMode === 'grid' ? (
        <div ref={listRef} style={{
          flex: 1, minHeight: 0, overflowY: 'auto', padding: 16,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8, alignContent: 'start',
        }}>
          {buckets.map((bucket, idx) => {
            const isActive = idx === activeBucket;
            const hasEntries = bucket.length > 0;
            return (
              <div key={idx} data-bucket-idx={idx} title={hasEntries ? bucket.map(e => `${e.key}:${e.val}`).join(', ') : 'empty'} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 4, padding: '10px 6px', borderRadius: 10, minHeight: 64,
                background: isActive ? meta.bg : (hasEntries ? pal.entryBg : pal.bucketBg),
                border: `1.5px solid ${isActive ? meta.border : (hasEntries ? pal.entryBorder : pal.bucketBorder)}`,
                transition: 'all 180ms ease', cursor: hasEntries ? 'default' : undefined,
              }}>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                  color: isActive ? meta.color : pal.textFaint,
                }}>[{idx}]</span>
                {hasEntries ? (
                  <>
                    <span style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, maxWidth: '100%',
                      overflow: 'hidden', fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700,
                        color: isActive ? meta.color : pal.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%',
                      }}>{bucket[0].key}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 500,
                        color: isActive ? meta.color : pal.textMuted,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%',
                      }}>{bucket[0].val}</span>
                    </span>
                    {bucket.length > 1 && (
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, color: pal.textFaint,
                        padding: '1px 6px', borderRadius: 999, background: pal.bucketBg,
                      }}>+{bucket.length - 1} more</span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 16, color: pal.textFaint, opacity: 0.4 }}>·</span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {buckets.map((bucket, idx) => {
          const isActive = idx === activeBucket;
          return (
            <div key={idx} data-bucket-idx={idx} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 10,
              background: isActive ? meta.bg : pal.bucketBg,
              border: `1.5px solid ${isActive ? meta.border : pal.bucketBorder}`,
              transition: 'all 180ms ease',
            }}>
              <span style={{
                minWidth: 28, textAlign: 'right', fontSize: 12, fontWeight: 700,
                color: isActive ? meta.color : pal.textFaint,
                fontFamily: "'JetBrains Mono', monospace", flexShrink: 0,
              }}>[{idx}]</span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, minHeight: 28 }}>
                {bucket.length === 0 ? (
                  <span style={{ fontSize: 11.5, color: pal.textFaint, fontStyle: 'italic' }}>
                    {tombstones.includes(idx) ? 'deleted (tombstone)' : 'empty'}
                  </span>
                ) : bucket.map((entry, i) => {
                  const entryActive = isActive && activeKey != null && String(entry.key) === String(activeKey);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px', borderRadius: 7,
                        background: entryActive ? meta.bg : pal.entryBg,
                        border: `1px solid ${entryActive ? meta.border : pal.entryBorder}`,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5,
                        color: entryActive ? meta.color : pal.text,
                        fontWeight: entryActive ? 700 : 500,
                      }}>
                        <span>{entry.key}</span>
                        <span style={{ opacity: 0.5 }}>:</span>
                        <span>{entry.val}</span>
                      </span>
                      {i < bucket.length - 1 && <span style={{ color: pal.textFaint, fontSize: 13 }}>→</span>}
                    </div>
                  );
                })}
              </div>

              {bucket.length > 1 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: pal.textFaint,
                  textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0,
                }}>{bucket.length} chained</span>
              )}
            </div>
          );
        })}
      </div>
      )}

      {/* Program output */}
      {userOutput && (
        <div style={{ borderTop: `1px solid ${pal.hairline}`, padding: '8px 16px', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: pal.textFaint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
            Program Output
          </div>
          <pre style={{
            margin: 0, fontSize: 12, color: pal.consolePre, fontFamily: "'JetBrains Mono', monospace",
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 80, overflowY: 'auto',
          }}>{userOutput}</pre>
        </div>
      )}
    </div>
  );
}
