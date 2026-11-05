import { TRPCError } from "@trpc/server";
import { adminProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { revokeInviteCodeInput } from "./revokeInviteCode.schema";

export const revokeInviteCode = adminProcedure
  .input(revokeInviteCodeInput)
  .mutation(async ({ input }) => {
    const result = await db.inviteCode.updateMany({
      where: {
        id: input.id,
        usedAt: null,
      },
      data: {
        expiresAt: new Date(),
      },
    });

    if (result.count !== 1) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invite code is already used or does not exist",
      });
    }

    return { success: true };
  });
