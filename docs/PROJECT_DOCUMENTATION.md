# DSVP — Data Structure Visualization Platform
## Project Documentation

Ye document DSVP project ka poora overview deta hai — kya features hain, user kya-kya kar sakta hai, roles kaise kaam karte hain, aur system architecture kaisi hai.

---

## 1. Project kya hai

DSVP ek interactive learning platform hai jahan user code likhta hai (C, C++, Java, Python, C#), backend us code ko execute karke ek **execution trace** generate karta hai, aur frontend us trace ko step-by-step animate karta hai — jaise linked list, tree, graph, sorting, array, stack, queue, BST ka visualization.

Matlab: user apna DSA code likhta hai → run karta hai → uske data structure ka live visual animation dekhta hai ki step-by-step kya ho raha hai memory mein.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| Database | SQL Server (SSMS) — raw parameterized SQL / stored procedures, koi ORM nahi |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` for password hashing |
| Payments | Razorpay (order create, verify, webhook) |
| Email | `nodemailer` — OTP aur password reset ke liye |
| Code Execution | Java instrumenter (Maven + JavaParser based, custom visitors per data structure), Python instrumenter, `compilerService.js`, `traceGeneratorService.js` |

---

## 3. User Roles

DSVP mein do tarah ke users hote hain:

### a) Regular User
- Register/login karta hai
- Code likhta aur run karta hai (Workspace)
- Apne snippets save karta hai
- Learning modules access karta hai (plan ke hisaab se: free / basic / premium)
- Payment karke plan upgrade karta hai
- Coins earn/redeem karta hai
- Feedback de sakta hai

### b) Admin
- `role === 'admin'` check middleware mein hota hai (`authMiddleware.js`)
- Rate-limit se bypass milta hai (`rateLimitMiddleware.js`)
- Admin dashboard access — users, modules, payments, feedback, analytics, audit logs manage karta hai

**Note:** `role` (admin/user) aur `plan` (free/basic/premium subscription tier) alag-alag cheezein hain — dono independently track hote hain user model mein.

---

## 4. Main Features / User-facing Pages

Frontend ke `pages/` folder ke hisaab se:

| Page | Kaam |
|---|---|
| `Landing.jsx` | Marketing/home page |
| `Register.jsx` | Signup (OTP verification ke saath) |
| `Login.jsx` | Login |
| `ResetPasswordPage.jsx` | Forgot password → OTP → reset |
| `Workspace.jsx` | Core screen — code editor + execution + visualization |
| `SavedSnippets.jsx` | User ke saved code snippets/history |
| `Profile.jsx` | User profile details |
| `Pricing.jsx` | Subscription plans dikhana |
| `PaymentHistory.jsx` | Past payments dekhna |
| `Coins.jsx` | In-app coin wallet (reward/discount currency) |

---

## 5. Key API Routes (Backend)

- **`authRoutes.js`** — register, login, `/me`, signup OTP send/verify, forgot-password OTP send/verify/reset
- **`userRoutes.js`** — `/me`, feedback submit/list/unseen-count, code-history save/list/get/delete (ye hi "Saved Snippets" ka backend hai)
- **`moduleRoutes.js`** — modules list, module by slug (free/basic/premium tier ke hisaab se access)
- **`executionRoutes.js`** — `POST /run` → code execute karke trace return karta hai (rate-limited)
- **`paymentRoutes.js`** — create-order, verify, my-payments, webhook (Razorpay flow)
- **`coinRoutes.js`** — wallet balance, transactions, discount quote, redeem/module-unlock
- **`adminRoutes.js`** — dashboard, users (list/summary/detail/reset-password/delete), modules CRUD, payments (list/detail/refund), feedback, analytics, activity, audit-logs, submissions

---

## 6. Key Data Models

| Model | Kya store karta hai |
|---|---|
| `userModel.js` | Users — Role, Plan, Status, join date; paged listing/search/filter |
| `moduleModel.js` | Learning Modules — access level free/basic/premium |
| `paymentModel.js` | Payments — Status, RazorpayEventId, CoinsRedeemed, DiscountAmount, PaymentMethod, FailureReason (stored proc `sp_UpdatePaymentStatus` use hota hai) |
| `coinModel.js` | Coin wallet balance, earn logic, discount quoting (`MAX_DISCOUNT_PCT` cap), redemption |
| `feedbackModel.js` | User feedback entries — seen/unseen tracking |
| `auditLogModel.js` | Admin activity/audit log |

### Database Tables (root README ke mutabik)
Users, Modules, Problems, UserProgress, SavedSnippets, ExecutionTraces, Payments, Feedback, AnalyticsEvents

---

## 7. User Journey (typical flow)

1. User **Landing page** par aata hai
2. **Register** karta hai (email OTP verify hoti hai)
3. **Login** karke Workspace access karta hai
4. Code likhta hai (C/C++/Java/Python/C#), **Run** dabata hai
5. Backend instrumenter code ko trace karta hai → frontend visualization dikhata hai
6. Snippet **save** kar sakta hai (SavedSnippets mein dikhega)
7. Premium modules ke liye **Pricing** page se plan kharidta hai (Razorpay se payment)
8. **Coins** earn/redeem kar sakta hai discounts ke liye
9. **Profile** aur **PaymentHistory** se apna data dekh sakta hai
10. Feedback de sakta hai jo admin ko dikhta hai

---

## 8. Admin Journey

1. Admin login karta hai (role = admin)
2. Admin dashboard se: total users, revenue, activity dekh sakta hai
3. Users manage — search/filter, password reset, delete
4. Modules CRUD — naye learning modules add/edit/delete
5. Payments — list, detail, refund process
6. Feedback review — user feedback dekh kar delete/manage
7. Audit logs — kisne kya action liya, track karta hai

---

*Auto-generated documentation based on codebase exploration — F:\dotnet\DSVP*
