import { z } from "zod";

export const listInviteCodesInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
});

export type ListInviteCodesInput = z.infer<typeof listInviteCodesInput>;
