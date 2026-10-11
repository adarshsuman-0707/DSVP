/**
 * Google sign-in, temp-password and mandatory-password-change tests.
 * See test/helpers/world.js for what is real and what is faked.
 *
 *   npm test        (from backend/)
 */
const w = require('./helpers/world');
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { db, addUser, byEmail, clone, call, googleSignIn, passwordLogin, freshNonce, googlePayload, STRONG, limiters } = w;
const { loginLimiter, changePasswordLimiter, createRateLimiter } = limiters;
const { validatePassword, generateTempPassword } = require('../src/utils/passwordPolicy');

test.before(() => w.start());
test.after(() => w.stop());
test.beforeEach(() => w.reset());

/** Creates a Google account and returns the emailed temp password. */
async function newGoogleUserWithTemp() {
  const r = await googleSignIn();
  assert.equal(r.status, 201);
  const mail = db.mails.find((m) => m.kind === 'welcome');
  return { r, temp: mail.tempPassword, user: byEmail('newbie@gmail.com') };
}

/* ═══ 1–2. Google: new user, returning user ═════════════════════════════ */
test('new Google user: account created, role/plan safe, welcome email once, full session', async () => {
  const r = await googleSignIn();
  assert.equal(r.status, 201);
  assert.equal(r.body.google.created, true);
  assert.equal(r.body.google.welcomeEmailSent, true);
  assert.equal(r.body.user.Role, 'user');
  assert.equal(r.body.user.SubscriptionPlan, 'free');
  assert.equal(r.body.user.MustChangePassword, false, 'Google session must not be restricted');

  const u = byEmail('newbie@gmail.com');
  assert.ok(u.MustChangePassword, 'password login is still gated by temp password');
  assert.equal(db.identities.length, 1);
  assert.equal(db.identities[0].ProviderUserId, 'g-111');

  // plaintext emailed, only a bcrypt hash stored, to the verified address only
  const mail = db.mails.filter((m) => m.kind === 'welcome');
  assert.equal(mail.length, 1);
  assert.equal(mail[0].to, 'newbie@gmail.com');
  assert.deepEqual(validatePassword(mail[0].tempPassword), []);
  assert.notEqual(u.PasswordHash, mail[0].tempPassword);
  assert.ok(await w.passwordService.verifyPassword(mail[0].tempPassword, u.PasswordHash));
  assert.ok(u.TempPasswordExpiresAt > new Date() && u.TempPasswordExpiresAt < new Date(Date.now() + 61 * 60000));

  // the Google session reaches protected APIs without the temp password
  const me = await call('GET', '/auth/me', { token: r.body.token });
  assert.equal(me.status, 200);
});

test('returning Google user: same account, no second email, no password reset', async () => {
  await googleSignIn();
  const before = clone(byEmail('newbie@gmail.com'));
  const r = await googleSignIn();
  assert.equal(r.status, 200);
  assert.equal(r.body.google.created, false);
  assert.equal(db.users.length, 1);
  assert.equal(db.mails.filter((m) => m.kind === 'welcome').length, 1);
  assert.equal(byEmail('newbie@gmail.com').PasswordHash, before.PasswordHash);
});

/* ═══ 3. link existing password account ═════════════════════════════════ */
test('existing password account is linked, not duplicated; credentials untouched; sessions revoked', async () => {
  const hash = await bcrypt.hash(STRONG, 4);
  const existing = addUser({ Email: 'newbie@gmail.com', PasswordHash: hash, Role: 'admin', SubscriptionPlan: 'premium' });
  const r = await googleSignIn();
  assert.equal(r.status, 200);
  assert.equal(r.body.google.linked, true);
  assert.equal(db.users.length, 1);
  assert.equal(r.body.user.UserId, existing.UserId);
  assert.equal(existing.PasswordHash, hash, 'password must not be reset by linking');
  assert.equal(db.mails.filter((m) => m.kind === 'welcome').length, 0, 'no credentials email for existing accounts');
  assert.equal(db.mails.filter((m) => m.kind === 'linked').length, 1, 'owner is notified of the link');
  assert.equal(existing.TokenVersion, 2, 'older sessions revoked at link time');
  assert.equal(existing.Role, 'admin'); // role comes from DB, never from Google
});

test('Google profile data can never grant admin', async () => {
  const r = await googleSignIn({ role: 'admin', hd: 'admin.example.com', email: 'admin@gmail.com' });
  assert.equal(r.body.user.Role, 'user');
});

/* ═══ 4. duplicates & concurrency ═══════════════════════════════════════ */
test('concurrent first sign-ins create exactly one account', async () => {
  const [a, b] = await Promise.all([googleSignIn(), googleSignIn()]);
  assert.ok([a.status, b.status].every((s) => s === 200 || s === 201));
  assert.equal(db.users.length, 1);
  assert.equal(db.identities.length, 1);
  assert.equal(db.mails.filter((m) => m.kind === 'welcome').length, 1);
});

test('duplicate-key race is retried and resolves to the winning account', async () => {
  db.dupOnFirstUpsert = true;
  const r = await googleSignIn();
  assert.equal(r.status, 200);
  assert.equal(db.users.length, 1);
  assert.equal(r.body.google.created, false);
});

test('email matching is case-insensitive (no duplicate for different casing)', async () => {
  addUser({ Email: 'newbie@gmail.com', PasswordHash: await bcrypt.hash(STRONG, 4) });
  const r = await googleSignIn({ email: 'NewBie@Gmail.com' });
  assert.equal(r.status, 200);
  assert.equal(db.users.length, 1);
});

/* ═══ 5. welcome email delivery + retry ═════════════════════════════════ */
test('failed welcome email: account kept, login succeeds, next Google login retries with a NEW password', async () => {
  db.failWelcomeMail = true;
  const first = await googleSignIn();
  assert.equal(first.status, 201);
  assert.equal(first.body.google.welcomeEmailSent, false);
  assert.equal(db.users.length, 1);
  const hashAfterFirst = byEmail('newbie@gmail.com').PasswordHash;
  assert.equal(byEmail('newbie@gmail.com').WelcomeEmailClaimedAt, null, 'claim released after failure');

  db.failWelcomeMail = false;
  const second = await googleSignIn();
  assert.equal(second.status, 200);
  assert.equal(second.body.google.created, false);
  assert.equal(second.body.google.welcomeEmailSent, true);
  assert.equal(db.users.length, 1);
  const mails = db.mails.filter((m) => m.kind === 'welcome');
  assert.equal(mails.length, 1);
  assert.notEqual(byEmail('newbie@gmail.com').PasswordHash, hashAfterFirst, 'password rotated, never reuses an undelivered one');

  const third = await googleSignIn();
  assert.equal(third.body.google.welcomeEmailSent, false);
  assert.equal(db.mails.filter((m) => m.kind === 'welcome').length, 1, 'sent exactly once');
});

/* ═══ 6, 10. temp-password login → change → dashboard ═══════════════════ */
test('temp password login returns a restricted session, then change-password issues a full one', async () => {
  const { temp } = await newGoogleUserWithTemp();
  const login = await passwordLogin('newbie@gmail.com', temp);
  assert.equal(login.status, 200);
  assert.equal(login.body.mustChangePassword, true);
  assert.equal(login.body.user.MustChangePassword, true);

  const me = await call('GET', '/auth/me', { token: login.body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.MustChangePassword, true, 'state survives reload');

  const ch = await call('POST', '/auth/change-password', {
    token: login.body.token, body: { currentPassword: temp, newPassword: STRONG, confirmPassword: STRONG },
  });
  assert.equal(ch.status, 200);
  assert.equal(ch.body.user.MustChangePassword, false);

  const u = byEmail('newbie@gmail.com');
  assert.equal(u.MustChangePassword, false);
  assert.equal(u.TempPasswordExpiresAt, null);
  assert.ok(await w.passwordService.verifyPassword(STRONG, u.PasswordHash));

  // fresh token works everywhere; normal login now works and is unrestricted
  assert.equal((await call('GET', '/users/me', { token: ch.body.token })).status, 200);
  const again = await passwordLogin('newbie@gmail.com', STRONG);
  assert.equal(again.status, 200);
  assert.equal(again.body.mustChangePassword, undefined);
});

/* ═══ 7–9. change-password validation ═══════════════════════════════════ */
async function restrictedSession() {
  const { temp } = await newGoogleUserWithTemp();
  const login = await passwordLogin('newbie@gmail.com', temp);
  return { temp, token: login.body.token };
}

test('incorrect current password is rejected and state is unchanged', async () => {
  const { token } = await restrictedSession();
  const r = await call('POST', '/auth/change-password', { token, body: { currentPassword: 'wrong', newPassword: STRONG, confirmPassword: STRONG } });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'CURRENT_PASSWORD_INCORRECT');
  assert.equal(byEmail('newbie@gmail.com').MustChangePassword, true);
});

test('new password equal to current password is rejected', async () => {
  const { token, temp } = await restrictedSession();
  // temp already satisfies the policy, so this isolates the "same password" rule
  const r = await call('POST', '/auth/change-password', { token, body: { currentPassword: temp, newPassword: temp, confirmPassword: temp } });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'PASSWORD_UNCHANGED');
});

test('confirmation mismatch and weak passwords are rejected by the backend', async () => {
  const { token, temp } = await restrictedSession();
  const mismatch = await call('POST', '/auth/change-password', { token, body: { currentPassword: temp, newPassword: STRONG, confirmPassword: STRONG + 'x' } });
  assert.equal(mismatch.body.code, 'PASSWORD_MISMATCH');
  const weak = await call('POST', '/auth/change-password', { token, body: { currentPassword: temp, newPassword: 'short', confirmPassword: 'short' } });
  assert.equal(weak.body.code, 'PASSWORD_POLICY');
  const missing = await call('POST', '/auth/change-password', { token, body: { currentPassword: temp } });
  assert.equal(missing.status, 400);
  assert.equal(byEmail('newbie@gmail.com').MustChangePassword, true);
});

/* ═══ 11. expired / used temp credential ════════════════════════════════ */
test('expired temp password: login rejected with a recovery hint', async () => {
  const { temp, user } = await newGoogleUserWithTemp();
  user.TempPasswordExpiresAt = new Date(Date.now() - 1000);
  const r = await passwordLogin('newbie@gmail.com', temp);
  assert.equal(r.status, 401);
  assert.equal(r.body.code, 'TEMP_PASSWORD_EXPIRED');
  assert.match(r.body.message, /Forgot password/);
});

test('temp password expiring mid-session blocks the restricted session', async () => {
  const { token, temp, } = await restrictedSession();
  byEmail('newbie@gmail.com').TempPasswordExpiresAt = new Date(Date.now() - 1000);
  const r = await call('POST', '/auth/change-password', { token, body: { currentPassword: temp, newPassword: STRONG, confirmPassword: STRONG } });
  assert.equal(r.status, 401);
  assert.equal(r.body.code, 'TEMP_PASSWORD_EXPIRED');
});

test('temp password is single-use: after the change it no longer logs in', async () => {
  const { token, temp } = await restrictedSession();
  await call('POST', '/auth/change-password', { token, body: { currentPassword: temp, newPassword: STRONG, confirmPassword: STRONG } });
  assert.equal((await passwordLogin('newbie@gmail.com', temp)).status, 401);
  // and the old restricted token can't be used to change it again
  const replay = await call('POST', '/auth/change-password', { token, body: { currentPassword: temp, newPassword: 'An0ther!Passw0rd', confirmPassword: 'An0ther!Passw0rd' } });
  assert.equal(replay.status, 401);
  assert.equal(replay.body.code, 'SESSION_INVALIDATED');
});

test('racing change-password calls with the same temp password: only one wins', async () => {
  const { token, temp } = await restrictedSession();
  const body = { currentPassword: temp, newPassword: STRONG, confirmPassword: STRONG };
  const results = await Promise.all([call('POST', '/auth/change-password', { token, body }), call('POST', '/auth/change-password', { token, body })]);
  const ok = results.filter((r) => r.status === 200).length;
  assert.equal(ok, 1);
});

/* ═══ 12–13. enforcement before password change ═════════════════════════ */
test('restricted session cannot reach protected APIs (direct calls)', async () => {
  const { token } = await restrictedSession();
  for (const p of ['/users/me', '/modules', '/coins/wallet', '/users/code-history', '/admin/dashboard']) {
    const r = await call('GET', p, { token });
    assert.equal(r.status, 403, p);
    assert.equal(r.body.code, 'PASSWORD_CHANGE_REQUIRED', p);
  }
  const pw = await call('PATCH', '/users/password', { token, body: { currentPassword: 'x', newPassword: 'y' } });
  assert.equal(pw.status, 403, 'legacy change-password endpoint is also blocked');
});

test('a forged "unrestricted" token cannot be built; dropping the claim requires the secret', async () => {
  const { user } = await newGoogleUserWithTemp();
  const forged = jwt.sign({ userId: user.UserId, tokenVersion: 1 }, 'not-the-secret');
  assert.equal((await call('GET', '/users/me', { token: forged })).status, 401);
});

test('purpose-scoped JWTs (password reset) are not accepted as sessions', async () => {
  const t = jwt.sign({ email: 'a@b.c', otpId: 1, purpose: 'password_reset' }, process.env.JWT_SECRET);
  assert.equal((await call('GET', '/auth/me', { token: t })).status, 401);
});

/* ═══ 14. inactive / blocked ════════════════════════════════════════════ */
for (const status of ['blocked', 'inactive']) {
  test(`${status} users: no Google sign-in, no password login, no password change, no link`, async () => {
    const hash = await bcrypt.hash(STRONG, 4);
    const u = addUser({ Email: 'newbie@gmail.com', PasswordHash: hash, Status: status });
    const g = await googleSignIn();
    assert.equal(g.status, 403);
    assert.equal(db.identities.length, 0, 'blocked accounts are never linked');
    assert.equal(u.TokenVersion, 1);
    assert.equal((await passwordLogin('newbie@gmail.com', STRONG)).status, 403);

    // an already-open session is cut off too
    const tok = jwt.sign({ userId: u.UserId, tokenVersion: 1 }, process.env.JWT_SECRET);
    const ch = await call('POST', '/auth/change-password', { token: tok, body: { currentPassword: STRONG, newPassword: 'N3w!Passw0rdxx', confirmPassword: 'N3w!Passw0rdxx' } });
    assert.equal(ch.status, 401);
  });
}

test('linked Google identity of a later-blocked user is refused', async () => {
  await googleSignIn();
  byEmail('newbie@gmail.com').Status = 'blocked';
  assert.equal((await googleSignIn()).status, 403);
});

/* ═══ 15. invalid tokens & replay ═══════════════════════════════════════ */
test('Google token problems are all rejected with one generic error', async () => {
  const cases = {
    'unverified email': { email_verified: false },
    'wrong audience': { aud: 'someone-elses-client' },
    'wrong issuer': { iss: 'https://evil.example.com' },
    'missing sub': { sub: undefined },
    'missing email': { email: undefined },
  };
  for (const [name, over] of Object.entries(cases)) {
    const r = await googleSignIn(over);
    assert.equal(r.status, 401, name);
    assert.equal(r.body.code, 'GOOGLE_INVALID', name);
  }
  assert.equal(db.users.length, 0);
  // signature/expiry failures surface from the library as thrown errors
  assert.equal((await call('POST', '/auth/google', { body: { credential: 'garbage' } })).status, 401);
  assert.equal((await call('POST', '/auth/google', { body: {} })).status, 400);
  assert.equal((await call('POST', '/auth/google', { body: { credential: { $ne: 1 } } })).status, 400);
});

test('nonce: missing, unknown, expired and replayed are rejected', async () => {
  const noNonce = 'tok-no-nonce';
  db.googleTokens.set(noNonce, googlePayload());
  assert.equal((await call('POST', '/auth/google', { body: { credential: noNonce } })).status, 401);

  assert.equal((await googleSignIn({}, { nonce: 'never-issued' })).status, 401);

  const n = await freshNonce();
  for (const [k, v] of db.nonces) db.nonces.set(k, new Date(Date.now() - 1000)); // expire it
  assert.equal((await googleSignIn({}, { nonce: n })).status, 401);
  assert.equal(db.users.length, 0);
});

test('replaying the same Google credential fails (nonce is single-use) and creates nothing extra', async () => {
  const nonce = await freshNonce();
  const first = await googleSignIn({}, { nonce, tokenName: 'replay-token' });
  assert.equal(first.status, 201);
  const replay = await call('POST', '/auth/google', { body: { credential: 'replay-token' } });
  assert.equal(replay.status, 401);
  assert.equal(db.users.length, 1);
  assert.equal(db.mails.filter((m) => m.kind === 'welcome').length, 1);
});

test('nonce endpoint reports unavailability when Google is not configured', async () => {
  const saved = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  try {
    assert.equal((await call('GET', '/auth/google/nonce')).status, 503);
  } finally { process.env.GOOGLE_CLIENT_ID = saved; }
});

/* ═══ 16. JWT invalidation after password change ════════════════════════ */
test('password change invalidates every earlier JWT, including Google sessions', async () => {
  const g = await googleSignIn();
  const googleToken = g.body.token;
  const temp = db.mails.find((m) => m.kind === 'welcome').tempPassword;
  const login = await passwordLogin('newbie@gmail.com', temp);
  const ch = await call('POST', '/auth/change-password', { token: login.body.token, body: { currentPassword: temp, newPassword: STRONG, confirmPassword: STRONG } });
  assert.equal(ch.status, 200);

  for (const old of [googleToken, login.body.token]) {
    const r = await call('GET', '/users/me', { token: old });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'SESSION_INVALIDATED');
  }
  assert.equal((await call('GET', '/users/me', { token: ch.body.token })).status, 200);
});

/* ═══ 17. regression: existing flows ════════════════════════════════════ */
test('regression: register + login still work and are unrestricted', async () => {
  const reg = await call('POST', '/auth/register', { body: { fullName: 'Reg User', email: 'reg@example.com', password: STRONG } });
  assert.equal(reg.status, 201);
  assert.ok(reg.body.token);
  const login = await passwordLogin('reg@example.com', STRONG);
  assert.equal(login.status, 200);
  assert.equal(login.body.user.Email, 'reg@example.com');
  assert.equal(login.body.mustChangePassword, undefined);
  assert.equal((await call('GET', '/users/me', { token: login.body.token })).status, 200);
  assert.equal((await call('POST', '/auth/register', { body: { fullName: 'Reg', email: 'reg@example.com', password: STRONG } })).status, 409);
});

test('regression: bad credentials, missing fields, unknown user', async () => {
  addUser({ Email: 'a@example.com', PasswordHash: await bcrypt.hash('secret1', 4) });
  assert.equal((await passwordLogin('a@example.com', 'nope')).status, 401);
  assert.equal((await passwordLogin('ghost@example.com', 'nope')).status, 401);
  assert.equal((await call('POST', '/auth/login', { body: { email: 'a@example.com' } })).status, 400);
});

test('regression: forgot-password does not reveal whether an email exists; signup OTP rejects registered emails', async () => {
  const r = await call('POST', '/auth/forgot-password/send-otp', { body: { email: 'ghost@example.com' } });
  assert.equal(r.status, 200);
  assert.match(r.body.message, /If this email is registered/);
  addUser({ Email: 'taken@example.com' });
  assert.equal((await call('POST', '/auth/signup/send-otp', { body: { email: 'taken@example.com' } })).status, 409);
  assert.equal((await call('POST', '/auth/forgot-password/verify-otp', { body: {} })).status, 400);
});

test('regression: token without Authorization header is rejected', async () => {
  assert.equal((await call('GET', '/users/me')).status, 401);
});

/* ═══ rate limiting ═════════════════════════════════════════════════════ */
test('login is rate limited per IP+email', async () => {
  addUser({ Email: 'a@example.com', PasswordHash: await bcrypt.hash('secret1', 4) });
  let last;
  for (let i = 0; i < 11; i++) last = await passwordLogin('a@example.com', 'wrong');
  assert.equal(last.status, 429);
  assert.ok(last.body.retryAfterSeconds > 0);
  // a different account isn't affected
  assert.equal((await passwordLogin('b@example.com', 'wrong')).status, 401);
});

test('change-password is rate limited per user', async () => {
  const { token, temp } = await restrictedSession();
  let last;
  for (let i = 0; i < 6; i++) last = await call('POST', '/auth/change-password', { token, body: { currentPassword: 'bad', newPassword: STRONG, confirmPassword: STRONG } });
  assert.equal(last.status, 429);
  void temp;
});

test('createRateLimiter window resets and counts per key', () => {
  const lim = createRateLimiter({ windowMs: 60000, max: 2, keyFn: (r) => r.k });
  const mk = () => { const res = { code: 0, headers: {}, set(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json() { return this; } }; return res; };
  let passed = 0;
  const next = () => { passed += 1; };
  for (let i = 0; i < 3; i++) lim({ k: 'a' }, mk(), next);
  lim({ k: 'b' }, mk(), next);
  assert.equal(passed, 3);
});

/* ═══ units ═════════════════════════════════════════════════════════════ */
test('generated temp passwords satisfy the policy and are unique', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const p = generateTempPassword();
    assert.deepEqual(validatePassword(p), [], p);
    seen.add(p);
  }
  assert.equal(seen.size, 200);
});

test('password policy rules (offline)', () => {
  assert.ok(validatePassword('Ab1!').some((e) => /at least 12/.test(e)));
  assert.ok(validatePassword('alllowercase1!xx').some((e) => /uppercase/.test(e)));
  assert.ok(validatePassword('NOLOWERCASE1!XX').some((e) => /lowercase/.test(e)));
  assert.ok(validatePassword('NoDigitsHere!!xx').some((e) => /number/.test(e)));
  assert.ok(validatePassword('NoSymbolHere123x').some((e) => /special/.test(e)));
  assert.ok(validatePassword('x'.repeat(200)).some((e) => /at most/.test(e)));
  assert.deepEqual(validatePassword(STRONG), []);
});

test('secrets are never written to logs', async () => {
  const lines = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = console.error = console.warn = (...a) => lines.push(a.join(' '));
  let temp;
  try {
    db.failWelcomeMail = true;
    await googleSignIn();           // failure path logs an error
    db.failWelcomeMail = false;
    await googleSignIn();
    temp = db.mails.find((m) => m.kind === 'welcome').tempPassword;
  } finally { Object.assign(console, orig); }
  const blob = lines.join('\n');
  assert.ok(!blob.includes(temp));
  assert.ok(!/tok-\d+/.test(blob));
});
