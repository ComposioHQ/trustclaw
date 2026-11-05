import { adminProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { listInviteCodesInput } from "./listInviteCodes.schema";

function getInviteCodeStatus(inviteCode: {
  expiresAt: Date | null;
  usedAt: Date | null;
}): "active" | "expired" | "used" {
  if (inviteCode.usedAt) return "used";
  if (inviteCode.expiresAt && inviteCode.expiresAt <= new Date()) {
    return "expired";
  }
  return "active";
}

export const listInviteCodes = adminProcedure
  .input(listInviteCodesInput)
  .query(async ({ input }) => {
    const inviteCodes = await db.inviteCode.findMany({
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
      orderBy: { createdAt: "desc" },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    let nextCursor: string | undefined;
    if (inviteCodes.length > input.limit) {
      const nextItem = inviteCodes.pop();
      nextCursor = nextItem?.id;
    }

    return {
      items: inviteCodes.map((inviteCode) => ({
        ...inviteCode,
        status: getInviteCodeStatus(inviteCode),
      })),
      nextCursor,
    };
  });
