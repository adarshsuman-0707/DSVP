import { useEffect, useMemo, useRef, useState } from 'react';

/* Self-contained, deterministic bubble-sort demo for the public landing page.
   Steps are precomputed from a fixed array — nothing user-supplied is ever
   executed, and no API is called. */

const INITIAL = [6, 3, 8, 2, 7, 4];

const CODE = [
  'for i in range(n - 1):',
  '    for j in range(n - 1 - i):',
  '        if arr[j] > arr[j + 1]:',
  '            arr[j], arr[j + 1] = arr[j + 1], arr[j]',
];

function buildSteps(input) {
  const a = [...input];
  const n = a.length;
  const steps = [{ arr: [...a], cmp: null, swap: false, sortedFrom: n, line: 0,
    msg: `Start with [${a.join(', ')}]. Bubble sort repeatedly compares neighbours and swaps them if they are out of order.` }];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1 - i; j++) {
      const out = a[j] > a[j + 1];
      steps.push({ arr: [...a], cmp: [j, j + 1], swap: false, sortedFrom: n - i, line: 2,
        msg: `Compare arr[${j}] = ${a[j]} with arr[${j + 1}] = ${a[j + 1]}. ${out ? `${a[j]} > ${a[j + 1]}, so they are out of order.` : `${a[j]} ≤ ${a[j + 1]}, so they stay.`}` });
      if (out) {
        [a[j], a[j + 1]] = [a[j + 1], a[j]];
        steps.push({ arr: [...a], cmp: [j, j + 1], swap: true, sortedFrom: n - i, line: 3,
          msg: `Swap them: arr[${j}] = ${a[j]}, arr[${j + 1}] = ${a[j + 1]}.` });
      }
    }
    steps.push({ arr: [...a], cmp: null, swap: false, sortedFrom: n - 1 - i, line: 0,
      msg: `Pass ${i + 1} done — ${a[n - 1 - i]} is now in its final position.` });
  }
  steps.push({ arr: [...a], cmp: null, swap: false, sortedFrom: 0, line: null,
    msg: `Sorted: [${a.join(', ')}].` });
  return steps;
}

const btn = {
  padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff',
  color: '#1e293b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};

export default function AlgoDemo() {
  const steps = useMemo(() => buildSteps(INITIAL), []);
  const last = steps.length - 1;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const iRef = useRef(0);
  iRef.current = i;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      if (iRef.current >= last) { setPlaying(false); return; }
      setI(v => v + 1);
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [playing, speed, last]);

  const s = steps[i];
  const max = Math.max(...INITIAL);
  const atEnd = i >= last;

  function onKey(e) {
    if (e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowRight') { e.preventDefault(); setPlaying(false); setI(v => Math.min(last, v + 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setPlaying(false); setI(v => Math.max(0, v - 1)); }
  }

  return (
    <div className="demo-wrap" tabIndex={0} onKeyDown={onKey} role="group"
      aria-label="Bubble sort demo. Use left and right arrow keys to step through.">
      <div className="demo-viz">
        <div className="demo-bars" aria-hidden="true">
          {s.arr.map((v, k) => {
            const isCmp = s.cmp && (k === s.cmp[0] || k === s.cmp[1]);
            const done = k >= s.sortedFrom;
            const bg = isCmp ? (s.swap ? '#4CAF50' : '#2E74B5') : done ? '#a7d7a9' : '#cbd5e1';
            return (
              <div key={k} className="demo-col">
                <div className="demo-bar" style={{ height: `${(v / max) * 100}%`, background: bg }}>
                  <span style={{ color: isCmp ? '#fff' : '#1e293b' }}>{v}</span>
                </div>
                <div className="demo-idx">{k}</div>
              </div>
            );
          })}
        </div>
        <p className="demo-msg" aria-live="polite">{s.msg}</p>

        <div className="demo-progress" role="progressbar" aria-label="Execution progress"
          aria-valuemin={0} aria-valuemax={last} aria-valuenow={i}>
          <span style={{ width: `${(i / last) * 100}%` }} />
        </div>
        <div className="demo-meta">Step {i} of {last}</div>

        <div className="demo-controls">
          <button style={btn} onClick={() => { setPlaying(false); setI(0); }}>Reset</button>
          <button style={btn} disabled={i === 0} onClick={() => { setPlaying(false); setI(v => v - 1); }}>← Prev</button>
          <button style={{ ...btn, background: '#2E74B5', borderColor: '#2E74B5', color: '#fff' }}
            onClick={() => { if (atEnd) setI(0); setPlaying(p => !p); }} aria-pressed={playing}>
            {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
          </button>
          <button style={btn} disabled={atEnd} onClick={() => { setPlaying(false); setI(v => v + 1); }}>Next →</button>
          <label className="demo-speed">Speed
            <select value={speed} onChange={e => setSpeed(Number(e.target.value))}>
              <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option>
            </select>
          </label>
        </div>
      </div>

      <div className="demo-code" aria-label="Algorithm code">
        <div className="demo-code-head">Python · Bubble sort</div>
        <pre>{CODE.map((l, k) => (
          <div key={k} className={s.line === k ? 'on' : ''}>{l}</div>
        ))}</pre>
        <div className="demo-legend">
          <span><i style={{ background: '#2E74B5' }} />comparing</span>
          <span><i style={{ background: '#4CAF50' }} />swapped</span>
          <span><i style={{ background: '#a7d7a9' }} />sorted</span>
        </div>
      </div>

      <style>{`
        .demo-wrap { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(0,1fr); gap:24px; max-width:1100px; margin:0 auto; outline:none; }
        .demo-wrap:focus-visible { outline:2px solid #2E74B5; outline-offset:6px; border-radius:16px; }
        .demo-viz { background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:28px; box-shadow:0 2px 8px rgba(0,0,0,.05); }
        .demo-bars { display:flex; gap:10px; align-items:flex-end; height:200px; }
        .demo-col { flex:1; height:100%; display:flex; flex-direction:column; justify-content:flex-end; min-width:0; }
        .demo-bar { border-radius:8px 8px 0 0; display:flex; align-items:flex-start; justify-content:center; padding-top:6px;
          font-size:14px; font-weight:700; transition:background 200ms, height 200ms; min-height:28px; box-sizing:border-box; }
        .demo-idx { text-align:center; font-size:11px; color:#94a3b8; margin-top:6px; }
        .demo-msg { min-height:48px; margin:18px 0 14px; font-size:14px; line-height:1.6; color:#1e293b; }
        .demo-progress { height:6px; border-radius:99px; background:#e2e8f0; overflow:hidden; }
        .demo-progress span { display:block; height:100%; background:linear-gradient(90deg,#2E74B5,#4CAF50); transition:width 200ms; }
        .demo-meta { font-size:12px; color:#64748b; margin:8px 0 16px; }
        .demo-controls { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .demo-controls button:disabled { opacity:.45; cursor:not-allowed; }
        .demo-controls button:focus-visible, .demo-speed select:focus-visible { outline:2px solid #2E74B5; outline-offset:2px; }
        .demo-speed { margin-left:auto; font-size:13px; color:#64748b; display:flex; align-items:center; gap:6px; }
        .demo-speed select { padding:6px 8px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; font-family:inherit; }
        .demo-code { background:#0f2942; border-radius:16px; padding:20px 22px; color:#e2e8f0; box-shadow:0 2px 8px rgba(0,0,0,.05); align-self:start; }
        .demo-code-head { font-size:12px; font-weight:600; color:#93c5fd; margin-bottom:12px; letter-spacing:.03em; }
        .demo-code pre { margin:0; font-family:'JetBrains Mono',Consolas,monospace; font-size:12.5px; line-height:1.9; overflow-x:auto; }
        .demo-code pre div { padding:0 8px; border-left:3px solid transparent; white-space:pre; }
        .demo-code pre div.on { background:rgba(46,116,181,.3); border-left-color:#4CAF50; }
        .demo-legend { display:flex; gap:14px; flex-wrap:wrap; margin-top:16px; font-size:12px; color:rgba(255,255,255,.65); }
        .demo-legend i { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:6px; }
        @media (max-width:860px) { .demo-wrap { grid-template-columns:minmax(0,1fr); } .demo-viz { padding:20px; } .demo-speed { margin-left:0; } }
        @media (prefers-reduced-motion: reduce) { .demo-bar, .demo-progress span { transition:none; } }
      `}</style>
    </div>
  );
}
