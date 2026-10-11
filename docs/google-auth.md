# Google sign-in + mandatory first password change

## Flow
1. SPA → `GET /api/auth/google/nonce` (single-use, 5 min, stored hashed in `OAuthNonces`).
2. Google Identity Services shows the account chooser; the signed ID token embeds that nonce.
3. SPA → `POST /api/auth/google {credential}`. Backend verifies signature/expiry/audience
   (google-auth-library), issuer, `email_verified`, consumes the nonce atomically (replay-proof),
   then find / link / create via `sp_UpsertGoogleUser` (one transaction, unique `(Provider, sub)`).
4. New account: random 16-char temp password (bcrypt-hashed, 60 min expiry, `MustChangePassword=1`)
   is emailed once. Google session itself is a normal full session.
5. Password login with the temp password → restricted JWT (`mustChangePassword` claim). Middleware
   re-checks the DB each request; restricted sessions reach only `GET /auth/me` and
   `POST /auth/change-password` (everything else: 403 `PASSWORD_CHANGE_REQUIRED`).
6. `POST /auth/change-password` validates, compare-and-sets the hash, clears the temp state,
   bumps `TokenVersion` (all older JWTs die) and returns a fresh token.

## Google Cloud setup
1. console.cloud.google.com → APIs & Services → OAuth consent screen (External; add app name, support email).
2. Credentials → Create credentials → OAuth client ID → **Web application**.
3. Authorized JavaScript origins: `http://localhost:5173` and your production frontend origin(s). (No redirect URI needed for this flow.)
4. Put the client ID in `backend/.env` (`GOOGLE_CLIENT_ID`) and `frontend/.env` (`VITE_GOOGLE_CLIENT_ID`).

## Deploy
1. Run `database/18_google_auth.sql` against DSVP_DB (idempotent).
2. `cd backend && npm install` (adds `google-auth-library`), set env vars from `.env.example`.
3. Rebuild the frontend with `VITE_GOOGLE_CLIENT_ID` set. Serve over HTTPS (Google requires it off-localhost).
4. `cd backend && npm test`.

## Password policy (database/19_password_policy.sql — run after 18)
- One validator (`backend/src/utils/passwordPolicy.js`) for register, signup-OTP, change-password
  (+ `PATCH /users/password`), forgot/admin reset and temp-password change.
- 12–128 characters (Unicode code points), upper/lower/digit/special, no leading/trailing space,
  no control chars, no common/derived passwords, no name/email, no HIBP-breached passwords
  (only a 5-char SHA-1 prefix is sent). Password history: last `PASSWORD_HISTORY_COUNT` reused → rejected.
- New hashes: `dsvp1$` + bcrypt(base64(SHA-256(NFKC(password)))) — no 72-byte truncation.
  Old plain-bcrypt hashes keep verifying; login never applies the new rules.
- Reset tokens are consumed atomically (`sp_OtpConsume`); success bumps TokenVersion (all sessions end).
- Security audit trail: `dbo.SecurityAuditLog` (no credentials; unknown emails stored as a truncated hash).
