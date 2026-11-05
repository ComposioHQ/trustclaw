import { z } from "zod";

export const saveGlenConnectionInput = z.object({
  apiKey: z.string().trim().min(1),
  orgId: z.string().trim().min(1),
});
