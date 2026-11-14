import { NextFunction, Request, Response } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Creates a lightweight in-memory fixed-window rate limiter keyed by client IP.
 */
export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
}) {
  const {
    windowMs,
    maxRequests,
    message = "Too many requests. Please try again later.",
  } = options;
  const buckets = new Map<string, RateLimitEntry>();
  const MAX_TRACKED_IPS = 5000;

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";

    if (buckets.size >= MAX_TRACKED_IPS) {
      for (const [k, entry] of buckets) {
        if (now >= entry.resetAt) {
          buckets.delete(k);
        }
      }
      if (buckets.size >= MAX_TRACKED_IPS) {
        buckets.clear();
      }
    }

    const existing = buckets.get(key);
    if (!existing || now >= existing.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    existing.count += 1;
    if (existing.count > maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}
