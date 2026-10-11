/**
 * Shared in-memory "world" for the auth integration tests.
 *
 * The real Express app, routes, controllers, middleware, password policy,
 * password hashing and Google verification service run for real. Only the
 * edges are replaced with fakes: the SQL-backed models, SMTP, the Coin model
 * and google-auth-library's network/signature step.
 *
 * Usage: `const w = require('./helpers/world')` BEFORE requiring anything
 * from src/ — it sets env vars and installs the stubs.
 */
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.TEMP_PASSWORD_EXPIRES_MIN = '60';
process.env.BCRYPT_ROUNDS = '4';            // fast hashing in tests; same code path
process.env.PASSWORD_BREACH_CHECK = 'off';   // network-free; the breach check has its own tests
process.env.PASSWORD_HISTORY_COUNT = '3';

const path = require('node:path');
const assert = require('node:assert/strict');

const db = {};
function resetDb() {
  Object.assign(db, {
    users: [], identities: [], nonces: new Map(), events: [], audit: [], history: [], otps: [],
    nextId: 1, nextOtpId: 1,
    mails: [], failWelcomeMail: false, failOtpMail: false, dupOnFirstUpsert: false,
    googleTokens: new Map(), // fake "Google": token string -> payload | Error
  });
}
resetDb();

const clone = (u) => (u ? { ...u } : undefined);
const lc = (s) => String(s).toLowerCase();

function addUser(over = {}) {
  const u = {
    UserId: db.nextId++, FullName: 'Test User', Email: 'user@example.com', PasswordHash: '!',
    Role: 'user', Status: 'active', IsPremium: false, SubscriptionPlan: 'free', SubscriptionExpiry: null,
    PremiumModulesAccess: null, TokenVersion: 1, CoinsUnlocked: false, CoinBalance: 0, CreatedAt: new Date(),
    MustChangePassword: false, TempPasswordExpiresAt: null, WelcomeEmailSentAt: null, WelcomeEmailClaimedAt: null,
    ...over,
  };
  db.users.push(u);
  return u;
}
const byEmail = (e) => db.users.find((u) => lc(u.Email) === lc(e));
const byId = (id) => db.users.find((u) => u.UserId === id);

const fakeUserModel = {
  async createUser({ fullName, email, passwordHash }) {
    if (byEmail(email)) throw Object.assign(new Error('dup'), { number: 2627 });
    return clone(addUser({ FullName: fullName, Email: email, PasswordHash: passwordHash }));
  },
  async findByEmail(e) { return clone(byEmail(e)); },
  async findById(id) { const u = byId(id); return u && { UserId: u.UserId, FullName: u.FullName, Email: u.Email, Role: u.Role, Status: u.Status }; },
  async findAuthById(id) { return clone(byId(id)); },
  async incrementTokenVersion(id) { return ++byId(id).TokenVersion; },
  async updateLastLogin() {},
  async logEvent(userId, type, meta) { db.events.push({ userId, type, meta }); },
  async createOAuthNonce(hash, exp) { db.nonces.set(hash, exp); },
  async consumeOAuthNonce(hash) {
    const exp = db.nonces.get(hash);
    if (!exp) return false;
    db.nonces.delete(hash);
    return exp >= new Date();
  },
  async findByOAuthIdentity(provider, sub) {
    const i = db.identities.find((x) => x.Provider === provider && x.ProviderUserId === sub);
    return i && clone(byId(i.UserId));
  },
  async upsertGoogleUser({ sub, email, fullName, avatarUrl, passwordHash, tempPasswordExpiresAt }) {
    if (db.dupOnFirstUpsert) { // simulate losing the insert race
      db.dupOnFirstUpsert = false;
      addUser({ FullName: 'Racer', Email: email });
      db.identities.push({ UserId: db.users.at(-1).UserId, Provider: 'google', ProviderUserId: sub });
      throw Object.assign(new Error('Violation of UNIQUE KEY'), { number: 2627 });
    }
    let created = false; let linked = false;
    const ident = db.identities.find((x) => x.ProviderUserId === sub);
    let user = ident && byId(ident.UserId);
    if (!user) {
      user = byEmail(email);
      if (!user) {
        user = addUser({
          FullName: fullName, Email: email, PasswordHash: passwordHash, AvatarUrl: avatarUrl,
          MustChangePassword: true, TempPasswordExpiresAt: tempPasswordExpiresAt, WelcomeEmailClaimedAt: new Date(),
        });
        created = true;
      } else { linked = true; user.TokenVersion += 1; }
      db.identities.push({ UserId: user.UserId, Provider: 'google', ProviderUserId: sub });
    }
    return { ...user, Created: created, Linked: linked };
  },
  async rotateTempPasswordForResend(id, hash, exp) {
    const u = byId(id);
    const claimable = !u.WelcomeEmailClaimedAt || u.WelcomeEmailClaimedAt < new Date(Date.now() - 120000);
    if (!(u.MustChangePassword && !u.WelcomeEmailSentAt && claimable)) return false;
    Object.assign(u, { PasswordHash: hash, TempPasswordExpiresAt: exp, WelcomeEmailClaimedAt: new Date() });
    return true;
  },
  async markWelcomeEmailSent(id) { byId(id).WelcomeEmailSentAt = new Date(); },
  async releaseWelcomeEmailClaim(id) { const u = byId(id); if (!u.WelcomeEmailSentAt) u.WelcomeEmailClaimedAt = null; },
  async getPasswordRecord(id) { return clone(byId(id)); },
  async getPasswordHistory(id, n) {
    return db.history.filter((h) => h.UserId === id).slice(-n).reverse().map((h) => h.PasswordHash).slice(0, n);
  },
  // mirrors sp_CompletePasswordChange
  async completePasswordChange(id, oldHash, newHash, keep = 5) {
    const u = byId(id);
    if (!u || u.Status !== 'active' || (oldHash != null && u.PasswordHash !== oldHash)) return undefined;
    if (keep > 0) {
      db.history.push({ UserId: id, PasswordHash: u.PasswordHash });
      const mine = db.history.filter((h) => h.UserId === id);
      mine.slice(0, Math.max(0, mine.length - keep)).forEach((h) => db.history.splice(db.history.indexOf(h), 1));
    }
    Object.assign(u, { PasswordHash: newHash, MustChangePassword: false, TempPasswordExpiresAt: null, TokenVersion: u.TokenVersion + 1 });
    return clone(u);
  },
};

const fakeOtpModel = {
  async invalidate(email, { onlySignup = false } = {}) {
    db.otps.filter((o) => lc(o.Email) === lc(email) && !o.Used && (!onlySignup || o.OtpCode.startsWith('S'))).forEach((o) => { o.Used = true; });
  },
  async create(email, code, expiresAt) {
    const row = { OtpId: db.nextOtpId++, Email: email, OtpCode: code, ExpiresAt: expiresAt, Used: false };
    db.otps.push(row);
    return row.OtpId;
  },
  async findLatest(email, code) {
    const rows = db.otps.filter((o) => lc(o.Email) === lc(email) && o.OtpCode === code);
    return clone(rows.at(-1));
  },
  async get(id) { return clone(db.otps.find((o) => o.OtpId === id)); },
  async consume(id) {
    const o = db.otps.find((x) => x.OtpId === id);
    if (!o || o.Used || o.ExpiresAt < new Date()) return undefined;
    o.Used = true;
    return { OtpId: o.OtpId, Email: o.Email };
  },
};

const stub = (rel, exports) => {
  const file = require.resolve(path.join(__dirname, '..', '..', rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub('src/models/userModel.js', fakeUserModel);
stub('src/models/otpModel.js', fakeOtpModel);
stub('src/models/securityAuditModel.js', { async log(e) { db.audit.push(e); } });
stub('src/models/coinModel.js', {
  hasEarnedToday: async () => true, hasEarnedFor: async () => true, earn: async () => ({ applied: false }),
});
// No SQL Server in tests: a pool whose every query is an empty result (code paths that persist best-effort just no-op).
const fakeRequest = () => {
  const r = {
    input: () => r, output: () => r,
    query: async () => ({ recordset: [], rowsAffected: [0] }),
    execute: async () => ({ recordset: [], output: {} }),
  };
  return r;
};
stub('src/config/db.js', { sql: new Proxy({}, { get: () => () => ({}) }), getPool: async () => ({ request: fakeRequest }) });
stub('src/services/emailService.js', {
  async sendOtpEmail(to, otp) { if (db.failOtpMail) throw new Error('SMTP down'); db.mails.push({ kind: 'otp', to, otp }); },
  async sendSignupOtpEmail(to, otp) { db.mails.push({ kind: 'signup-otp', to, otp }); },
  sendAdminPasswordResetEmail: async () => {}, sendAccountStatusEmail: async () => {},
  async sendWelcomeCredentialsEmail(to, name, tempPassword, minutes) {
    if (db.failWelcomeMail) throw new Error('SMTP down');
    db.mails.push({ kind: 'welcome', to, tempPassword, minutes });
  },
  async sendGoogleLinkedNoticeEmail(to) { db.mails.push({ kind: 'linked', to }); },
});
// google-auth-library: pretend Google verified signature/exp/aud for registered tokens.
const galFile = require.resolve('google-auth-library');
require.cache[galFile] = {
  id: galFile, filename: galFile, loaded: true,
  exports: {
    OAuth2Client: class {
      async verifyIdToken({ idToken }) {
        const p = db.googleTokens.get(idToken);
        if (!p || p instanceof Error) throw p || new Error('Wrong number of segments');
        return { getPayload: () => p };
      }
    },
  },
};

/* ── server + HTTP helper ────────────────────────────────────────────── */
const app = require('../../src/app');
const limiters = require('../../src/middleware/rateLimitMiddleware');
const passwordService = require('../../src/services/passwordService');

let server; let base;
async function start() {
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
}
const stop = () => server.close();
const baseUrl = () => base;
function reset() {
  resetDb();
  Object.values(limiters).filter((l) => typeof l?.reset === 'function').forEach((l) => l.reset());
}

async function call(method, url, { body, token } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

/* ── scenario helpers ────────────────────────────────────────────────── */
const STRONG = 'Str0ng!Passw0rd#42';
const STRONG2 = 'An0ther#Str0ng-Pass9';

async function freshNonce() {
  const r = await call('GET', '/auth/google/nonce');
  assert.equal(r.status, 200);
  return r.body.nonce;
}
function googlePayload(over = {}) {
  return {
    iss: 'https://accounts.google.com', aud: process.env.GOOGLE_CLIENT_ID, sub: 'g-111',
    email: 'newbie@gmail.com', email_verified: true, name: 'New Bie', picture: 'https://pic/x.png', ...over,
  };
}
let tokenSeq = 0;
async function googleSignIn(over = {}, { nonce, tokenName } = {}) {
  const n = nonce ?? (await freshNonce());
  const credential = tokenName || `tok-${++tokenSeq}`;
  db.googleTokens.set(credential, googlePayload({ nonce: n, ...over }));
  return call('POST', '/auth/google', { body: { credential } });
}
const passwordLogin = (email, password) => call('POST', '/auth/login', { body: { email, password } });

/** Creates a user with a (new-scheme) hash of `password`. */
async function addUserWithPassword(password, over = {}) {
  return addUser({ PasswordHash: await passwordService.hashPassword(password), ...over });
}

module.exports = {
  db, addUser, addUserWithPassword, baseUrl, byEmail, byId, clone, call, start, stop, reset,
  freshNonce, googlePayload, googleSignIn, passwordLogin, STRONG, STRONG2, limiters, passwordService,
};
