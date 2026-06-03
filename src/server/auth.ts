import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { db } from "~/server/clients/db";
import { env } from "~/env";
import { getRedis, isRedisConfigured } from "./clients/redis";
import { z } from "zod";

const rateLimitValueSchema = z.object({
  count: z.coerce.number(),
  lastRequest: z.coerce.number(),
});

const signUpBodySchema = z
  .object({
    inviteCode: z.string().trim().min(1).optional(),
  })
  .passthrough();

const redisRateLimitStorage = isRedisConfigured()
  ? {
      customStorage: {
        get: async (key: string) => {
          const redis = getRedis();
          const value = redis ? await redis.get(key) : null;
          const parsedValue = value
            ? rateLimitValueSchema.parse(JSON.parse(value))
            : null;
          return {
            key,
            count: parsedValue?.count ?? 0,
            lastRequest: parsedValue?.lastRequest ?? 0,
          };
        },
        set: async (
          key: string,
          value: { count: number; lastRequest: number },
        ) => {
          const redis = getRedis();
          if (!redis) return;
          await redis.set(key, JSON.stringify(value), "EX", 60);
        },
      },
    }
  : {};

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.NEXT_PUBLIC_APP_URL,
  trustedOrigins: [
    env.NEXT_PUBLIC_APP_URL,
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ],
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  emailVerification: {
    sendOnSignUp: false,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          if (env.ALLOW_OPEN_SIGNUP) {
            return { data: user };
          }

          const parsedBody = signUpBodySchema.safeParse(ctx?.body);
          const inviteCode = parsedBody.success
            ? parsedBody.data.inviteCode
            : undefined;

          if (!inviteCode) {
            throw new APIError("BAD_REQUEST", {
              message: "Invite code required",
            });
          }

          const now = new Date();
          const result = await db.inviteCode.updateMany({
            where: {
              code: inviteCode,
              usedAt: null,
              usedByUser: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            data: {
              usedAt: now,
              usedByUser: user.id,
            },
          });

          if (result.count !== 1) {
            throw new APIError("BAD_REQUEST", {
              message: "Invalid or expired invite code",
            });
          }

          return { data: user };
        },
        after: async (user, ctx) => {
          if (env.ALLOW_OPEN_SIGNUP) {
            return;
          }

          const parsedBody = signUpBodySchema.safeParse(ctx?.body);
          const inviteCode = parsedBody.success
            ? parsedBody.data.inviteCode
            : undefined;

          if (!inviteCode) {
            return;
          }

          // The `before` hook claims the code (sets usedAt) before the user
          // id exists, leaving usedByUser null. Backfill it now so the admin
          // invite list records who redeemed each code.
          await db.inviteCode.updateMany({
            where: { code: inviteCode, usedByUser: null },
            data: { usedByUser: user.id },
          });
        },
      },
    },
  },
  plugins: [username(), nextCookies()],
  session: {
    expiresIn: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/username": {
        window: 10,
        max: 5,
      },
      "/sign-up/email": {
        window: 60,
        max: 5,
      },
    },
    ...redisRateLimitStorage,
  },
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
    },
  },
});

export type Session = typeof auth.$Infer.Session;
