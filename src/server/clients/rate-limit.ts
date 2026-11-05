import { env } from "~/env";
import { getRedis } from "~/server/clients/redis";

export type RateLimitKind = "chat" | "cron" | "telegram";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface LimitWindow {
  /** Maximum number of allowed events in the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

function windowsFor(kind: RateLimitKind): LimitWindow[] {
  switch (kind) {
    case "chat":
      return [
        { limit: env.RATE_LIMIT_CHAT_PER_MINUTE, windowSeconds: 60 },
        { limit: env.RATE_LIMIT_CHAT_PER_DAY, windowSeconds: 60 * 60 * 24 },
      ];
    case "cron":
      return [{ limit: env.RATE_LIMIT_CRON_PER_DAY, windowSeconds: 60 * 60 * 24 }];
    case "telegram":
      return [{ limit: env.RATE_LIMIT_TELEGRAM_PER_MINUTE, windowSeconds: 60 }];
  }
}

function unavailableResult(kind: RateLimitKind, reason: string): RateLimitResult {
  const allowed = env.RATE_LIMIT_FAIL_MODE === "open";
  console.warn(
    `[rate-limit] ${reason}; fail_mode=${env.RATE_LIMIT_FAIL_MODE}; kind=${kind}`,
  );
  return { allowed, retryAfterSeconds: allowed ? 0 : 60 };
}

/**
 * Fixed-window counter rate limiter backed by Redis INCR + EXPIRE.
 *
 * One key per (kind, window, userId). INCR is atomic; we set EXPIRE only when
 * the counter is fresh (count === 1). If multiple windows are configured for a
 * kind (e.g., chat has per-minute and per-day), the request must fit under
 * EVERY window or it's denied.
 */
export async function rateLimit(
  userId: string,
  kind: RateLimitKind,
): Promise<RateLimitResult> {
  if (!env.RATE_LIMIT_ENABLED) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const redis = getRedis();
  if (!redis) return unavailableResult(kind, "Redis is not configured");

  try {
    for (const { limit, windowSeconds } of windowsFor(kind)) {
      const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
      const key = `trustclaw:rate-limit:${kind}:${windowSeconds}:${bucket}:${userId}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      if (count > limit) {
        const ttl = await redis.ttl(key);
        const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds;
        return { allowed: false, retryAfterSeconds };
      }
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (error) {
    console.warn("[rate-limit] Redis call failed:", error);
    return unavailableResult(kind, "Redis call failed");
  }
}
