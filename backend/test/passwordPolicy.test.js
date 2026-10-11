/**
 * Centralized password policy: unit tests (rules, hashing, breach check) and
 * integration tests across every flow that sets a password.
 *
 *   npm test        (from backend/)
 */
process.env.CHANGE_PASSWORD_RATE_MAX = '1000'; // these tests change passwords many times per user
const w = require('./helpers/world');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { db, addUser, addUserWithPassword, byEmail, call, passwordLogin, googleSignIn, STRONG, STRONG2 } = w;
const { hashPassword, verifyPassword } = w.passwordService;
const { validatePassword, checkPasswordPolicy, generateTempPassword } = require('../src/utils/passwordPolicy');
const breach = require('../src/services/breachCheck');
const audit = require('../src/services/securityAudit');

test.before(() => w.start());
test.after(() => w.stop());
test.beforeEach(() => {
  w.reset();
  process.env.PASSWORD_BREACH_CHECK = 'off';
  breach._setFetch(null);
});

const sha1 = (s) => crypto.createHash('sha1').update(s, 'utf8').digest('hex').toUpperCase();
const problems = (pw, ctx) => validatePassword(pw, ctx);
const has = (list, re) => list.some((e) => re.test(e));

/* ═══ rules ═════════════════════════════════════════════════════════════ */
test('length: 12 minimum, configurable 128 maximum counted in code points', () => {
  assert.ok(has(problems('Abcdef1!xyz'), /at least 12/));            // 11
  assert.deepEqual(problems('Abcdef1!xyzQ'), []);                    // 12
  const long = 'Aa1!' + 'x'.repeat(124);                            // exactly 128
  assert.deepEqual(problems(long), []);
  assert.ok(has(problems(long + 'x'), /at most 128/));
  // 120 emoji = 120 code points (240 UTF-16 units) → within the limit
  assert.deepEqual(problems('Aa1' + '🔒'.repeat(120)), []);
});

test('character classes and whitespace/control rules', () => {
  assert.ok(has(problems('alllowercase123!'), /uppercase/));
  assert.ok(has(problems('ALLUPPERCASE123!'), /lowercase/));
  assert.ok(has(problems('NoDigitsHere!!!!'), /number/));
  assert.ok(has(problems('NoSpecialChar1234'), /special/));
  assert.ok(has(problems(' Leading-Space-1x'), /start or end/));
  assert.ok(has(problems('Trailing-Space-1x '), /start or end/));
  assert.ok(has(problems('Tab\tinside-Pass1!x'), /control/));
  assert.ok(has(problems('Nul\u0000inside-Pass1!x'), /control/));
  assert.deepEqual(problems('Inner spaces are fine 1!'), []);
});

test('Unicode, passphrases and password-manager output are accepted', () => {
  assert.deepEqual(problems('Привет-Мир-2024!'), []);                // Cyrillic upper/lower
  assert.deepEqual(problems('Ünïcödé-Pässwörd-7'), []);
  assert.deepEqual(problems('パスワードKey9!extra'.replace('Key', 'Key')), problems('パスワードKey9!extra')); // consistent
  assert.deepEqual(problems('correct Horse battery Staple 9 !'), []);   // passphrase
  assert.deepEqual(problems('q7#Vn$2pLz@9Xk!mR4&tWb'), []);          // generator-style
  assert.deepEqual(problems(generateTempPassword()), []);
});

test('common passwords and trivial variations are rejected', () => {
  for (const pw of ['Password123!!!', 'P@ssw0rd!!!!!', 'Qwerty123456!', 'Welcome2024!!!', 'Letmein!!!!123', 'ILoveYou123!!!']) {
    assert.ok(has(problems(pw), /common/), pw);
  }
  assert.ok(require('../src/utils/passwordPolicy').looksCommon('aaaaaaaaaaaaaaaa')); // single repeated character
  assert.deepEqual(problems('Tr0ub4dor&3-horse-Staple'), []);
});

test('passwords built from the user’s email or name are rejected', () => {
  const ctx = { email: 'jonathan.smith@example.com', fullName: 'Jonathan Smith' };
  assert.ok(has(problems('Jonathan-Loves-Cats-9!', ctx), /name or email/));
  assert.ok(has(problems('xx-smith-Is-Great-7!', ctx), /name or email/));
  assert.deepEqual(problems('Purple-Giraffe-Sings-9!', ctx), []);
});

/* ═══ hashing ═══════════════════════════════════════════════════════════ */
test('hashes are salted, versioned, bcrypt-bounded and never contain the password', async () => {
  const pw = STRONG;
  const h1 = await hashPassword(pw);
  const h2 = await hashPassword(pw);
  assert.notEqual(h1, h2);
  assert.ok(h1.startsWith('dsvp1$$2'));
  assert.ok(h1.length <= 255);
  assert.ok(!h1.includes(pw));
  assert.ok(await verifyPassword(pw, h1));
  assert.ok(!(await verifyPassword(pw + 'x', h1)));
});

test('long passphrases are never silently truncated (bcrypt 72-byte limit)', async () => {
  const base = 'Aa1!' + 'x'.repeat(80);
  const h = await hashPassword(base);
  assert.ok(await verifyPassword(base, h));
  // plain bcrypt would accept all of these because they share the first 72 bytes
  assert.ok(!(await verifyPassword(base + 'DIFFERENT', h)));
  assert.ok(!(await verifyPassword(base.slice(0, 75), h)));
  // multi-byte: 40 emoji = 160 bytes
  const emoji = 'Aa1!' + '🔒'.repeat(40);
  const he = await hashPassword(emoji);
  assert.ok(await verifyPassword(emoji, he));
  assert.ok(!(await verifyPassword('Aa1!' + '🔒'.repeat(39) + '🔑', he)));
  // legacy bcrypt confirms the premise of the test
  const legacy = await bcrypt.hash(base, 4);
  assert.ok(await bcrypt.compare(base + 'DIFFERENT', legacy));
});

test('Unicode normalisation: composed and decomposed forms are the same password', async () => {
  const composed = 'Café-Mocha-Latte-9!';
  const decomposed = 'Café-Mocha-Latte-9!';
  assert.notEqual(composed, decomposed);
  assert.ok(await verifyPassword(decomposed, await hashPassword(composed)));
});

test('legacy bcrypt hashes (and weak legacy passwords) still verify', async () => {
  const legacy = await bcrypt.hash('secret1', 4);
  assert.ok(await verifyPassword('secret1', legacy));
  assert.ok(!(await verifyPassword('secret2', legacy)));
  assert.ok(!(await verifyPassword('x', '!')));
  assert.ok(!(await verifyPassword('x', undefined)));
});

/* ═══ breach check (k-anonymity) ════════════════════════════════════════ */
test('breach check sends only a 5-char SHA-1 prefix and matches locally', async () => {
  process.env.PASSWORD_BREACH_CHECK = 'on';
  const pw = 'Tr0ub4dor&3-horse-Staple';
  const hash = sha1(pw);
  const seen = [];
  breach._setFetch(async (url, opts) => {
    seen.push({ url, opts });
    return { ok: true, text: async () => `${'0'.repeat(35)}:0\r\n${hash.slice(5)}:4521\r\n${'F'.repeat(35)}:2` };
  });
  const errs = await checkPasswordPolicy(pw);
  assert.ok(has(errs, /data breach/));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
  assert.ok(!seen[0].url.includes(hash.slice(5)), 'suffix must never be sent');
  assert.ok(!JSON.stringify(seen[0].opts).includes(pw));
  assert.equal(seen[0].opts.headers['Add-Padding'], 'true');
});

test('breach check: padding rows and non-matches pass; outages fail open (strict: closed)', async () => {
  process.env.PASSWORD_BREACH_CHECK = 'on';
  const pw = 'Tr0ub4dor&3-horse-Staple';
  breach._setFetch(async () => ({ ok: true, text: async () => `${sha1(pw).slice(5)}:0\r\n${'A'.repeat(35)}:9` }));
  assert.deepEqual(await checkPasswordPolicy(pw), []);               // count 0 = padding

  breach._setFetch(async () => { throw new Error('ENOTFOUND'); });
  assert.deepEqual(await checkPasswordPolicy(pw), []);               // fail open
  breach._setFetch(async () => ({ ok: false, status: 503 }));
  assert.deepEqual(await checkPasswordPolicy(pw), []);

  process.env.PASSWORD_BREACH_CHECK = 'strict';
  assert.ok(has(await checkPasswordPolicy(pw), /couldn.t verify/));

  process.env.PASSWORD_BREACH_CHECK = 'off';
  let called = 0;
  breach._setFetch(async () => { called += 1; return { ok: true, text: async () => '' }; });
  assert.deepEqual(await checkPasswordPolicy(pw), []);
  assert.equal(called, 0);
});

test('breach check is skipped for passwords that already fail offline rules', async () => {
  process.env.PASSWORD_BREACH_CHECK = 'on';
  let called = 0;
  breach._setFetch(async () => { called += 1; return { ok: true, text: async () => '' }; });
  assert.ok((await checkPasswordPolicy('short')).length > 0);
  assert.equal(called, 0);
});

/* ═══ registration ══════════════════════════════════════════════════════ */
const reg = (over = {}) => call('POST', '/auth/register', { body: { fullName: 'Reg User', email: 'reg@example.com', password: STRONG, ...over } });

test('registration enforces the policy and reports every problem', async () => {
  const r = await reg({ password: 'short' });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'PASSWORD_POLICY');
  assert.ok(r.body.errors.length >= 3);
  assert.equal((await reg({ password: 'Password123!!!' })).status, 400);
  assert.equal((await reg({ password: ' Leading-Space-Pass-1!' })).status, 400);
  assert.equal(db.users.length, 0);
  assert.equal((await reg()).status, 201);
});

test('registration rejects a known-breached password', async () => {
  process.env.PASSWORD_BREACH_CHECK = 'on';
  breach._setFetch(async () => ({ ok: true, text: async () => `${sha1(STRONG).slice(5)}:77` }));
  const r = await reg();
  assert.equal(r.status, 400);
  assert.match(r.body.message, /data breach/);
});

test('registration accepts long passphrases and Unicode; login uses the exact same string', async () => {
  const phrase = 'Correct Horse Battery Staple 9! ' + 'and then some more words 7? '.repeat(3) + 'End.';
  assert.ok(phrase.length > 100);
  assert.equal((await reg({ password: phrase })).status, 201);
  assert.equal((await passwordLogin('reg@example.com', phrase)).status, 200);
  assert.equal((await passwordLogin('reg@example.com', phrase.slice(0, 80))).status, 401, 'no truncation');

  const uni = 'Пароль-Сложный-2024-Ω!';
  assert.equal((await reg({ email: 'uni@example.com', password: uni })).status, 201);
  assert.equal((await passwordLogin('uni@example.com', uni.normalize('NFD'))).status, 200);
});

test('signup OTP: weak password is rejected without burning the OTP; reuse is blocked', async () => {
  await call('POST', '/auth/signup/send-otp', { body: { email: 'new@example.com' } });
  const otp = db.mails.find((m) => m.kind === 'signup-otp').otp;
  const body = { fullName: 'New User', email: 'new@example.com', otp };

  const weak = await call('POST', '/auth/signup/verify-otp', { body: { ...body, password: 'abc123' } });
  assert.equal(weak.status, 400);
  assert.equal(weak.body.code, 'PASSWORD_POLICY');
  assert.equal(db.users.length, 0);

  const ok = await call('POST', '/auth/signup/verify-otp', { body: { ...body, password: STRONG } });
  assert.equal(ok.status, 201);
  const again = await call('POST', '/auth/signup/verify-otp', { body: { ...body, password: STRONG } });
  assert.ok([400, 409].includes(again.status));
  assert.equal(db.users.length, 1);
});

/* ═══ login: existing credentials, generic errors ═══════════════════════ */
test('login never applies the new-password rules to existing credentials', async () => {
  addUser({ Email: 'old@example.com', PasswordHash: await bcrypt.hash('abc123', 4) });
  const r = await passwordLogin('old@example.com', 'abc123');
  assert.equal(r.status, 200);
  assert.ok(r.body.token);
});

test('login errors are generic: unknown account and wrong password look identical', async () => {
  await addUserWithPassword(STRONG, { Email: 'a@example.com' });
  const wrong = await passwordLogin('a@example.com', 'nope-nope-nope');
  const ghost = await passwordLogin('ghost@example.com', 'nope-nope-nope');
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, ghost.body);
  assert.equal((await passwordLogin('a@example.com', 'x'.repeat(5000))).status, 401);
});

for (const status of ['blocked', 'inactive']) {
  test(`${status} user: login denied only after correct credentials; change/reset refused`, async () => {
    const u = await addUserWithPassword(STRONG, { Email: 'b@example.com', Status: status });
    assert.equal((await passwordLogin('b@example.com', 'wrong-password-1!')).status, 401);
    assert.equal((await passwordLogin('b@example.com', STRONG)).status, 403);

    const tok = jwt.sign({ userId: u.UserId, tokenVersion: 1 }, process.env.JWT_SECRET);
    assert.equal((await call('PATCH', '/users/password', { token: tok, body: { currentPassword: STRONG, newPassword: STRONG2, confirmPassword: STRONG2 } })).status, 401);

    const resetToken = await issueResetToken('b@example.com');
    const r = await call('POST', '/auth/forgot-password/reset', { body: { resetToken, newPassword: STRONG2 } });
    assert.equal(r.status, 403);
    assert.equal(u.PasswordHash.startsWith('dsvp1$'), true);
    assert.ok(await verifyPassword(STRONG, u.PasswordHash), 'password untouched');
  });
}

/* ═══ change password: policy, confirmation, reuse/history ══════════════ */
async function sessionFor(password, over = {}) {
  const u = await addUserWithPassword(password, { Email: 'chg@example.com', FullName: 'Chg Person', ...over });
  const r = await passwordLogin(u.Email, password);
  assert.equal(r.status, 200);
  return { user: u, token: r.body.token };
}
const change = (token, current, next, confirm = next) =>
  call('POST', '/auth/change-password', { token, body: { currentPassword: current, newPassword: next, confirmPassword: confirm } });

test('change-password: policy, mismatch, wrong current, same-as-current, whitespace', async () => {
  const { token } = await sessionFor(STRONG);
  assert.equal((await change(token, STRONG, STRONG2, STRONG2 + 'x')).body.code, 'PASSWORD_MISMATCH');
  assert.equal((await change(token, STRONG, 'Short1!')).body.code, 'PASSWORD_POLICY');
  assert.equal((await change(token, STRONG, 'Password123!!!')).body.code, 'PASSWORD_POLICY');
  assert.equal((await change(token, STRONG, ' ' + STRONG2)).body.code, 'PASSWORD_POLICY');
  assert.equal((await change(token, 'wrong-current-1!', STRONG2)).body.code, 'CURRENT_PASSWORD_INCORRECT');
  assert.equal((await change(token, STRONG, STRONG)).body.code, 'PASSWORD_UNCHANGED');
  assert.equal((await change(token, STRONG, STRONG2)).status, 200);
});

test('change-password: password history blocks reuse of the last N, then releases the oldest', async () => {
  // PASSWORD_HISTORY_COUNT=3 in tests: current + 3 previous are remembered
  const pws = ['Pw-One-Alpha-1111!a', 'Pw-Two-Bravo-2222!b', 'Pw-Three-Charlie-3333!c', 'Pw-Four-Delta-4444!d', 'Pw-Five-Echo-5555!e'];
  let { token } = await sessionFor(pws[0]);
  for (let i = 1; i < pws.length; i++) {
    const r = await change(token, pws[i - 1], pws[i]);
    assert.equal(r.status, 200, `change to #${i}`);
    token = r.body.token;
  }
  // now: current=#5, history=#4,#3,#2   (#1 aged out)
  for (const reused of [pws[3], pws[2], pws[1]]) {
    const r = await change(token, pws[4], reused);
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'PASSWORD_REUSED');
  }
  assert.equal((await change(token, pws[4], pws[0])).status, 200, 'oldest has aged out of history');
});

test('change-password: success revokes older JWTs and returns a working fresh one', async () => {
  const { token } = await sessionFor(STRONG);
  const r = await change(token, STRONG, STRONG2);
  assert.equal(r.status, 200);
  const old = await call('GET', '/users/me', { token });
  assert.equal(old.status, 401);
  assert.equal(old.body.code, 'SESSION_INVALIDATED');
  assert.equal((await call('GET', '/users/me', { token: r.body.token })).status, 200);
  assert.equal((await passwordLogin('chg@example.com', STRONG2)).status, 200);
  assert.equal((await passwordLogin('chg@example.com', STRONG)).status, 401);
});

test('Profile endpoint PATCH /users/password uses the same policy and returns a fresh session', async () => {
  const { token } = await sessionFor(STRONG);
  assert.equal((await call('PATCH', '/users/password', { token, body: { currentPassword: STRONG, newPassword: 'weak', confirmPassword: 'weak' } })).status, 400);
  assert.equal((await call('PATCH', '/users/password', { token, body: { currentPassword: STRONG, newPassword: STRONG2 } })).status, 400, 'confirmation required');
  const ok = await call('PATCH', '/users/password', { token, body: { currentPassword: STRONG, newPassword: STRONG2, confirmPassword: STRONG2 } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  assert.equal((await call('GET', '/users/me', { token })).status, 401);
});

test('Google-created account: temp password change is subject to the full policy and history', async () => {
  await googleSignIn();
  const temp = db.mails.find((m) => m.kind === 'welcome').tempPassword;
  const login = await passwordLogin('newbie@gmail.com', temp);
  assert.equal(login.body.mustChangePassword, true);
  assert.equal((await change(login.body.token, temp, 'newbiepassword1!')).body.code, 'PASSWORD_POLICY'); // lowercase only / name-based
  assert.equal((await change(login.body.token, temp, temp)).body.code, 'PASSWORD_UNCHANGED');
  const ok = await change(login.body.token, temp, STRONG);
  assert.equal(ok.status, 200);
  // the temp password is remembered and can't come back
  const again = await change(ok.body.token, STRONG, temp);
  assert.equal(again.body.code, 'PASSWORD_REUSED');
});

/* ═══ forgot-password / admin reset ═════════════════════════════════════ */
async function issueResetToken(email, { ttlMs = 600000 } = {}) {
  const otpId = await w.db.otps.length + 1 && (await require('../src/models/otpModel').create(email, 'R' + crypto.randomBytes(8).toString('hex'), new Date(Date.now() + ttlMs)));
  return jwt.sign({ email, otpId, purpose: 'password_reset' }, process.env.JWT_SECRET, { expiresIn: '15m' });
}
const reset = (resetToken, newPassword) => call('POST', '/auth/forgot-password/reset', { body: { resetToken, newPassword } });

async function forgotFlow(email) {
  await call('POST', '/auth/forgot-password/send-otp', { body: { email } });
  const otp = db.mails.filter((m) => m.kind === 'otp').at(-1).otp;
  const v = await call('POST', '/auth/forgot-password/verify-otp', { body: { email, otp } });
  assert.equal(v.status, 200);
  return { otp, resetToken: v.body.resetToken };
}

test('forgot-password: full flow, new password works, old one and old sessions die', async () => {
  const u = await addUserWithPassword(STRONG, { Email: 'f@example.com', FullName: 'Forgetful One' });
  const old = await passwordLogin('f@example.com', STRONG);
  const { resetToken } = await forgotFlow('f@example.com');

  const r = await reset(resetToken, STRONG2);
  assert.equal(r.status, 200);
  assert.equal((await passwordLogin('f@example.com', STRONG2)).status, 200);
  assert.equal((await passwordLogin('f@example.com', STRONG)).status, 401);
  const dead = await call('GET', '/users/me', { token: old.body.token });
  assert.equal(dead.status, 401);
  assert.equal(dead.body.code, 'SESSION_INVALIDATED');
  assert.equal(u.MustChangePassword, false);
});

test('reset token is single use; a rejected password does not burn it', async () => {
  await addUserWithPassword(STRONG, { Email: 'f@example.com' });
  const { resetToken } = await forgotFlow('f@example.com');

  const weak = await reset(resetToken, 'weak');
  assert.equal(weak.status, 400);
  assert.equal(weak.body.code, 'PASSWORD_POLICY');
  const reused = await reset(resetToken, STRONG);                    // equals current → history rule
  assert.equal(reused.body.code, 'PASSWORD_REUSED');

  assert.equal((await reset(resetToken, STRONG2)).status, 200);
  const replay = await reset(resetToken, 'Yet-Another-Str0ng-Pass!9');
  assert.equal(replay.status, 400);
  assert.equal(replay.body.code, 'RESET_TOKEN_USED');
});

test('racing reset requests with one token: exactly one wins', async () => {
  await addUserWithPassword(STRONG, { Email: 'f@example.com' });
  const { resetToken } = await forgotFlow('f@example.com');
  const results = await Promise.all([reset(resetToken, STRONG2), reset(resetToken, 'Second-Racer-Str0ng-Pass!9')]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
});

test('expired reset tokens (JWT and DB row) are rejected', async () => {
  await addUserWithPassword(STRONG, { Email: 'f@example.com' });
  const expiredJwt = jwt.sign({ email: 'f@example.com', otpId: 1, purpose: 'password_reset' }, process.env.JWT_SECRET, { expiresIn: -10 });
  assert.equal((await reset(expiredJwt, STRONG2)).status, 400);

  const { resetToken } = await forgotFlow('f@example.com');
  db.otps.forEach((o) => { o.ExpiresAt = new Date(Date.now() - 1000); });
  assert.equal((await reset(resetToken, STRONG2)).body.code, 'RESET_TOKEN_USED');
  assert.ok(await verifyPassword(STRONG, byEmail('f@example.com').PasswordHash));
});

test('reset tokens of the wrong purpose or signature are rejected', async () => {
  await addUserWithPassword(STRONG, { Email: 'f@example.com' });
  const wrongPurpose = jwt.sign({ email: 'f@example.com', otpId: 1, purpose: 'other' }, process.env.JWT_SECRET);
  assert.equal((await reset(wrongPurpose, STRONG2)).status, 400);
  const forged = jwt.sign({ email: 'f@example.com', otpId: 1, purpose: 'password_reset' }, 'wrong-secret');
  assert.equal((await reset(forged, STRONG2)).status, 400);
  assert.equal((await call('POST', '/auth/forgot-password/reset', { body: {} })).status, 400);
});

test('admin-issued reset link goes through the same policy, history and session revocation', async () => {
  const u = await addUserWithPassword(STRONG, { Email: 'adm@example.com' });
  const tok = await passwordLogin('adm@example.com', STRONG);
  const link = await issueResetToken('adm@example.com');
  assert.equal((await reset(link, 'weak')).status, 400);
  assert.equal((await reset(link, STRONG2)).status, 200);
  assert.equal((await call('GET', '/users/me', { token: tok.body.token })).status, 401);
  assert.equal(u.TokenVersion, 2);
});

test('reset clears a pending temporary password (Google account setting a DSVP password)', async () => {
  await googleSignIn();
  const { resetToken } = await forgotFlow('newbie@gmail.com');
  assert.equal((await reset(resetToken, STRONG)).status, 200);
  const u = byEmail('newbie@gmail.com');
  assert.equal(u.MustChangePassword, false);
  const login = await passwordLogin('newbie@gmail.com', STRONG);
  assert.equal(login.status, 200);
  assert.equal(login.body.mustChangePassword, undefined);
});

test('forgot-password send-otp: identical response for unknown/known/mail-failure; OTP is 6 digits', async () => {
  await addUserWithPassword(STRONG, { Email: 'f@example.com' });
  const known = await call('POST', '/auth/forgot-password/send-otp', { body: { email: 'f@example.com' } });
  const unknown = await call('POST', '/auth/forgot-password/send-otp', { body: { email: 'ghost@example.com' } });
  assert.deepEqual(known, unknown);
  assert.match(db.mails.find((m) => m.kind === 'otp').otp, /^\d{6}$/);
  w.reset(); await addUserWithPassword(STRONG, { Email: 'f@example.com' });
  db.failOtpMail = true;
  const failed = await call('POST', '/auth/forgot-password/send-otp', { body: { email: 'f@example.com' } });
  assert.equal(failed.status, 200);
  assert.deepEqual(failed.body, known.body);
});

test('verify-otp: wrong, used and expired codes are rejected', async () => {
  await addUserWithPassword(STRONG, { Email: 'f@example.com' });
  await call('POST', '/auth/forgot-password/send-otp', { body: { email: 'f@example.com' } });
  const otp = db.mails[0].otp;
  const bad = otp === '000000' ? '111111' : '000000';
  assert.equal((await call('POST', '/auth/forgot-password/verify-otp', { body: { email: 'f@example.com', otp: bad } })).status, 400);
  db.otps[0].ExpiresAt = new Date(Date.now() - 1000);
  assert.match((await call('POST', '/auth/forgot-password/verify-otp', { body: { email: 'f@example.com', otp } })).body.message, /expired/);
  db.otps[0].Used = true;
  assert.match((await call('POST', '/auth/forgot-password/verify-otp', { body: { email: 'f@example.com', otp } })).body.message, /already been used/);
});

/* ═══ temporary credentials ═════════════════════════════════════════════ */
test('temp credentials: expiry, single use, mandatory change and server-side API lock', async () => {
  await googleSignIn();
  const temp = db.mails.find((m) => m.kind === 'welcome').tempPassword;
  const u = byEmail('newbie@gmail.com');

  const login = await passwordLogin('newbie@gmail.com', temp);
  assert.equal(login.body.mustChangePassword, true);
  assert.equal((await call('GET', '/modules', { token: login.body.token })).body.code, 'PASSWORD_CHANGE_REQUIRED');

  u.TempPasswordExpiresAt = new Date(Date.now() - 1000);
  assert.equal((await passwordLogin('newbie@gmail.com', temp)).body.code, 'TEMP_PASSWORD_EXPIRED');
  u.TempPasswordExpiresAt = new Date(Date.now() + 60000);

  assert.equal((await change(login.body.token, temp, STRONG)).status, 200);
  assert.equal((await passwordLogin('newbie@gmail.com', temp)).status, 401, 'single use');
});

/* ═══ rate limiting ═════════════════════════════════════════════════════ */
async function hammer(n, fn) {
  let last;
  for (let i = 0; i < n; i++) last = await fn(i);
  return last;
}
test('OTP send, OTP verify and reset-password are rate limited', async () => {
  const send = await hammer(6, () => call('POST', '/auth/forgot-password/send-otp', { body: { email: 'x@example.com' } }));
  assert.equal(send.status, 429);
  const signup = await hammer(6, () => call('POST', '/auth/signup/send-otp', { body: { email: 'y@example.com' } }));
  assert.equal(signup.status, 429);
  const verify = await hammer(11, () => call('POST', '/auth/forgot-password/verify-otp', { body: { email: 'x@example.com', otp: '000000' } }));
  assert.equal(verify.status, 429);
  assert.ok(verify.body.retryAfterSeconds > 0);
  const rst = await hammer(11, () => reset('garbage', STRONG));
  assert.equal(rst.status, 429);
});

test('login rate limit applies even to correct credentials once exceeded', async () => {
  await addUserWithPassword(STRONG, { Email: 'rl@example.com' });
  const last = await hammer(11, () => passwordLogin('rl@example.com', 'wrong-wrong-1!'));
  assert.equal(last.status, 429);
  assert.equal((await passwordLogin('rl@example.com', STRONG)).status, 429);
});

/* ═══ security audit trail ══════════════════════════════════════════════ */
test('security audit events are recorded and never contain credentials', async () => {
  const secrets = new Set([STRONG, STRONG2]);
  const u = await addUserWithPassword(STRONG, { Email: 'aud@example.com' });
  await passwordLogin('aud@example.com', 'wrong-wrong-1!');
  await passwordLogin('ghost@example.com', 'wrong-wrong-1!');
  const login = await passwordLogin('aud@example.com', STRONG);
  await change(login.body.token, 'bad-current-Pass1!', STRONG2);
  const ch = await change(login.body.token, STRONG, STRONG2);
  const { otp, resetToken } = await forgotFlow('aud@example.com');
  await reset(resetToken, 'Fresh-Reset-Str0ng-Pass!7');
  secrets.add(otp); secrets.add(resetToken); secrets.add(ch.body.token); secrets.add(login.body.token);

  const types = db.audit.map((e) => e.eventType);
  for (const t of ['login_failed', 'login_success', 'password_change_failed', 'password_changed',
    'password_reset_requested', 'password_reset_completed']) {
    assert.ok(types.includes(t), `missing audit event ${t}`);
  }
  const unknown = db.audit.find((e) => e.eventType === 'login_failed' && e.userId === null);
  assert.ok(unknown && /^[0-9a-f]{16}$/.test(unknown.identifier), 'unknown accounts are logged by hash only');

  const blob = JSON.stringify(db.audit);
  for (const s of secrets) assert.ok(!blob.includes(s), 'credential leaked into audit log');
  assert.ok(!blob.includes('ghost@example.com'), 'raw email of an unknown account must not be stored');
  void u;
});

test('audit scrub drops secret-looking keys and non-scalar values', () => {
  const out = audit.scrub({ reason: 'x', password: 'p', resetToken: 't', otp: '1', nested: { a: 1 }, count: 3 });
  assert.deepEqual(out, { reason: 'x', count: 3 });
  assert.equal(audit.scrub({ token: 'x' }), null);
});

test('Google sign-in outcomes are audited without tokens', async () => {
  await googleSignIn();
  await googleSignIn({ email_verified: false }, {});
  const types = db.audit.map((e) => e.eventType);
  assert.ok(types.includes('google_signup'));
  assert.ok(types.includes('google_rejected'));
  assert.ok(!JSON.stringify(db.audit).includes('tok-'));
});

/* ═══ frontend/backend rule parity ══════════════════════════════════════ */
test('frontend checklist agrees with the backend on structural rules', async () => {
  const fe = await import('../../frontend/src/utils/passwordPolicy.js');
  const samples = [
    'Abcdef1!xyzQ', 'Abcdef1!xyz', 'alllowercase123!', 'ALLUPPERCASE123!', 'NoDigitsHere!!!!', 'NoSpecialChar1234',
    ' Leading-Space-1x', 'Trailing-Space-1x ', 'Inner spaces are fine 1!', 'Привет-Мир-2024!', 'Aa1' + '🔒'.repeat(120),
    'Aa1!' + 'x'.repeat(124), 'Aa1!' + 'x'.repeat(125), '', 'short',
  ];
  for (const pw of samples) {
    const backendOk = validatePassword(pw).length === 0;
    const frontendOk = fe.localProblems(pw).length === 0;
    assert.equal(frontendOk, backendOk, `disagree on ${JSON.stringify(pw.slice(0, 30))}`);
  }
});
