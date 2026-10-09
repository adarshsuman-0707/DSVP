import { useEffect, useMemo, useState } from 'react';

/**
 * Deterministic bubble-sort trace rendered like a small debugger panel.
 * The steps are computed from the real algorithm (not hand-faked), then
 * cycled slowly. With prefers-reduced-motion it rests on one frame.
 */
const START = [12, 7, 24, 3, 18, 9];
const TOTAL = 12;
const REST_STEP = 3; // zero-based frame shown when motion is reduced (STEP 04)

function buildTrace(input) {
  const arr = [...input];
  const steps = [];
  let swaps = 0;
  outer: for (let pass = 0; pass < arr.length - 1; pass++) {
    for (let j = 0; j < arr.length - 1 - pass; j++) {
      const swap = arr[j] > arr[j + 1];
      if (swap) { [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]]; swaps++; }
      steps.push({ arr: [...arr], j, swap, swaps, pass, sortedFrom: arr.length - pass });
      if (steps.length === TOTAL) break outer;
    }
  }
  return steps;
}

export default function AlgoVisual() {
  const trace = useMemo(() => buildTrace(START), []);
  const [i, setI] = useState(REST_STEP);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return undefined;
    const t = setInterval(() => setI(n => (n + 1) % trace.length), 1500);
    return () => clearInterval(t);
  }, [trace.length]);

  const s = trace[i];
  const pad = n => String(n).padStart(2, '0');

  return (
    <figure className="algo" aria-label="Animated trace of bubble sort on the array 12, 7, 24, 3, 18, 9" style={{ margin: 0 }}>
      <div className="algo-bar">
        <b>bubble_sort.py</b>
        <span>EXECUTION TRACE</span>
        <span className="algo-step">STEP {pad(i + 1)} / {pad(trace.length)}</span>
      </div>

      <div className="algo-body">
        <div className="algo-cells">
          {s.arr.map((v, k) => {
            const cmp = k === s.j || k === s.j + 1;
            const cls = cmp ? (s.swap ? 'is-swap' : 'is-cmp') : k >= s.sortedFrom ? 'is-done' : '';
            return (
              <div key={k} className={`algo-cell ${cls}`}>
                <div className="algo-box">{v}</div>
                <span className="algo-idx">{k}</span>
                <span className="algo-ptr">{k === s.j ? 'j' : k === s.j + 1 ? 'j+1' : ''}</span>
              </div>
            );
          })}
        </div>

        <div className="algo-line">
          {s.swap
            ? <span>arr[{s.j}] &gt; arr[{s.j + 1}] → <em>swap</em></span>
            : <span>arr[{s.j}] ≤ arr[{s.j + 1}] → <em>keep</em></span>}
        </div>

        <div className="algo-meta">
          <div><small>PASS</small><span>{s.pass + 1}</span></div>
          <div><small>SWAPS</small><span>{s.swaps}</span></div>
          <div><small>TIME</small><span>O(n²)</span></div>
        </div>

        <div className="algo-track" aria-hidden="true">
          {trace.map((_, k) => <i key={k} className={k === i ? 'cur' : k < i ? 'on' : ''} />)}
        </div>
      </div>
    </figure>
  );
}
