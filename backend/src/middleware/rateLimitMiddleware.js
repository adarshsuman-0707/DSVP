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

module.exports = { rateLimitExecution, LIMITS, WINDOW_MS };
