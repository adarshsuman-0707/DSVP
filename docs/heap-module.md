# Heap module (Python + Java)

A learner writes **their own** heap in Python or Java, runs it, and steps through a synchronized
binary-tree + array visualization of what the program actually did. Nothing is simulated: the
trace is built from observed execution of the submitted code.

## How it works

```
user code ──► language tracer ──► raw primitive events ──► reconstructor ──► heap events ──► UI
              (heap_instrumenter.py)   hp_new/hp_set/hp_rs     (heapReconstructor.js)         HeapVisualizer
              (HeapInstrumenter.java   hp_cmp/hp_sc/hp_call/    swap · insert · extract ·       tree + array +
               + HeapShim.java.txt)    hp_ret/hp_err            write · compare · bulk          stats + notes
```

* **Python** (`backend/src/services/heap/heap_instrumenter.py`): the program's AST is rewritten so that
  every list becomes a thin `list` subclass that reports its mutations, ordering comparisons
  (`< <= > >=`) report their operands, user functions report entry/exit and return values, and
  integer attributes report their value after assignment (a possible logical-size counter).
  `heapq` is replaced by a traced, textbook implementation (the UI says so in its description).
* **Java** (`HeapInstrumenter.java`, run via `java -jar dsvp-java-instrumenter.jar --heap File.java`):
  arrays and `ArrayList`s stay real arrays/lists; element writes, reads, comparisons, `compareTo`,
  integer-field updates, statement lines, method entry/exit and return values are reported through
  `DSVPHeap` (runtime in `HeapShim.java.txt`). `new ArrayList<>()` becomes a subclass that reports
  add/set/remove.
* **No names are assumed.** The heap is the array/list with the most comparison and mutation
  activity. A swap is two writes that exchange values; an insert is a growth (append, or a write
  followed by a size-counter increase); an extract is the root being replaced by the last element
  and the size shrinking; the logical size of a fixed-capacity array is the integer field that
  moves in step with the writes; min/max order is inferred from the observed states.
* **Element identity**: every element has a stable id; a swap exchanges ids, a hole-technique
  "copy down, then place the held element" resolves to the right ids, so duplicates animate correctly.
* **Fidelity**: every raw mutation carries a snapshot of the array. If the snapshot disagrees with
  what the reconstruction predicts (e.g. a library call changed the array), an explicit
  `external` event is emitted instead of silently absorbing the difference. The test suite checks
  the reconstructed state against those snapshots.

### Event (what the UI receives)

`type:'heap'`, `heapKind` (`init|compare|swap|write|insert|remove|extract|bulk|external|call|return`),
`heapOp`/`heapOpKey` (Insert, Sift up, Sift down, Extract root, Build heap, Heap sort, Peek …),
`description`, `currentLine` (omitted when unknown), `i`/`j` (indices), compared values, `res`,
`state` `{ids, vals, size}` (only when it changed; forward-filled by the client), `heapSize`,
`heapHeight`, `heapRoot`, `heapValid`, `heapOrder`, `comparisons`, `swaps`, `writes`, `func`/`depth`/`ret`,
and `src` (index of the raw event that produced it). The response also carries `heapInfo`:
`{ order, dynamic, sizeField, ignoredArrays, truncated }`.

Backward stepping is exact: the client recomputes the state at step *k* from events `0..k`.

## Supported / not supported

Supported: array-based binary heaps in a Python `list`, a Java `int[]`/`long[]`/`double[]`/`char[]`/`Integer[]`/`T[]`
or `ArrayList`; min or max; recursive or iterative sift; swap, hole-technique and `Collections.swap` styles;
build-heap and heap sort; duplicates, negatives, zero; tuples as elements (Python) and `Comparable`
objects (Java); `heapq` (Python).

Explicitly **not** supported (the run succeeds but the module says why, instead of showing nothing):
`PriorityQueue` (its array is hidden), heaps built from linked nodes (left/right pointers), more
than 256 elements, and a program with no heap activity at all. When several lists are touched, only
the busiest one is drawn and the others are counted in a note.

## API

`POST /api/execution/run` with `moduleSlug: "heap"`, `language: "python" | "java"`, `code`, and an
optional `stdin` string (≤ 16 KB). Statuses: `success`, `compile_error`, `runtime_error`,
`unsupported_implementation`. A client that disconnects cancels its run (the child process is killed).

## Limits and security — read this before exposing it publicly

The module uses the platform's existing execution model: **a child process on the API host** with a
scrubbed environment (no DB/JWT/SMTP secrets), a wall-clock timeout (`DSVP_TIMEOUT_MS`, 12 s), output
caps (`DSVP_MAX_OUTPUT_BYTES`), a trace budget (`DSVP_HEAP_MAX_RAW_EVENTS`, 12 MB), a source limit,
`-Xmx`/`-Xss` for Java, and always-removed temp directories.

Added for this module:
* Python runs under an **audit hook** that blocks sockets, subprocesses, `ctypes`, file writes
  outside the run directory and file reads outside the run directory / Python installation, and
  caps stdout. This is defense in depth against accidents and common abuse, **not a sandbox**: it is
  enforced inside the same Python process and a determined attacker may bypass it.
* On POSIX, `RLIMIT_AS` is applied to Python (`DSVP_MAX_PY_MB`, default 512).
* Java user code compiles and runs with the full privileges of the server process: the JDK's
  SecurityManager was removed in Java 24+, so **there is no filesystem or network isolation for Java**.
* There is **no OS-level isolation or memory cap on Windows**.

Do not describe this as a sandbox. For untrusted, public traffic run the API in a container/VM with
no secrets, no outbound network, a read-only filesystem and cgroup memory/CPU limits (outside this
repository's scope: no Docker is introduced here).

## Setup

* Python 3.8+ and a JDK 17+ on the API host (`python`/`python3`, `java`, `javac` on PATH).
* The Java instrumenter jar lives in `backend/src/services/tools/`. After changing anything under
  `backend/src/services/instrumenter/` rebuild and copy it:
  `cd backend/src/services/instrumenter && mvn -q package -DskipTests && cp target/dsvp-java-instrumenter.jar ../tools/`
* The `heap` module row already exists (`database/02_seed.sql`, premium). No new tables.

## Tests

`cd backend && npm test` — reconstructor unit tests, real Python/Java executions (traces, fidelity,
line mapping, errors, timeouts, output/trace caps, hardening, cancellation), and the HTTP API.
`cd frontend && npm test` — heap model (forward/backward, layout, validity, roles) and a render smoke
test of the component. Runtime-dependent tests skip when Python or a JDK is missing.
