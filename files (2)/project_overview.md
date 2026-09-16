# DSVP — Project Overview

## What Is It?
**Data Structure Visualization Platform** — An interactive learning tool where users write code (C, C++, Java, Python, C#), the backend runs it with instrumentation injected, and the frontend plays back a step-by-step animation of what the data structures are doing.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) + Vanilla CSS |
| Backend | Node.js / Express |
| Database | SQL Server (SSMS) |
| Auth | JWT (bcrypt passwords) |
| Code Execution | Local `child_process` (gcc / g++ / java / python / dotnet) |

---

## Full Data Flow

```
User writes code in Monaco Editor (Workspace.jsx)
          ↓
POST /api/execution/run  (executionController.js)
          ↓
compilerService.js
  → Injects DSVP instrumentation shim into user code
    • Python  → python_instrumenter.py  (AST-based, full auto)
    • Java    → Regex-based inline injection
    • C / C++ → Prepend C_SHIM / CPP_SHIM (manual DSVPArray class)
    • C#      → CSHARP_SHIM
  → Runs code via child_process (gcc, javac+java, python, etc.)
  → Captures stdout lines that match "DSVP_TRACE:{json}"
  → Returns { status, trace: { steps: [...] }, rawOutput }
          ↓
traceGeneratorService.js — buildTraceEvents()
  → Normalizes raw trace steps into rich visualization events
  → Each event has: arrayState, linkedListState, callStack, currentLine, description
          ↓
(Best-effort) Saves trace to DB → ExecutionTraces table
          ↓
Returns { status, events[], userOutput } to frontend
          ↓
Workspace.jsx stores events[], controls playback
  → PlaybackBar: step/play/pause/speed
  → VisualizationCanvas: routes to ArrayVisualizer / LinkedListVisualizer
  → CallStackPanel: shows live call stack frames
  → ExecutionHistoryPanel: shows per-step descriptions
  → Monaco editor: highlights current line
```

---

## Frontend Pages & Routes

| Route | Component | Access |
|---|---|---|
| `/` | Landing.jsx (or redirect to /dashboard) | Public |
| `/login` | Login.jsx | Public |
| `/register` | Register.jsx | Public |
| `/dashboard` | ModuleCatalog | Auth required |
| `/workspace` | Workspace.jsx | Auth required |
| `/pricing` | Pricing.jsx | Auth required |
| `/profile` | Profile.jsx | Auth required |
| `/admin` | AdminDashboard | Admin only |

---

## Backend API Routes

| Route | Controller | Purpose |
|---|---|---|
| `POST /api/auth/register` | authController | Register new user |
| `POST /api/auth/login` | authController | Login, get JWT |
| `GET  /api/modules` | moduleController | List modules |
| `POST /api/execution/run` | executionController | **Core: run & trace code** |
| `POST /api/payments/...` | paymentController | Subscription (stub) |
| `GET  /api/admin/...` | adminController | Admin dashboard data |
| `GET  /api/users/...` | userRoutes | User profile/history |

---

## Database Tables (SQL Server — DSVP_DB)

| Table | Purpose |
|---|---|
| `Users` | Auth, roles (user/admin), IsPremium flag |
| `Modules` | Catalog of data structure modules (free/premium) |
| `Problems` | Practice problems per module |
| `UserProgress` | Per-user progress tracking |
| `SavedSnippets` | User-saved code snippets |
| `ExecutionTraces` | Full trace JSON saved per run |
| `Payments` | Payment records |
| `Feedback` | User feedback |
| `AnalyticsEvents` | Usage analytics |
| `Subscriptions` | Subscription management |
| `OTP` | Email OTP for verification |

---

## Key Services

### `compilerService.js` ✅ Working
- Detects if Python/Java/GCC is installed
- Injects instrumentation before running
- Returns structured trace with DSVP_TRACE lines parsed
- 12-second execution timeout

### `traceGeneratorService.js` ✅ Working
- Converts raw steps into canonical events
- Supports: `array`, `linkedList`, `execution` categories
- Ops: `init, read, write, swap, append, compare, ll_init, ll_insert, ll_delete, ll_traverse, call, line, return`

### `python_instrumenter.py` ✅ Working
- AST-based: automatically wraps all list/variable accesses
- Full call stack tracing

---

## Visualization Components

| Component | Purpose |
|---|---|
| `VisualizationCanvas.jsx` | Routes to right visualizer based on event category |
| `ArrayVisualizer.jsx` | Animated bar/box array with highlight, swap, compare |
| `LinkedListVisualizer.jsx` | Node → arrow → node animated linked list |
| `CallStackPanel.jsx` | Shows live function call stack with locals |
| `ExecutionHistoryPanel.jsx` | Step-by-step description log |
| `PlaybackBar.jsx` | Step controls (prev/next/play/pause/speed) |

---

## What's Done ✅ vs What's Stubbed ⚠️

| Feature | Status |
|---|---|
| Auth (JWT, bcrypt, OTP) | ✅ Complete |
| Module Catalog | ✅ Complete |
| Monaco Code Editor | ✅ Complete |
| Code Execution (Python, Java, C, C++, C#) | ✅ Working (local child_process) |
| Array Visualization | ✅ Complete |
| Linked List Visualization | ✅ Complete |
| Call Stack Panel | ✅ Complete |
| Playback Bar | ✅ Complete |
| Code History (save/load) | ✅ Complete |
| Admin Dashboard | ✅ Complete |
| Payment Gateway (Razorpay/Stripe) | ⚠️ Stub |
| Tree / Graph / Sorting visualizers | ⚠️ Not yet implemented |
| Sandboxed execution (Docker/Judge0) | ⚠️ Still local child_process |
| C# execution | ⚠️ Needs dotnet-script or mono installed |

---

## Modules Seeded in DB

**Free**: Array, Linked List, Stack, Queue, Bubble Sort  
**Premium**: Binary Tree, BST, AVL Tree, Heap, Graph (BFS/DFS), Trie, Dynamic Programming, Red-Black Tree, Segment Tree, Fenwick Tree
