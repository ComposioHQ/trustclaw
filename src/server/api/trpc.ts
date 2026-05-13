import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { env } from "~/env";
import { auth } from "~/server/auth";

// Context creation
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth.api.getSession({ headers: opts.headers });

  return {
    headers: opts.headers,
    session,
  };
};

// tRPC initialization
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  sse: {
    maxDurationMs: 50_000, // Close gracefully before Vercel's serverless function timeout
    ping: {
      enabled: true,
      intervalMs: 15_000,
    },
    client: {
      reconnectAfterInactivityMs: 20_000,
    },
  },
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const router = t.router;

const authMiddleware = t.middleware(async ({ next, ctx }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

const adminMiddleware = t.middleware(async ({ next, ctx }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  if (!env.ADMIN_USER_EMAIL || ctx.session.user.email !== env.ADMIN_USER_EMAIL) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

/** Public procedure - session may be null. Use for unauthenticated endpoints. */
export const publicProcedure = t.procedure;

/** Protected procedure - session guaranteed. Throws UNAUTHORIZED if no session. */
export const protectedProcedure = t.procedure.use(authMiddleware);

/** Admin procedure - session belongs to ADMIN_USER_EMAIL. */
export const adminProcedure = t.procedure.use(adminMiddleware);
