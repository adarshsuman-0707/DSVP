import { memo, useMemo } from 'react';

/**
 * StackQueueInfoPanel
 * ───────────────────
 * Educational panel shown under the Stack / Queue visualizer. It is a pure
 * function of (allEvents, event): everything is derived from the backend's
 * normalized `sqEvent`, so Previous/Next just re-derive it — no animation
 * state to reverse.
 *
 *   - current operation, value (with its semantic type), LIFO/FIFO rule,
 *     complexity and size
 *   - UNDERFLOW / OVERFLOW banner when the real execution rejected the op
 *   - execution history with the current step highlighted
 */

const RULES = {
  stack: 'LIFO — Last In, First Out',
  queue: 'FIFO — First In, First Out',
};

const OP_LABEL = {
  CREATE: 'CREATE', PUSH: 'PUSH', POP: 'POP', PEEK: 'PEEK',
  ENQUEUE: 'ENQUEUE', DEQUEUE: 'DEQUEUE', FRONT: 'PEEK (front)',
  UPDATE: 'UPDATE', UNDERFLOW: 'UNDERFLOW', OVERFLOW: 'OVERFLOW',
};

// Only claim O(1) for the operations the list-backed runtime really does in
// constant time. Queue dequeue on the ArrayList-backed shim shifts elements.
function complexityFor(e) {
  if (!e) return null;
  if (e.structure === 'queue' && e.type === 'DEQUEUE') return 'O(n) in this runtime (list shift); O(1) for a linked / circular queue';
  if (['PUSH', 'POP', 'PEEK', 'ENQUEUE', 'FRONT'].includes(e.type)) return 'O(1)';
  return null;
}

function historyLabel(e) {
  const v = e.displayValue !== undefined ? e.displayValue : '';
  switch (e.type) {
    case 'PUSH': case 'ENQUEUE': return `${e.type}(${v})`;
    case 'POP': case 'DEQUEUE': case 'PEEK': case 'FRONT': return `${e.type}() → ${v}`;
    case 'CREATE': return 'CREATE()';
    default: return e.type;
  }
}

function StackQueueInfoPanel({ allEvents, event, showHistory = false, theme = 'dark' }) {
  const dark = theme !== 'light';
  const c = dark
    ? { bg: 'rgba(15,23,42,.72)', border: 'rgba(255,255,255,.08)', text: '#e2e8f0', muted: '#94a3b8', accent: '#818cf8', cur: 'rgba(99,102,241,.22)' }
    : { bg: '#fff', border: '#d0d7de', text: '#1e293b', muted: '#64748b', accent: '#4f46e5', cur: 'rgba(79,70,229,.12)' };

  const { history, curIdx } = useMemo(() => {
    const list = [];
    let cur = -1;
    (allEvents || []).forEach(e => {
      if (e.sqEvent && e.sqEvent.type !== 'CREATE') {
        list.push(e.sqEvent);
        if (e === event) cur = list.length - 1;
      }
    });
    // `event` may be a line/call step between operations: the current
    // operation is then the latest one that already happened.
    if (cur === -1 && event) {
      const idx = (allEvents || []).indexOf(event);
      let n = -1;
      (allEvents || []).forEach((e, i) => { if (i <= idx && e.sqEvent && e.sqEvent.type !== 'CREATE') n++; });
      cur = n;
    }
    return { history: list, curIdx: cur };
  }, [allEvents, event]);

  const sq = curIdx >= 0 ? history[curIdx] : null;
  const isFailure = sq && (sq.type === 'UNDERFLOW' || sq.type === 'OVERFLOW');
  const structure = sq?.structure || 'stack';
  const name = structure === 'stack' ? 'Stack' : 'Queue';
  const complexity = complexityFor(sq);

  if (!history.length) return null;

  return (
    <div role="region" aria-label={`${name} operation details`}
      style={{ padding: '8px 12px', background: c.bg, borderTop: `1px solid ${c.border}`, color: c.text, fontSize: 12, maxHeight: 220, overflowY: 'auto' }}>

      {isFailure && (
        <div role="alert" style={{ marginBottom: 8, padding: '8px 10px', borderRadius: 6, border: '1px solid #ef4444', background: 'rgba(239,68,68,.12)', color: dark ? '#fca5a5' : '#b91c1c' }}>
          <div style={{ fontWeight: 700 }}>⚠ {name.toUpperCase()} {sq.type}</div>
          <div>Operation: {sq.operation}</div>
          <div>Reason: {sq.reason}</div>
          <div style={{ opacity: .85 }}>Execution stopped at this step.</div>
        </div>
      )}

      {sq && !isFailure && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', marginBottom: 8 }}>
          <span><b>Operation:</b> {OP_LABEL[sq.type] || sq.type}</span>
          {sq.displayValue !== undefined && (
            <span><b>Value:</b> {sq.displayValue} <span style={{ color: c.muted }}>({sq.valueType})</span></span>
          )}
          <span><b>Rule:</b> {RULES[structure]}</span>
          {complexity && <span><b>Complexity:</b> {complexity}</span>}
          <span><b>Size:</b> {sq.newState?.size ?? 0}</span>
          {!sq.mutates && <span style={{ color: c.muted }}>{name} unchanged</span>}
        </div>
      )}

      {showHistory && <><div style={{ color: c.muted, fontWeight: 600, marginBottom: 2 }}>Execution History</div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {history.map((h, i) => {
          const isCur = i === curIdx;
          const future = i > curIdx;
          const fail = h.type === 'UNDERFLOW' || h.type === 'OVERFLOW';
          return (
            <li key={i} aria-current={isCur ? 'step' : undefined}
              style={{ padding: '1px 6px', borderRadius: 4, background: isCur ? c.cur : 'transparent', color: fail ? '#ef4444' : (future ? c.muted : c.text), fontFamily: 'monospace' }}>
              {fail ? '✗' : future ? '·' : isCur ? '→' : '✓'} {fail ? `${h.type} on ${h.operation}()` : historyLabel(h)}
            </li>
          );
        })}
      </ol></>}
    </div>
  );
}

export default memo(StackQueueInfoPanel);
