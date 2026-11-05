import { z } from "zod";
import { ALL_MODEL_IDS, DEFAULT_MODEL_ID } from "./models";

/**
 * @deprecated Use `ALL_MODEL_IDS` from `./models` for the full provider-agnostic list.
 * Retained for callers/imports that still reference Anthropic-only.
 */
export const ALLOWED_ANTHROPIC_MODELS = ALL_MODEL_IDS;

export const allowedAnthropicModelSchema = z.enum(ALL_MODEL_IDS);

export const createInstanceInput = z.object({
  anthropicModel: allowedAnthropicModelSchema.default(DEFAULT_MODEL_ID),
});

export type CreateInstanceInput = z.infer<typeof createInstanceInput>;
