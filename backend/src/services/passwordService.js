const crypto = require('crypto');
const bcrypt = require('bcryptjs');

/**
 * Password hashing on top of the existing bcryptjs dependency.
 *
 * bcrypt only reads the first 72 *bytes* of its input, so a long passphrase
 * (or one with multi-byte characters) would be silently truncated. To avoid
 * that, new hashes are bcrypt(base64(SHA-256(NFKC(password)))) — a fixed 44
 * ASCII characters — and are tagged with a version prefix. Stored hashes
 * without the prefix are legacy plain-bcrypt hashes (and are still verified
 * exactly as before), so every existing credential keeps working.
 *
 * NFKC normalisation makes visually identical Unicode input (composed vs.
 * decomposed accents, full-width forms) hash the same across devices.
 */
const PREFIX = 'dsvp1$';

const rounds = () => {
  const n = parseInt(process.env.BCRYPT_ROUNDS, 10);
  return Number.isFinite(n) && n >= 4 && n <= 15 ? n : 12;
};

const prehash = (pw) => crypto.createHash('sha256').update(pw.normalize('NFKC'), 'utf8').digest('base64');

async function hashPassword(pw) {
  return PREFIX + await bcrypt.hash(prehash(pw), rounds());
}

async function verifyPassword(pw, stored) {
  if (typeof pw !== 'string' || typeof stored !== 'string' || !stored) return false;
  if (stored.startsWith(PREFIX)) return bcrypt.compare(prehash(pw), stored.slice(PREFIX.length));
  return bcrypt.compare(pw, stored); // legacy bcrypt hash
}

// Burns the same CPU as a real check when the account doesn't exist.
let decoy;
async function verifyAgainstDecoy(pw) {
  decoy = decoy || hashPassword('decoy-password-for-timing');
  return verifyPassword(pw, await decoy);
}

module.exports = { hashPassword, verifyPassword, verifyAgainstDecoy };
