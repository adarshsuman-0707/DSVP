# DSVP — Data Structure Visualization Platform

Interactive learning platform: user code likhta hai (C, C++, Java, Python, C#), backend usse run karke execution trace banata hai, aur React frontend us trace ko step-by-step animation ke roop me dikhata hai (linked list, tree, graph, sorting, etc.)

**Stack:** React (Vite) + Node.js/Express + **SQL Server (SSMS)** + JWT Auth

```
DSVP/
├── backend/       Node.js + Express API
├── frontend/      React (Vite) app
├── database/      SQL Server schema + seed scripts (run in SSMS)
└── docs/          reference copies of your design docs
```

---

## 1. Prerequisites

- **Node.js** 18+ and npm — [nodejs.org](https://nodejs.org)
- **SQL Server** (Express edition is free) — [Download SQL Server Express](https://www.microsoft.com/sql-server/sql-server-downloads)
- **SQL Server Management Studio (SSMS)** — [Download SSMS](https://learn.microsoft.com/sql/ssms/download-sql-server-management-studio-ssms)

---

## 2. Database Setup (SSMS)

1. Open **SSMS**, connect to your local SQL Server instance (usually `localhost` or `.\SQLEXPRESS`).
2. Open `database/01_schema.sql` in SSMS (**File → Open → File**).
3. Click **Execute** (F5). Yeh `DSVP_DB` database aur saari tables (Users, Modules, Problems, UserProgress, SavedSnippets, ExecutionTraces, Payments, Feedback, AnalyticsEvents) create kar dega.
4. Open `database/02_seed.sql` and Execute — isse admin user aur starter modules (free + premium) insert ho jayenge.
5. **SQL Server Authentication enable karna na bhoolein:**
   - Server par right-click → Properties → Security → "SQL Server and Windows Authentication mode" select karein.
   - SQL Server restart karein.
   - Object Explorer → Security → Logins → `sa` → right-click → Properties → set a password → Login enable karein (Status tab).

---

## 3. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

`.env` file kholiye aur apne SQL Server ke details bharo:

```
DB_USER=sa
DB_PASSWORD=YourStrong@Passw0rd     # jo password SSMS me set kiya
DB_SERVER=localhost                  # ya .\SQLEXPRESS agar named instance hai
DB_NAME=DSVP_DB
DB_PORT=1433
JWT_SECRET=<koi bhi random long string>
```

Backend start karo:

```bash
npm run dev
```

Server chalega `http://localhost:5000`. Test: browser me `http://localhost:5000/api/health` kholo — `{ "status": "ok" }` dikhna chahiye.

> **Note on SQL Server named instances:** agar aapne SQL Server Express default instance name (`SQLEXPRESS`) ke saath install kiya hai, to `DB_SERVER` ko `localhost\\SQLEXPRESS` set karein, aur SQL Server Configuration Manager me **TCP/IP protocol enable** karke SQL Server service restart karein.

---

## 4. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend chalega `http://localhost:5173`. Yeh automatically backend (`http://localhost:5000/api`) se baat karega.

**Test login (seed data se):**
- Email: `admin@dsvp.local`
- Password: seed script me placeholder hash hai — pehle real bcrypt hash generate karke `database/02_seed.sql` me daalo, ya `/register` page se naya account bana lo.

---

## 5. Project Structure Explained

### Backend (`backend/src/`)
| Folder | Purpose |
|---|---|
| `config/db.js` | SQL Server connection pool (mssql package) |
| `models/` | Raw parameterized SQL queries per table |
| `controllers/` | Request handlers (auth, modules, execution, payments, admin) |
| `routes/` | Express route definitions |
| `middleware/` | JWT auth guard, admin-role guard, error handler |
| `services/` | `compilerService.js` (code execution — **stub, needs sandbox integration**), `traceGeneratorService.js` (raw trace → visualization events) |

### Frontend (`frontend/src/`)
| Folder | Purpose |
|---|---|
| `pages/` | Login, Register, Workspace (core screen), ModuleCatalog, AdminDashboard |
| `components/Editor/` | Monaco-based code editor |
| `components/Visualization/` | Visualization canvas (per UI/UX §3.1) |
| `components/PlaybackBar/` | Shared playback bar reused across all structures |
| `context/AuthContext.jsx` | Global auth state (JWT) |
| `services/api.js` | Axios wrapper for all backend calls |
| `styles/theme.js` | Color palette & typography tokens straight from the UI/UX doc |

---

## 6. What's Stubbed / Needs Real Implementation

Ye scaffold structure aur working skeleton hai — do cheezein production ke liye abhi bhi implement karni hongi:

1. **`backend/src/services/compilerService.js`** — abhi stub hai. Isme aapko ek sandboxed code execution service integrate karni hogi (e.g. [Judge0](https://judge0.com/), [Piston](https://github.com/engineer-man/piston), ya apna Docker-based runner) taaki user ka code safely C/C++/Java/Python/C# me run ho sake.
2. **`backend/src/services/traceGeneratorService.js`** — har data structure (array, linked list, tree, graph...) ke liye ek normalizer likhna hoga jo raw execution trace ko common visualization-event format me convert kare.
3. **Payment gateway** — `paymentController.js` me Razorpay/Stripe SDK calls add karni hongi (`.env` me keys already reserved hain).

Baaki sab (auth, DB schema, routing, module catalog, admin dashboard, UI theme, playback bar) fully wired hai aur chalne ke liye ready hai.

---

## 7. Development Phases (from your Project Analysis doc)

1. Authentication & Roles ✅ scaffolded
2. Editor + Compiler Integration — editor ✅, compiler ⚠️ stub
3. Execution Trace Engine — ⚠️ stub
4. Visualization Engine — ✅ base canvas ready, per-structure renderers to add
5. Free Modules (Array, Linked List, Stack, Queue, Sorting) — DB seeded ✅
6. Premium Modules (Tree, BST, AVL, Heap, Graph, Trie, DP...) — DB seeded ✅
7. Payment Gateway — ⚠️ stub
8. Admin Dashboard — ✅ working
9. Analytics & Optimization
10. Deployment
