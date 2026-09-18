import { useState, useEffect, useRef, useMemo } from 'react';
import MultiArrayVisualizer   from './MultiArrayVisualizer';
import Grid2DVisualizer       from './Grid2DVisualizer';
import LinkedListVisualizer   from './LinkedListVisualizer';
import StackVisualizer        from './StackVisualizer';
import QueueVisualizer        from './QueueVisualizer';
import BSTVisualizer          from './BSTVisualizer';
import CallStackPanel         from './CallStackPanel';
import ExecutionHistoryPanel  from './ExecutionHistoryPanel';

const ARRAY2D_EVENT_TYPES = new Set(['init2d', 'read2d', 'write2d']);

function isArray2DEvent(event) {
  return event && ARRAY2D_EVENT_TYPES.has(event.type);
}

function isArray2DModule(slug) {
  return slug === '2d-array';
}

/* ── helper: is this event a linked-list event? ── */
const LL_EVENT_TYPES = new Set([
  'll_snap','ll_init','ll_update','ll_insert','ll_delete','ll_traverse'
]);

function isLLEvent(event) {
  return event && LL_EVENT_TYPES.has(event.type);
}

/**
 * All linked-list module slugs → always show LinkedListVisualizer.
 */
const LL_MODULE_SLUGS = new Set([
  'linked-list',
  'doubly-linked-list',
  'circular-linked-list',
  'circular-doubly-linked-list',
]);

function isLLModule(slug) {
  return LL_MODULE_SLUGS.has(slug);
}

function isStackModule(slug) {
  return slug === 'stack';
}

function isQueueModule(slug) {
  return slug === 'queue';
}

/* ── helper: is this event a BST (tree) event? ── */
const BST_EVENT_TYPES = new Set([
  'bst_snap','bst_init','bst_update','bst_insert','bst_delete','bst_traverse'
]);

function isBSTEvent(event) {
  return event && BST_EVENT_TYPES.has(event.type);
}

function isBSTModule(slug) {
  return slug === 'bst';
}

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

  /**
   * FIX: Sticky state refs — line/call/return trace events carry no
   * linkedListState / arrayState. Without these refs the visualizer would
   * receive an empty [] every time a trace event fires → blank/flicker.
   * We remember the last non-empty state and keep showing it.
   */
  const lastLLStateRef    = useRef([]);
  const lastLLActivRef    = useRef(-1);
  const lastLLTypeRef     = useRef('ll_snap');
  const lastLLDescRef     = useRef('');
  const lastLLOutputRef   = useRef('');
  const lastArrStateRef   = useRef([]);
  const lastArrActiveRef  = useRef(null);
  const lastArrSecondRef  = useRef(null);
  const lastArrTypeRef    = useRef('highlight');
  const lastArrDescRef    = useRef('');
  const lastArrOutputRef  = useRef('');
  // Multi-array sticky state — one panel per distinct source variable,
  // instead of a second array overwriting the first's display.
  const lastArraysRef        = useRef([]);
  const lastActiveArrayVarRef = useRef(null);
  // Dedicated sticky refs for Stack — separate from array so switching
  // modules doesn't bleed state across visualizers
  const lastStackStateRef  = useRef([]);
  const lastStackActiveRef = useRef(null);
  const lastStackTypeRef   = useRef('highlight');
  const lastStackDescRef   = useRef('');
  const lastStackOutputRef = useRef('');
  // Dedicated sticky refs for Queue — separate from array/stack so
  // switching modules doesn't bleed state across visualizers
  const lastQueueStateRef  = useRef([]);
  const lastQueueActiveRef = useRef(null);
  const lastQueueTypeRef   = useRef('highlight');
  const lastQueueDescRef   = useRef('');
  const lastQueueOutputRef = useRef('');
  // Dedicated sticky refs for BST — separate from LL so switching
  // modules doesn't bleed state across visualizers
  const lastBSTStateRef    = useRef([]);
  const lastBSTActiveRef   = useRef(-1);
  const lastBSTTypeRef     = useRef('bst_snap');
  const lastBSTDescRef     = useRef('');
  const lastBSTOutputRef   = useRef('');
  // Dedicated sticky refs for 2D Array
  const lastGrid2DStateRef  = useRef([]);
  const lastGrid2DRowRef    = useRef(null);
  const lastGrid2DColRef    = useRef(null);
  const lastGrid2DTypeRef   = useRef('highlight');
  const lastGrid2DDescRef   = useRef('');
  const lastGrid2DOutputRef = useRef('');

  /* Update sticky refs whenever the current event carries fresh data.
     Using useEffect to avoid mutating refs during render (React rule). */
  useEffect(() => {
    if (!event) return;

    if (isLLEvent(event)) {
      if (event.linkedListState) lastLLStateRef.current  = event.linkedListState;
      lastLLActivRef.current  = event.activeNodeId  ?? -1;
      lastLLTypeRef.current   = event.type          ?? 'll_snap';
      lastLLDescRef.current   = isExecEvent(event.type) ? '' : (event.description ?? '');
      lastLLOutputRef.current = event.userOutput    ?? '';
    }

    // arrayState is on every event (carries last snap) — update all that need it
    if (event.arrayState !== undefined) {
      lastArrStateRef.current  = event.arrayState;
      lastArrActiveRef.current = event.activeIndex  ?? null;
      lastArrSecondRef.current = event.secondIndex  ?? null;
      lastArrTypeRef.current   = event.type         ?? 'highlight';
      lastArrDescRef.current   = isExecEvent(event.type) ? '' : (event.description ?? '');
      lastArrOutputRef.current = event.userOutput   ?? '';
      if (event.arrays !== undefined) lastArraysRef.current = event.arrays;
      lastActiveArrayVarRef.current = event.activeArrayVar ?? null;

      // Stack: reuse array events to drive StackVisualizer
      if (isStackModule(moduleSlug)) {
        lastStackStateRef.current  = event.arrayState;
        lastStackActiveRef.current = event.activeIndex ?? null;
        const stackType = mapArrayTypeToStack(event.type);
        lastStackTypeRef.current   = stackType;
        lastStackDescRef.current   = isExecEvent(event.type) ? '' : stackDesc(stackType, event);
        lastStackOutputRef.current = event.userOutput ?? '';
      }
    }

    // Explicit stackState (future stack_push / stack_pop ops)
    if (event.stackState) {
      lastStackStateRef.current  = event.stackState;
      lastStackActiveRef.current = event.activeIndex ?? null;
      lastStackTypeRef.current   = event.type ?? 'highlight';
      lastStackDescRef.current   = isExecEvent(event.type) ? '' : (event.description ?? '');
      lastStackOutputRef.current = event.userOutput ?? '';
    }

    // Queue: reuse array events to drive QueueVisualizer (array events are
    // updated unconditionally above whenever event.arrayState is present)
    if (event.arrayState !== undefined && isQueueModule(moduleSlug)) {
      lastQueueStateRef.current  = event.arrayState;
      lastQueueActiveRef.current = event.activeIndex ?? null;
      const queueType = mapArrayTypeToQueue(event.type);
      lastQueueTypeRef.current   = queueType;
      lastQueueDescRef.current   = isExecEvent(event.type) ? '' : queueDesc(queueType, event);
      lastQueueOutputRef.current = event.userOutput ?? '';
    }

    // Explicit queueState (future queue_enqueue / queue_dequeue ops)
    if (event.queueState) {
      lastQueueStateRef.current  = event.queueState;
      lastQueueActiveRef.current = event.activeIndex ?? null;
      lastQueueTypeRef.current   = event.type ?? 'highlight';
      lastQueueDescRef.current   = isExecEvent(event.type) ? '' : (event.description ?? '');
      lastQueueOutputRef.current = event.userOutput ?? '';
    }

    if (isBSTEvent(event)) {
      if (event.treeState) lastBSTStateRef.current  = event.treeState;
      lastBSTActiveRef.current  = event.activeTreeNodeId ?? -1;
      lastBSTTypeRef.current    = event.type             ?? 'bst_snap';
      lastBSTDescRef.current    = isExecEvent(event.type) ? '' : (event.description ?? '');
      lastBSTOutputRef.current  = event.userOutput       ?? '';
    }

    // grid2dState is on every event once a 2D array exists (carries last
    // snap), same pattern as arrayState above.
    if (event.grid2dState !== undefined) {
      lastGrid2DStateRef.current  = event.grid2dState;
      lastGrid2DRowRef.current    = event.activeRow ?? null;
      lastGrid2DColRef.current    = event.activeCol ?? null;
      lastGrid2DTypeRef.current   = event.type      ?? 'highlight';
      lastGrid2DDescRef.current   = isExecEvent(event.type) ? '' : (event.description ?? '');
      lastGrid2DOutputRef.current = event.userOutput ?? '';
    }
  }, [event, moduleSlug]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Determine session types once per run
  const isLLSession = useMemo(() => {
    if (isLLModule(moduleSlug)) return true;
    if (allEvents.some(e => isLLEvent(e) || (e.linkedListState && e.linkedListState.length > 0))) return true;
    if (isLLEvent(event)) return true;
    return false;
  }, [moduleSlug, allEvents, event]);

  const isDoublySession = useMemo(() => {
    if (moduleSlug === 'doubly-linked-list' || moduleSlug === 'circular-doubly-linked-list') return true;
    if (event?.isDoubly === true) return true;
    if (allEvents.some(e => e.isDoubly || e.linkedListState?.some(n => n.prevId !== undefined && n.prevId !== null && n.prevId !== -1))) return true;
    return false;
  }, [moduleSlug, event, allEvents]);

  const isStackSession = useMemo(() => {
    if (isStackModule(moduleSlug)) return true;
    if (event?.type?.startsWith('stack_') || Boolean(event?.stackState)) return true;
    if (allEvents.some(e => e.type?.startsWith('stack_') || Boolean(e.stackState))) return true;
    return false;
  }, [moduleSlug, event, allEvents]);

  const isQueueSession = useMemo(() => {
    if (isQueueModule(moduleSlug)) return true;
    if (event?.type?.startsWith('queue_') || Boolean(event?.queueState)) return true;
    if (allEvents.some(e => e.type?.startsWith('queue_') || Boolean(e.queueState))) return true;
    return false;
  }, [moduleSlug, event, allEvents]);

  const isArray2DSession = useMemo(() => {
    if (isArray2DModule(moduleSlug)) return true;
    if (isArray2DEvent(event) || (event?.grid2dState && event.grid2dState.length > 0)) return true;
    if (allEvents.some(e => isArray2DEvent(e) || (e.grid2dState && e.grid2dState.length > 0))) return true;
    return false;
  }, [moduleSlug, event, allEvents]);

  const isBSTSession = useMemo(() => {
    if (isBSTModule(moduleSlug)) return true;
    if (allEvents.some(e => isBSTEvent(e) || (e.treeState && e.treeState.length > 0))) return true;
    if (isBSTEvent(event)) return true;
    return false;
  }, [moduleSlug, allEvents, event]);

  if (!event) {
    return (
      <div 
        ref={containerRef}
        style={{ display: 'flex', height: '100%', userSelect: (isResizingH || isResizingV) ? 'none' : 'auto' }}
      >
        <div style={{ flex: 1 }}>
          {isLLSession ? (
            <LinkedListVisualizer linkedListState={[]} isDoubly={isDoublySession} />
          ) : isBSTSession ? (
            <BSTVisualizer treeState={[]} />
          ) : isStackSession ? (
            <StackVisualizer stackState={[]} />
          ) : isQueueSession ? (
            <QueueVisualizer queueState={[]} />
          ) : isArray2DSession ? (
            <Grid2DVisualizer grid2dState={[]} />
          ) : (
            <NoEventState moduleSlug={moduleSlug} />
          )}
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

      {/* ── Left: structure visualizer (routed by moduleSlug & session) ── */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {isLLSession ? (
          <LinkedListVisualizer
            linkedListState={lastLLStateRef.current}
            activeNodeId={lastLLActivRef.current}
            type={lastLLTypeRef.current}
            description={lastLLDescRef.current}
            step={event.step       ?? 0}
            totalSteps={totalSteps ?? 0}
            userOutput={lastLLOutputRef.current}
            isDoubly={isDoublySession}
          />
        ) : isBSTSession ? (
          <BSTVisualizer
            treeState={lastBSTStateRef.current}
            activeNodeId={lastBSTActiveRef.current}
            type={lastBSTTypeRef.current}
            description={lastBSTDescRef.current}
            step={event.step       ?? 0}
            totalSteps={totalSteps ?? 0}
            userOutput={lastBSTOutputRef.current}
          />
        ) : isStackSession ? (
          <StackVisualizer
            stackState={lastStackStateRef.current}
            activeIndex={lastStackActiveRef.current}
            type={lastStackTypeRef.current}
            description={lastStackDescRef.current}
            step={event.step       ?? 0}
            totalSteps={totalSteps ?? 0}
            userOutput={lastStackOutputRef.current}
          />
        ) : isQueueSession ? (
          <QueueVisualizer
            queueState={lastQueueStateRef.current}
            activeIndex={lastQueueActiveRef.current}
            type={lastQueueTypeRef.current}
            description={lastQueueDescRef.current}
            step={event.step       ?? 0}
            totalSteps={totalSteps ?? 0}
            userOutput={lastQueueOutputRef.current}
          />
        ) : isArray2DSession ? (
          <Grid2DVisualizer
            grid2dState={lastGrid2DStateRef.current}
            activeRow={lastGrid2DRowRef.current}
            activeCol={lastGrid2DColRef.current}
            type={lastGrid2DTypeRef.current}
            description={lastGrid2DDescRef.current}
            step={event.step       ?? 0}
            totalSteps={totalSteps ?? 0}
            userOutput={lastGrid2DOutputRef.current}
          />
        ) : (
          <MultiArrayVisualizer
            arrays={lastArraysRef.current}
            activeArrayVar={lastActiveArrayVarRef.current}
            arrayState={lastArrStateRef.current}
            activeIndex={lastArrActiveRef.current}
            secondIndex={lastArrSecondRef.current}
            type={lastArrTypeRef.current}
            description={lastArrDescRef.current}
            step={event.step       ?? 0}
            totalSteps={totalSteps ?? 0}
            userOutput={lastArrOutputRef.current}
          />
        )}
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
    case 'array':
      return ['int[] arr = {1,2,3}', 'arr[i] = v', 'swap'];
    case 'linked-list':
      return ['class Node { int data; Node next; }', 'head.next = new Node(20)', 'cur = cur.next'];
    default:
      return ['Write your code', 'Hit ▶ Run'];
  }
}

function isExecEvent(type) {
  return type === 'call' || type === 'return' || type === 'line';
}

/** Map generic array op → stack-meaningful type for OP_META colors */
function mapArrayTypeToStack(type) {
  if (!type) return 'highlight';
  if (type === 'append' || type === 'write') return 'push';
  if (type === 'read')  return 'peek';
  if (type === 'delete') return 'pop';
  if (type === 'init')  return 'init';
  if (type === 'swap')  return 'highlight';
  return type;
}

/** Build a human-readable description for the stack operation */
function stackDesc(stackType, event) {
  const val = event.value ?? (event.arrayState ? event.arrayState[event.activeIndex] : null);
  switch (stackType) {
    case 'push': return val != null ? `Push ${val}` : 'Push';
    case 'peek': return val != null ? `Peek → ${val}` : 'Peek (top)';
    case 'pop':  return val != null ? `Pop ${val}` : 'Pop';
    case 'init': return `Stack initialized (${event.arrayState?.length ?? 0} items)`;
    default:     return event.description ?? '';
  }
}

/** Map generic array op → queue-meaningful type for OP_META colors.
 *  append/init → enqueue at rear; delete/read at index 0 → dequeue/peek
 *  at the front — matches DSVPArray's / DSVPQueue's event shape exactly. */
function mapArrayTypeToQueue(type) {
  if (!type) return 'highlight';
  if (type === 'append' || type === 'write') return 'enqueue';
  if (type === 'read')   return 'peek';
  if (type === 'delete') return 'dequeue';
  if (type === 'init')   return 'init';
  if (type === 'swap')   return 'highlight';
  return type;
}

/** Build a human-readable description for the queue operation */
function queueDesc(queueType, event) {
  const val = event.value ?? (event.arrayState ? event.arrayState[event.activeIndex] : null);
  switch (queueType) {
    case 'enqueue': return val != null ? `Enqueue ${val}` : 'Enqueue';
    case 'peek':    return val != null ? `Peek → ${val}` : 'Peek (front)';
    case 'dequeue': return val != null ? `Dequeue ${val}` : 'Dequeue';
    case 'init':    return `Queue initialized (${event.arrayState?.length ?? 0} items)`;
    default:        return event.description ?? '';
  }
}
