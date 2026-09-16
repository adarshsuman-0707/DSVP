# DSVP Phase 1 — Implementation Plan

## Goal
Solid karna: Array (1D + 2D) aur Linked List (Singly / Doubly / Circular) visualization + Premium structural detection gate.

---

## User Review Required

> [!IMPORTANT]
> **Decision 1 — Premium Gate Rules (confirm karo):**
> 
> Proposed free vs premium split:
> | Feature | Access |
> |---|---|
> | Array 1D (any language) | 🆓 Free |
> | Linked List — Singly | 🆓 Free |
> | Array 2D / Multi-dim | 💎 Premium |
> | Linked List — Doubly | 💎 Premium |
> | Linked List — Circular | 💎 Premium |
>
> Kya ye theek hai? Ya 2D Array bhi free rakhna chahte ho?

> [!IMPORTANT]
> **Decision 2 — Detection Confidence:**
> 
> Structural detection heuristic:
> - **Doubly** = class/struct me 2 alag self-type pointer fields milein (koi bhi naam ho)
> - **Circular** = kisi pointer assignment me `head`/root-like variable ko tail/last node ke `next` se assign kiya jaaye
> - **2D Array** = `[][]` (Java/C#), `int **` (C/C++), nested list (Python) detect hone par
>
> Confidence threshold: agar code "likely doubly" lag raha ho → premium gate trigger karo. Agree?

> [!WARNING]
> **Decision 3 — Redirect on Premium Gate:**
> Jab premium gate trigger ho, user ko `/pricing` page pe redirect karo — existing Pricing.jsx page already hai. Confirm?

---

## Open Questions

1. Kya 2D Array visualization me grid cells animate honge (row/col highlight) ya sirf flat representation dikhani hai?
2. Circular Linked List me animation circular loop dikhayegi (arrows going back to head) ya linear dikhayegi?

---

## Proposed Changes

### Phase 1A — Structural Code Detector (Backend)

#### [NEW] `backend/src/services/codeStructureDetector.js`
- Pure function: `detectStructure(code, language)` → returns `{ variant, isPremium }`
- **Array detection:**
  - Python: nested list literal / `[[...]]` / `list of lists`
  - Java/C#: `[][]` / `new int[n][m]`
  - C/C++: `int **` / `int arr[N][M]`
- **Linked List detection:**
  - Count self-referencing pointer fields in class/struct definition
  - 1 field → `singly`
  - 2 fields → `doubly` → premium
  - Circular pattern: tail.next = head assignment → `circular` → premium
- Language-agnostic patterns (variable names ignored)

#### [MODIFY] `backend/src/controllers/executionController.js`
- Before `runCode()`, call `detectStructure(code, language)`
- If detected variant is premium AND `req.user.subscriptionPlan !== 'premium'`:
  - Return `{ status: 'premium_required', detectedVariant, message: 'Upgrade to access this feature' }`
  - Do NOT run the code

---

### Phase 1B — Frontend Premium Gate

#### [NEW] `frontend/src/components/common/PremiumGateModal.jsx`
- Premium upgrade popup component
- Props: `{ isOpen, detectedVariant, onClose, onUpgrade }`
- Shows: what was detected, what plan is needed, CTA button → `/pricing`
- Polished glassmorphism design (dark theme consistent with app)

#### [MODIFY] `frontend/src/pages/Workspace.jsx`
- After `runCode()` API call, check if `response.status === 'premium_required'`
- If yes: open `PremiumGateModal` instead of showing visualization
- Pass `detectedVariant` to modal for display
- On "Upgrade" click → `navigate('/pricing')`

---

### Phase 1C — Array 2D Visualizer (Frontend)

#### [NEW] `frontend/src/components/Visualization/Array2DVisualizer.jsx`
- Grid-based visualization (rows × cols)
- Active cell highlight (row + col coordinate)
- Row/column sweep animations for traversal ops
- Smooth CSS transitions on cell value change
- Shows current coordinates: `arr[i][j] = val`

#### [MODIFY] `backend/src/services/compilerService.js`
- **Python:** Update `python_instrumenter.py` to detect and trace 2D list ops
  - `arr[i][j]` reads/writes → emit `DSVP_TRACE:{"op":"write2d","row":i,"col":j,"val":v,"snap":[[...]]}`
- **Java:** Extend regex instrumenter to handle `int[][] arr` and `arr[i][j]`
- **C/C++:** Extend C_SHIM / CPP_SHIM with `DSVPArray2D` helper class

#### [MODIFY] `backend/src/services/traceGeneratorService.js`
- Add `ARRAY2D_OPS` set: `init2d, read2d, write2d, swap2d`
- `buildArray2DEvt()` function → produces events with `array2DState` (2D array), `activeRow`, `activeCol`

#### [MODIFY] `frontend/src/components/Visualization/VisualizationCanvas.jsx`
- Add `is2DEvent(event)` check
- Route 2D array events → `Array2DVisualizer` instead of `ArrayVisualizer`

---

### Phase 1D — Linked List Variants (Singly / Doubly / Circular)

#### [MODIFY] `backend/src/services/compilerService.js` — Linked List shims
- **Doubly LL Python/Java instrumentation:**
  - Detect `prev`/`back`/`previous` pointer field (any name, type = same class)
  - Emit `DSVP_TRACE:{"op":"ll_snap","nodes":[{"id":1,"val":10,"nextId":2,"prevId":0}]}`
  - `prevId` field added for doubly
- **Circular LL:**
  - Tail node's `nextId` = head node's `id` (not null)
  - Frontend uses this to draw circular arrow

#### [MODIFY] `backend/src/services/traceGeneratorService.js`
- `buildLLEvt()` already handles `ll_snap` — extend `nodes` to include `prevId` (optional)
- Add `isCircular` flag on the event when tail's `nextId === headId`

#### [NEW] `frontend/src/components/Visualization/DoublyListVisualizer.jsx`
- Extends LinkedListVisualizer
- Shows **bidirectional arrows** (→ and ←) between nodes
- `prevId` arrows rendered in different color (e.g. accent purple)
- Smooth enter/exit animations on insert/delete

#### [MODIFY] `frontend/src/components/Visualization/LinkedListVisualizer.jsx`
- Add `isCircular` prop → if true, draw curved arrow from last node back to first
- Detect doubly vs singly from `nodes[0].prevId !== undefined` → use DoublyListVisualizer

#### [MODIFY] `frontend/src/components/Visualization/VisualizationCanvas.jsx`
- Route based on detected variant from event metadata

---

### Phase 1E — Animation Polish

#### [MODIFY] `frontend/src/components/Visualization/ArrayVisualizer.jsx`
- Smooth height animations on value change (CSS `transition: all 0.3s ease`)
- Better color scheme: read=blue, write=green, swap=orange, compare=yellow
- Add "current operation" badge with icon

#### [MODIFY] `frontend/src/components/Visualization/LinkedListVisualizer.jsx`
- Node insert: slide-in from right animation
- Node delete: fade-out + gap-close animation
- Arrow animate on traverse (traveling dot effect)
- Active node: glow pulse effect

---

### Phase 1F — DB Update

#### [MODIFY] `database/02_seed.sql` OR new migration
- Mark specific module variants as premium in `Modules` table
- OR handle via `codeStructureDetector.js` logic (no DB change needed)

---

## Verification Plan

### Backend Tests
```powershell
# Test structural detector
node backend/src/services/codeStructureDetector.js

# Test execution API with doubly LL code → expect premium_required
curl -X POST http://localhost:5000/api/execution/run \
  -H "Authorization: Bearer <free_user_token>" \
  -d '{"language":"java","code":"class Node { int val; Node next; Node prev; }"}'
```

### Manual Verification
1. Free user + Singly LL code → runs normally, animation shows
2. Free user + Doubly LL code → premium gate popup appears
3. Premium user + Doubly LL code → runs, bidirectional arrows shown
4. Any user + 2D array (Python `[[1,2],[3,4]]`) → Grid visualizer renders
5. Free user + 2D array → premium gate
6. PlaybackBar: step through animation, confirm smooth transitions

---

## Implementation Order

```
1. codeStructureDetector.js        (backend — pure logic, easy to test)
2. executionController.js update   (backend — gate check)
3. PremiumGateModal.jsx            (frontend — UI gate)
4. Workspace.jsx update            (frontend — wire gate)
5. Array2DVisualizer.jsx           (frontend — new component)
6. compilerService + traceGenerator 2D support (backend)
7. DoublyListVisualizer.jsx        (frontend)
8. LL instrumentation for doubly/circular (backend)
9. Animation polish pass           (frontend)
```

**Estimated total: ~6-8 files new, ~8-10 files modified**
