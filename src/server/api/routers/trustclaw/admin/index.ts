import { router } from "~/server/api/trpc";
import { createInviteCode } from "./createInviteCode";
import { listInviteCodes } from "./listInviteCodes";
import { revokeInviteCode } from "./revokeInviteCode";

export const adminRouter = router({
  createInviteCode,
  listInviteCodes,
  revokeInviteCode,
});
