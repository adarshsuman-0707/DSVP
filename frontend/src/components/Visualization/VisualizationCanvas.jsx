import ArrayVisualizer from './ArrayVisualizer';
import CallStackPanel  from './CallStackPanel';

/**
 * VisualizationCanvas
 * ────────────────────
 * Routes to the correct structure visualizer (left panel)
 * and always shows the CallStackPanel (right panel).
 *
 * FIX: traceGenerator.js now attaches callStack / currentFunc /
 * returningFrame / currentLine / locals / changedVars / sourceLine to
 * EVERY event (previously those fields were undefined, so CallStackPanel
 * always rendered an empty stack — only the array panel ever updated).
 * This component just needs to forward the fuller event to CallStackPanel.
 */
export default function VisualizationCanvas({ moduleSlug, event, totalSteps }) {
  if (!event) {
    return (
      <div style={{ display: 'flex', height: '100%' }}>
        <div style={{ flex: 1 }}>
          <NoEventState moduleSlug={moduleSlug} />
        </div>
        <div style={{ width: 280, flexShrink: 0 }}>
          <CallStackPanel
            callStack={[]}
            currentFunc={null}
            returningFrame={null}
            currentLine={null}
            sourceLine={null}
            locals={null}
            changedVars={[]}
            type=""
            description=""
          />
        </div>
      </div>
    );
  }

  // 'line' events only update the editor highlight — don't change array view
  // We pass all fields through; CallStackPanel handles call/return/line.
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Left: array visualization ── */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <ArrayVisualizer
          arrayState={event.arrayState   ?? []}
          activeIndex={event.activeIndex ?? null}
          secondIndex={event.secondIndex ?? null}
          type={event.type               ?? 'highlight'}
          description={event.type === 'call' || event.type === 'return' || event.type === 'line'
            ? ''   // don't show call/return/line in the array description bar
            : (event.description ?? '')}
          step={event.step               ?? 0}
          totalSteps={totalSteps         ?? 0}
          userOutput={event.userOutput   ?? ''}
        />
      </div>

      {/* ── Right: call stack + live variables ── */}
      <div style={{ width: 280, flexShrink: 0 }}>
        <CallStackPanel
          callStack={event.callStack           ?? []}
          currentFunc={event.currentFunc       ?? null}
          returningFrame={event.returningFrame ?? null}
          currentLine={event.currentLine       ?? null}
          sourceLine={event.sourceLine         ?? null}
          locals={event.locals                 ?? null}
          changedVars={event.changedVars       ?? []}
          type={event.type                     ?? ''}
          description={event.description       ?? ''}
        />
      </div>
    </div>
  );
}

/* ── Empty / pre-run state ─────────────────────────────────────────────── */
const MODULE_META = {
  'array':       { icon: '▦',  label: 'Array'       },
  'linked-list': { icon: '⛓',  label: 'Linked List' },
  'stack':       { icon: '📚', label: 'Stack'       },
  'queue':       { icon: '🚦', label: 'Queue'       },
};

function NoEventState({ moduleSlug }) {
  const meta = MODULE_META[moduleSlug] || { icon: '◈', label: 'Structure' };
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100%', background: '#0d1117',
      fontFamily: "'Inter', system-ui, sans-serif",
      gap: 16, padding: 32,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: 'rgba(255,255,255,.04)',
        border: '1.5px solid rgba(255,255,255,.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 30,
      }}>{meta.icon}</div>

      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#e6edf3', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
          {meta.label} Visualizer
        </p>
        <p style={{ color: '#8b949e', fontSize: 13, lineHeight: 1.65, maxWidth: 300 }}>
          Write your code in the editor, then hit{' '}
          <span style={{
            display: 'inline-block', padding: '1px 8px', borderRadius: 4,
            background: 'rgba(76,175,80,.15)', color: '#86efac',
            fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
          }}>▶ Run</span>{' '}
          to see the step-by-step animation here.
        </p>
      </div>

      {/* hint cards */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
        {getHints(moduleSlug).map(h => (
          <div key={h} style={{
            padding: '6px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,.04)',
            border: '1px solid rgba(255,255,255,.08)',
            fontSize: 12, color: '#8b949e',
            fontFamily: "'JetBrains Mono', monospace",
          }}>{h}</div>
        ))}
      </div>
    </div>
  );
}

function getHints(slug) {
  switch (slug) {
    case 'array': return ['Array(5)', 'arr[0] = 42', 'arr.swap(0, 3)', 'arr[i] (read)'];
    default:      return ['Array(5)', 'arr[i] = v'];
  }
}
