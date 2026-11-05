import { z } from "zod";

export const createInviteCodeInput = z.object({
  expiresAt: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => !value || !Number.isNaN(Date.parse(value)),
      "Enter a valid expiration date",
    ),
  note: z.string().trim().max(200).optional(),
});

export type CreateInviteCodeInput = z.infer<typeof createInviteCodeInput>;
