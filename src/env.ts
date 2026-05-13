import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // Better Auth
    BETTER_AUTH_SECRET: z.string(),

    // Composio API (global key)
    COMPOSIO_API_KEY: z.string(),

    // Telegram bot (optional - Telegram features disabled when missing)
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_BOT_USERNAME: z.string().optional(),
    TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

    // Database
    DATABASE_URL: z.string().url(),

    // Redis (optional - resumable streams disabled when missing; basic streaming still works)
    REDIS_URL: z.string().optional(),

    // Cron auth. Required in production so unauthenticated callers can't hit
    // /api/cron/* endpoints. Vercel auto-injects this when crons are configured
    // in vercel.json; the trustclaw deploy CLI also generates one on first deploy.
    CRON_SECRET: z.string(),

    // LLM provider routing.
    //  - "vercel-ai-gateway" (default): LLM + embedding calls go through Vercel
    //    AI Gateway. On Vercel deployments this auto-authenticates via
    //    VERCEL_OIDC_TOKEN; locally you can set AI_GATEWAY_API_KEY or run
    //    `vercel link && vercel env pull`.
    //  - "openrouter": LLM + embedding calls go through OpenRouter using
    //    OPENROUTER_API_KEY. The model and embedding ids stored in the DB are
    //    mapped to OpenRouter slugs by src/server/clients/ai/model-mapping.ts.
    //    Embeddings stay on openai/text-embedding-3-large with 1024 dims, so
    //    existing pgvector rows remain compatible after switching.
    LLM_PROVIDER: z
      .enum(["vercel-ai-gateway", "openrouter"])
      .default("vercel-ai-gateway"),
    OPENROUTER_API_KEY: z.string().optional(),
    AI_GATEWAY_API_KEY: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  runtimeEnv: {
    // Server
    NODE_ENV: process.env.NODE_ENV,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    CRON_SECRET: process.env.CRON_SECRET,
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,

    // Client URL resolution:
    //  - dev: derive from PORT so `PORT=3001 pnpm dev` just works
    //  - prod with explicit override: use NEXT_PUBLIC_APP_URL
    //  - on Vercel: fall back to the auto-injected canonical URL so self-hosters
    //    don't need to set anything (VERCEL_PROJECT_PRODUCTION_URL is the
    //    stable production domain; VERCEL_URL is the per-deployment URL)
    NEXT_PUBLIC_APP_URL:
      process.env.NODE_ENV === "development"
        ? `http://localhost:${process.env.PORT ?? "3000"}`
        : (process.env.NEXT_PUBLIC_APP_URL ??
          (process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
            : process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : undefined)),
  },
  // SKIP_ENV_VALIDATION is for local lint/typecheck without a full .env.
  // Never honour it in production — security-critical secrets like
  // CRON_SECRET and BETTER_AUTH_SECRET must always be present at runtime.
  skipValidation:
    !!process.env.SKIP_ENV_VALIDATION && process.env.NODE_ENV !== "production",
  emptyStringAsUndefined: true,
});

// Cross-field validation: OpenRouter routing requires an API key. t3-env's
// createEnv() validates each field independently, so this lives outside the
// schema. Skipped in the same conditions as the rest of env validation.
if (
  !(
    !!process.env.SKIP_ENV_VALIDATION && process.env.NODE_ENV !== "production"
  ) &&
  env.LLM_PROVIDER === "openrouter" &&
  !env.OPENROUTER_API_KEY
) {
  throw new Error(
    "LLM_PROVIDER=openrouter requires OPENROUTER_API_KEY to be set. " +
      "Get a key at https://openrouter.ai/keys or switch LLM_PROVIDER back to vercel-ai-gateway.",
  );
}
