import { randomBytes } from "crypto";
import { adminProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { createInviteCodeInput } from "./createInviteCode.schema";

function generateInviteCode(): string {
  return `TC-${randomBytes(12).toString("base64url").toUpperCase()}`;
}

export const createInviteCode = adminProcedure
  .input(createInviteCodeInput)
  .mutation(async ({ ctx, input }) => {
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await db.inviteCode.create({
          data: {
            code: generateInviteCode(),
            createdBy: ctx.session.user.id,
            expiresAt,
            note: input.note || undefined,
          },
          select: {
            id: true,
            code: true,
            createdAt: true,
            createdBy: true,
            expiresAt: true,
            usedAt: true,
            usedByUser: true,
            note: true,
          },
        });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2002"
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new Error("Failed to generate a unique invite code");
  });
