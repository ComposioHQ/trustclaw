import { z } from "zod";

export const revokeInviteCodeInput = z.object({
  id: z.string().min(1),
});

export type RevokeInviteCodeInput = z.infer<typeof revokeInviteCodeInput>;
