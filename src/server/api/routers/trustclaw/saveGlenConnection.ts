import { TRPCError } from "@trpc/server";
import { symmetricEncrypt } from "better-auth/crypto";
import { env } from "~/env";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { GLEN_URL } from "~/server/clients/glen.consts";
import { saveGlenConnectionInput } from "./saveGlenConnection.schema";

export const saveGlenConnection = protectedProcedure
  .input(saveGlenConnectionInput)
  .mutation(async ({ ctx, input }) => {
    if (!env.GLEN_ENABLED) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Glen is not enabled on this deployment",
      });
    }

    // glen checks the key and that its owner belongs to the org on every request.
    const response = await fetch(`${GLEN_URL}/api/mcp/trpc/listOrgs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": input.apiKey,
        "x-glen-org-id": input.orgId,
      },
      body: JSON.stringify({ json: {} }),
    }).catch((error) => {
      console.error("[glen] connection check failed:", error);
      return null;
    });

    if (response?.status === 401 || response?.status === 403) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Glen didn't accept that API key and organization ID. Check both and try again.",
      });
    }
    if (!response?.ok) {
      console.error("[glen] connection check returned:", response?.status);
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: "Couldn't reach glen. Try again in a moment.",
      });
    }

    await db.user.update({
      where: { id: ctx.session.user.id },
      data: {
        glenApiKeyEncrypted: await symmetricEncrypt({
          key: env.BETTER_AUTH_SECRET,
          data: input.apiKey,
        }),
        glenOrgId: input.orgId,
      },
      select: { id: true },
    });

    return { success: true };
  });
