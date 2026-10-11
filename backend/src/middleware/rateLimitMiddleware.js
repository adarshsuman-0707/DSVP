/**
 * Per-user hourly rate limit for code execution, tiered by subscription plan.
 *
 *   premium  -> unlimited (Pricing.jsx's "Unlimited executions" perk)
 *   basic    ->  20 requests / hour
 *   free     ->  10 requests / hour
 *
 * In-memory counter keyed by userId — this process is a single Node
 * instance (no horizontal scaling / clustering here), so an in-memory Map
 * is correct and avoids a DB round-trip on every single code run. The
 * window resets exactly 1 hour after a user's FIRST request in that
 * window (a rolling per-user window, not a shared clock tick), which is
 * both simpler and fairer than a fixed wall-clock hour boundary.
 */

const LIMITS = { basic: 20, free: 10 }; // premium is exempt entirely, see below
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

// userId -> { count, resetAt }
const buckets = new Map();

function planLimit(plan) {
  return LIMITS[plan] ?? LIMITS.free;
}

function rateLimitExecution(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return next(); // verifyToken already guards this route; defensive only

  // Admins are exempt — they run code to verify modules/content, not to
  // consume the product as an end user, and shouldn't be throttled while
  // debugging a report.
  if (req.user.role === 'admin') return next();

  const plan = req.user.subscriptionPlan || 'free';

  // Premium's "Unlimited executions" pricing perk (Pricing.jsx) must
  // actually be unlimited, not just a higher tiered number like basic's.
  if (plan === 'premium') return next();

  const limit = planLimit(plan);
  const now   = Date.now();

  let bucket = buckets.get(userId);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(userId, bucket);
  }

  const remaining = limit - bucket.count;
  res.set('X-RateLimit-Limit', String(limit));
  res.set('X-RateLimit-Remaining', String(Math.max(0, remaining - 1)));
  res.set('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      status: 'rate_limited',
      message: `Hourly execution limit reached (${limit} runs/hr on the ${plan} plan). Try again in ${Math.ceil(retryAfterSec / 60)} min, or upgrade for a higher limit.`,
      plan,
      limit,
      retryAfterSeconds: retryAfterSec,
      resetAt: bucket.resetAt,
    });
  }

  bucket.count += 1;
  next();
}

// Periodically sweep expired buckets so the Map doesn't grow unbounded
// across long server uptimes with many distinct users.
setInterval(() => {
  const now = Date.now();
  for (const [userId, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(userId);
  }
}, 10 * 60 * 1000).unref();

/**
 * Generic fixed-window limiter for auth endpoints (login, Google, password
 * change). In-memory like the execution limiter above (single Node process).
 * `keyFn(req)` picks the bucket; responds 429 + Retry-After when exceeded.
 */
function createRateLimiter({ windowMs, max, keyFn, message = 'Too many attempts. Please try again later.' }) {
  const hits = new Map(); // key -> { count, resetAt }

  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of hits) if (now >= b.resetAt) hits.delete(k);
  }, windowMs).unref();

  function limiter(req, res, next) {
    const key = keyFn(req);
    const now = Date.now();
    let b = hits.get(key);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      hits.set(key, b);
    }
    b.count += 1;
    if (b.count > max) {
      const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ message, code: 'RATE_LIMITED', retryAfterSeconds: retryAfter });
    }
    next();
  }
  limiter.reset = () => hits.clear();
  return limiter;
}

const envInt = (name, d) => {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const AUTH_WINDOW_MS = envInt('AUTH_RATE_WINDOW_MIN', 15) * 60 * 1000;

const loginLimiter = createRateLimiter({
  windowMs: AUTH_WINDOW_MS,
  max: envInt('LOGIN_RATE_MAX', 10),
  keyFn: (req) => `${req.ip}|${String(req.body?.email || '').trim().toLowerCase()}`,
  message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
});
const googleLimiter = createRateLimiter({
  windowMs: AUTH_WINDOW_MS,
  max: envInt('GOOGLE_RATE_MAX', 30),
  keyFn: (req) => req.ip,
  message: 'Too many Google sign-in attempts. Please wait a few minutes and try again.',
});
const changePasswordLimiter = createRateLimiter({
  windowMs: AUTH_WINDOW_MS,
  max: envInt('CHANGE_PASSWORD_RATE_MAX', 5),
  keyFn: (req) => String(req.user?.userId || req.ip),
  message: 'Too many password change attempts. Please wait a few minutes and try again.',
});

const byIpAndEmail = (req) => `${req.ip}|${String(req.body?.email || '').trim().toLowerCase()}`;
const otpSendLimiter = createRateLimiter({
  windowMs: AUTH_WINDOW_MS,
  max: envInt('OTP_SEND_RATE_MAX', 5),
  keyFn: byIpAndEmail,
  message: 'Too many code requests. Please wait a few minutes and try again.',
});
const otpVerifyLimiter = createRateLimiter({
  windowMs: AUTH_WINDOW_MS,
  max: envInt('OTP_VERIFY_RATE_MAX', 10),
  keyFn: byIpAndEmail,
  message: 'Too many incorrect codes. Please wait a few minutes and try again.',
});
const resetPasswordLimiter = createRateLimiter({
  windowMs: AUTH_WINDOW_MS,
  max: envInt('RESET_PASSWORD_RATE_MAX', 10),
  keyFn: (req) => req.ip,
  message: 'Too many reset attempts. Please wait a few minutes and try again.',
});

module.exports = {
  otpSendLimiter, otpVerifyLimiter, resetPasswordLimiter,
  rateLimitExecution, LIMITS, WINDOW_MS,
  createRateLimiter, loginLimiter, googleLimiter, changePasswordLimiter,
};
