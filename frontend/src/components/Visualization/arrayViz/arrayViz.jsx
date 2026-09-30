import { memo, useState } from 'react';

/**
 * Shared building blocks for the Array and 2D Array visualizers.
 * Renderer-agnostic: everything here consumes the normalized `arrayEvent`
 * (CREATE_ARRAY / ACCESS / ASSIGN / COMPARE / SWAP ...) that
 * traceGeneratorService attaches to array events, plus `locals`.
 */

export const POINTER_COLORS = ['#60a5fa', '#F2A93B', '#e879f9', '#4CAF50', '#fb7185', '#38bdf8', '#facc15', '#a78bfa'];

const MONO = "'JetBrains Mono', monospace";

const T = {
  dark:  { text: '#e6edf3', muted: '#8b949e', faint: 'rgba(255,255,255,.35)', bg: 'rgba(255,255,255,.04)', border: 'rgba(255,255,255,.1)', err: '#f87171', errBg: 'rgba(248,113,113,.1)' },
  light: { text: '#1e293b', muted: '#64748b', faint: '#94a3b8',               bg: '#f6f8fa',               border: '#d0d7de',               err: '#b91c1c', errBg: 'rgba(220,38,38,.07)' },
};
const tk = theme => T[theme] || T.dark;

// Python's instrumenter reports locals as repr() strings, Java's as raw
// JSON numbers — accept both, reject anything that isn't a clean integer.
export function asIndexValue(v) {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return parseInt(v, 10);
  return null;
}

/** Integer locals whose value is a valid index in [0, length). Names are
 *  taken from the trace, never assumed to be i/j. */
export function derivePointers(locals, length, excludeName) {
  if (!locals || typeof locals !== 'object' || length === 0) return [];
  return Object.keys(locals)
    .filter(k => k !== excludeName)
    .map(k => ({ name: k, index: asIndexValue(locals[k]) }))
    .filter(p => p.index !== null && p.index >= 0 && p.index < length)
    .sort((a, b) => a.name.localeCompare(b.name)) // stable order → stable colors
    .map((p, i) => ({ ...p, color: POINTER_COLORS[i % POINTER_COLORS.length] }));
}

export function groupPointersByIndex(pointers) {
  const map = new Map();
  for (const p of pointers) {
    if (!map.has(p.index)) map.set(p.index, []);
    map.get(p.index).push(p);
  }
  return map;
}

/** Names of variables currently holding `value` (used to render arr[i]
 *  instead of arr[2] when i is the variable doing the indexing). */
export function namesHolding(locals, value, excludeName) {
  if (!locals || value === null || value === undefined) return [];
  return Object.keys(locals).filter(k => k !== excludeName && asIndexValue(locals[k]) === value);
}

// A local is "scalar" if its reported value is short and not a
// container/object repr — keeps the variables panel readable.
function scalarEntries(locals, exclude) {
  if (!locals || typeof locals !== 'object') return [];
  return Object.entries(locals)
    .filter(([k, v]) => !exclude.has(k) && v !== null && typeof v !== 'object')
    .map(([k, v]) => [k, String(v)])
    .filter(([, v]) => v.length <= 18 && !/^[[{]/.test(v) && !/[@(]/.test(v));
}

export function parseBoundsError(runError) {
  if (!runError) return null;
  const j = /Index (-?\d+) out of bounds for length (\d+)/i.exec(runError);
  if (j) return { attempted: Number(j[1]), length: Number(j[2]) };
  if (/ArrayIndexOutOfBounds|list index out of range|index out of range/i.test(runError)) {
    return { attempted: null, length: null };
  }
  return null;
}

/* ── Variables panel ────────────────────────────────────────────────── */
export const VariablesPanel = memo(function VariablesPanel({ locals, access = [], exclude = [], theme = 'dark' }) {
  const t = tk(theme);
  const vars = scalarEntries(locals, new Set(exclude));
  if (vars.length === 0 && access.length === 0) return null;
  return (
    <div role="region" aria-label="Variables" style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 16px',
      padding: '8px 20px', borderTop: `1px solid ${t.border}`, flexShrink: 0, background: t.bg,
      fontFamily: MONO, fontSize: 12,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: t.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>Variables</span>
      {vars.map(([k, v]) => (
        <span key={k} style={{ color: t.text }}>
          <span style={{ color: t.muted }}>{k}</span> = <b>{v}</b>
        </span>
      ))}
      {access.length > 0 && (
        <>
          <span style={{ width: 1, alignSelf: 'stretch', background: t.border }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: t.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>Current access</span>
          {access.map(a => (
            <span key={a.label} style={{ color: t.text }}>
              <span style={{ color: a.color || t.muted }}>{a.label}</span> = <b>{a.value}</b>
            </span>
          ))}
        </>
      )}
    </div>
  );
});

/* ── Out-of-bounds banner ───────────────────────────────────────────── */
export function BoundsErrorBanner({ kind = '1d', name = 'arr', error, validRange, theme = 'dark' }) {
  const t = tk(theme);
  if (!error) return null;
  return (
    <div role="alert" style={{
      margin: '10px 20px 0', padding: '10px 14px', borderRadius: 10,
      background: t.errBg, border: `1px solid ${t.err}`, color: t.err,
      fontFamily: MONO, fontSize: 12.5, lineHeight: 1.6, flexShrink: 0,
    }}>
      <div style={{ fontWeight: 800 }}>
        ⚠ {kind === '2d' ? 'Invalid Matrix Access' : 'Array Index Out of Bounds'}
      </div>
      {error.attempted !== null && <div>Attempted: {name}[{error.attempted}]</div>}
      {validRange && <div>Valid {kind === '2d' ? 'rows' : 'indexes'}: {validRange}</div>}
      <div style={{ opacity: 0.8 }}>Execution stopped here.</div>
    </div>
  );
}

/* ── Debug panel (collapsed by default) ─────────────────────────────── */
export function DebugPanel({ event, arrayEvent, theme = 'dark' }) {
  const t = tk(theme);
  const [open, setOpen] = useState(false);
  if (!arrayEvent) return null;
  const rows = [
    ['Execution Step', event?.step],
    ['Event', arrayEvent.type],
    ['Variable', arrayEvent.variable],
    ['Index', arrayEvent.index],
    ['Row', arrayEvent.row],
    ['Column', arrayEvent.column],
    ['Old Value', arrayEvent.oldValue],
    ['New Value', arrayEvent.newValue ?? arrayEvent.value],
    ['Code Line', arrayEvent.lineNumber ?? event?.currentLine],
  ].filter(([, v]) => v !== undefined && v !== null);
  return (
    <div style={{ flexShrink: 0, borderTop: `1px solid ${t.border}`, fontFamily: MONO, fontSize: 11 }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{
        width: '100%', textAlign: 'left', padding: '4px 20px', background: 'transparent',
        border: 'none', color: t.muted, cursor: 'pointer', fontFamily: MONO, fontSize: 10,
        fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em',
      }}>{open ? '▾' : '▸'} Debug</button>
      {open && (
        <div style={{ padding: '2px 20px 8px', display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '2px 14px', color: t.text }}>
          {rows.map(([k, v]) => (
            <span key={k} style={{ display: 'contents' }}>
              <span style={{ color: t.muted }}>{k}</span><span>{String(v)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Shared keyframes (old → new value replace animation) ───────────── */
export function VizKeyframes() {
  return (
    <style>{`
      @keyframes dsvpOldOut { from { opacity: 1; transform: translateY(0) } to { opacity: .55; transform: translateY(-2px) } }
      @keyframes dsvpNewIn  { from { opacity: 0; transform: translateY(8px) scale(.85) } to { opacity: 1; transform: none } }
      @media (prefers-reduced-motion: reduce) { .dsvp-anim { animation: none !important; } }
    `}</style>
  );
}
