const MAX_BUCKETS = 10_000;
const buckets = new Map();

function getClientIdentifier(request) {
  const headers = request?.headers;
  const forwarded = headers?.get?.('x-forwarded-for');
  const realIp = headers?.get?.('x-real-ip');
  const value = String(forwarded || realIp || 'unknown')
    .split(',')[0]
    .trim();
  return value.slice(0, 200) || 'unknown';
}

function cleanup(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size <= MAX_BUCKETS) return;

  const oldest = [...buckets.entries()]
    .sort((left, right) => left[1].resetAt - right[1].resetAt)
    .slice(0, buckets.size - MAX_BUCKETS);
  for (const [key] of oldest) buckets.delete(key);
}

function consumeRateLimit(key, options = {}) {
  const limit = Number.isSafeInteger(options.limit) && options.limit > 0 ? options.limit : 10;
  const windowMs = Number.isSafeInteger(options.windowMs) && options.windowMs > 0
    ? options.windowMs
    : 60_000;
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const bucketKey = String(key || 'unknown').slice(0, 300);

  cleanup(now);
  let bucket = buckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(bucketKey, bucket);
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: 0,
  };
}

function rateLimitResponse(rate, body = { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' }) {
  return Response.json(body, {
    status: 429,
    headers: {
      'Retry-After': String(rate.retryAfterSeconds),
      'X-RateLimit-Limit': String(rate.limit),
      'X-RateLimit-Remaining': String(rate.remaining),
    },
  });
}

module.exports = {
  consumeRateLimit,
  getClientIdentifier,
  rateLimitResponse,
};
