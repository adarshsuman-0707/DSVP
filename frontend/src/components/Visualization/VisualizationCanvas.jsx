import { useState, useEffect, useRef } from 'react';
import ArrayVisualizer from './ArrayVisualizer';
import CallStackPanel  from './CallStackPanel';
import ExecutionHistoryPanel from './ExecutionHistoryPanel';

/**
 * VisualizationCanvas
 * ────────────────────
 * Routes to the correct structure visualizer (left panel)
 * and shows CallStackPanel + ExecutionHistoryPanel (right panel).
 * Both horizontal (left/right) and vertical (call stack/history) resizing!
 */
export default function VisualizationCanvas({ moduleSlug, event, totalSteps, allEvents = [], currentStep = 0 }) {
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const [callStackHeight, setCallStackHeight] = useState(300);
  const [isResizingH, setIsResizingH] = useState(false);
  const [isResizingV, setIsResizingV] = useState(false);
  const containerRef = useRef(null);
  const rightPanelRef = useRef(null);

  // Horizontal resize (left/right split)
  useEffect(() => {
    if (!isResizingH) return;

    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = containerRect.right - e.clientX;
      setRightPanelWidth(Math.max(200, Math.min(600, newWidth)));
    };

    const handleMouseUp = () => setIsResizingH(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingH]);

  // Vertical resize (call stack/history split)
  useEffect(() => {
    if (!isResizingV) return;

    const handleMouseMove = (e) => {
      if (!rightPanelRef.current) return;
      const panelRect = rightPanelRef.current.getBoundingClientRect();
      const newHeight = e.clientY - panelRect.top;
      setCallStackHeight(Math.max(150, Math.min(panelRect.height - 150, newHeight)));
    };

    const handleMouseUp = () => setIsResizingV(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingV]);

  if (!event) {
    return (
      <div 
        ref={containerRef}
        style={{ display: 'flex', height: '100%', userSelect: (isResizingH || isResizingV) ? 'none' : 'auto' }}
      >
        <div style={{ flex: 1 }}>
          <NoEventState moduleSlug={moduleSlug} />
        </div>
        
        {/* Horizontal Resize Handle */}
        <div
          onMouseDown={() => setIsResizingH(true)}
          style={{
            width: 4,
            cursor: 'col-resize',
            background: isResizingH ? 'rgba(76,175,80,.5)' : 'rgba(255,255,255,.08)',
            transition: isResizingH ? 'none' : 'background 150ms ease',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 20,
            height: 40,
            background: isResizingH ? 'rgba(76,175,80,.3)' : 'transparent',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: '#8b949e',
          }}>
            ⋮
          </div>
        </div>

        <div ref={rightPanelRef} style={{ width: rightPanelWidth, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: callStackHeight, overflow: 'hidden' }}>
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
          
          {/* Vertical Resize Handle */}
          <div
            onMouseDown={() => setIsResizingV(true)}
            style={{
              height: 4,
              cursor: 'row-resize',
              background: isResizingV ? 'rgba(76,175,80,.5)' : 'rgba(255,255,255,.07)',
              transition: isResizingV ? 'none' : 'background 150ms ease',
              flexShrink: 0,
            }}
          />
          
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <ExecutionHistoryPanel events={[]} currentStep={0} />
          </div>
        </div>
      </div>
    );
  }

  // 'line' events only update the editor highlight — don't change array view
  // We pass all fields through; CallStackPanel handles call/return/line.
  return (
    <div 
      ref={containerRef}
      style={{ display: 'flex', height: '100%', overflow: 'hidden', userSelect: (isResizingH || isResizingV) ? 'none' : 'auto' }}
    >

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

      {/* ── Horizontal Resize Handle ── */}
      <div
        onMouseDown={() => setIsResizingH(true)}
        style={{
          width: 4,
          cursor: 'col-resize',
          background: isResizingH ? 'rgba(76,175,80,.5)' : 'rgba(255,255,255,.08)',
          transition: isResizingH ? 'none' : 'background 150ms ease',
          position: 'relative',
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 20,
          height: 40,
          background: isResizingH ? 'rgba(76,175,80,.3)' : 'transparent',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          color: '#8b949e',
        }}>
          ⋮
        </div>
      </div>

      {/* ── Right: call stack + execution history ── */}
      <div ref={rightPanelRef} style={{ width: rightPanelWidth, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: callStackHeight, overflow: 'hidden' }}>
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
        
        {/* Vertical Resize Handle */}
        <div
          onMouseDown={() => setIsResizingV(true)}
          style={{
            height: 4,
            cursor: 'row-resize',
            background: isResizingV ? 'rgba(76,175,80,.5)' : 'rgba(255,255,255,.07)',
            transition: isResizingV ? 'none' : 'background 150ms ease',
            flexShrink: 0,
            zIndex: 10,
          }}
        />
        
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ExecutionHistoryPanel events={allEvents} currentStep={currentStep} />
        </div>
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
