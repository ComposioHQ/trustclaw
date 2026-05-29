import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const globalForRatelimit = globalThis as typeof globalThis & {
  upstashRedis: Redis | undefined;
  chatRatelimit: Ratelimit | undefined;
};

function isUpstashConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function getUpstashRedis(): Redis | null {
  if (!isUpstashConfigured()) return null;
  globalForRatelimit.upstashRedis ??= new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  return globalForRatelimit.upstashRedis;
}

// ─── Chat Rate Limiter (sliding window) ──────────────────────────────────────

const CHAT_RATE_LIMIT_REQUESTS = parseInt(
  process.env.RATE_LIMIT_CHAT_REQUESTS ?? "20",
  10,
);
const CHAT_RATE_LIMIT_WINDOW =
  process.env.RATE_LIMIT_CHAT_WINDOW ?? "60 s";

export function getChatRatelimit(): Ratelimit | null {
  if (!isUpstashConfigured()) return null;
  globalForRatelimit.chatRatelimit ??= new Ratelimit({
    redis: getUpstashRedis()!,
    limiter: Ratelimit.slidingWindow(
      CHAT_RATE_LIMIT_REQUESTS,
      CHAT_RATE_LIMIT_WINDOW as Parameters<typeof Ratelimit.slidingWindow>[1],
    ),
    analytics: true,
    prefix: "trustclaw:ratelimit:chat",
  });
  return globalForRatelimit.chatRatelimit;
}

// ─── Monthly Tool-Call Cap ───────────────────────────────────────────────────

const MONTHLY_TOOL_CAP = parseInt(
  process.env.MONTHLY_TOOL_CALL_CAP ?? "1000",
  10,
);
const TOOL_CAP_TTL = 35 * 24 * 60 * 60; // 35 days — old months self-clean

function currentMonthKey(userId: string): string {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `trustclaw:toolcap:${userId}:${ym}`;
}

export async function checkToolCallCap(
  userId: string,
): Promise<
  { allowed: true; remaining: number } | { allowed: false; limit: number }
> {
  const redis = getUpstashRedis();
  if (!redis) return { allowed: true, remaining: Infinity };

  const key = currentMonthKey(userId);
  const used = (await redis.get<number>(key)) ?? 0;

  if (used >= MONTHLY_TOOL_CAP) {
    return { allowed: false, limit: MONTHLY_TOOL_CAP };
  }
  return { allowed: true, remaining: MONTHLY_TOOL_CAP - used };
}

export async function incrementToolCallCount(
  userId: string,
  count: number,
): Promise<void> {
  const redis = getUpstashRedis();
  if (!redis || count <= 0) return;

  const key = currentMonthKey(userId);
  const pipeline = redis.pipeline();
  pipeline.incrby(key, count);
  pipeline.expire(key, TOOL_CAP_TTL);
  await pipeline.exec();
}

export { MONTHLY_TOOL_CAP };
