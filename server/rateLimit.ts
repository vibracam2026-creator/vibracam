const buckets = new Map<string, { count: number; resetAt: number }>();

export function consumeRateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= max) return false;
  current.count += 1;
  return true;
}

export function getRateLimitKey(req: { ip?: string }, subject: string) {
  // Express sanitizes req.ip according to the configured trust proxy chain.
  // Never trust a raw X-Forwarded-For value supplied by the caller.
  const ip = req.ip || "unknown";
  return `${ip}:${subject.toLowerCase().trim()}`;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of Array.from(buckets.entries())) if (value.resetAt <= now) buckets.delete(key);
}, 60_000).unref();
