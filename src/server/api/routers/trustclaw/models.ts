/**
 * Single source of truth for the chat models exposed to users.
 *
 * Model identifiers follow `<provider>/<model-id>` for non-Anthropic providers
 * (e.g. `nebius/deepseek-ai/DeepSeek-V3.2`) and a bare Claude id for Anthropic
 * (kept for backwards compatibility with existing rows in the DB).
 *
 * Anthropic ids are routed through AI Gateway in `agent/setup.ts`. Nebius ids
 * are resolved by `~/server/clients/nebius.ts` directly against Nebius Token
 * Factory's OpenAI-compatible endpoint.
 */

export type ModelProvider = "anthropic" | "nebius";

export interface ModelInfo {
  /** Identifier stored in the DB and passed to the AI SDK. */
  id: string;
  /** Display name shown to the user. */
  label: string;
  /** Short tagline next to the label. */
  description: string;
  /** Rough relative cost indicator for the picker. */
  cost: "$" | "$$" | "$$$";
  provider: ModelProvider;
  /** True for models with strong tool-use + reasoning chops; surfaced as the recommended default. */
  recommended?: boolean;
}

export const ANTHROPIC_MODELS = [
  {
    id: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    description: "Most capable",
    cost: "$$$",
    provider: "anthropic",
  },
  {
    id: "claude-sonnet-4-5-20250929",
    label: "Claude Sonnet 4.5",
    description: "Balanced",
    cost: "$$",
    provider: "anthropic",
    recommended: true,
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    description: "Fast & affordable",
    cost: "$",
    provider: "anthropic",
  },
] as const satisfies readonly ModelInfo[];

// Curated Nebius Token Factory line-up. Catalog at
// https://api.tokenfactory.nebius.com/v1/models?verbose=true.
export const NEBIUS_MODELS = [
  {
    id: "nebius/deepseek-ai/DeepSeek-V3.2",
    label: "DeepSeek V3.2",
    description: "Strong tool-use, low cost",
    cost: "$",
    provider: "nebius",
  },
  {
    id: "nebius/deepseek-ai/DeepSeek-R1",
    label: "DeepSeek R1",
    description: "Reasoning model",
    cost: "$$",
    provider: "nebius",
  },
  {
    id: "nebius/Qwen/Qwen3-Coder-480B",
    label: "Qwen3 Coder 480B",
    description: "Code-tuned",
    cost: "$$",
    provider: "nebius",
  },
  {
    id: "nebius/meta-llama/Llama-3.3-70B-Instruct",
    label: "Llama 3.3 70B",
    description: "General purpose",
    cost: "$",
    provider: "nebius",
  },
  {
    id: "nebius/openai/gpt-oss-120b",
    label: "GPT-OSS 120B",
    description: "Open-weights GPT",
    cost: "$",
    provider: "nebius",
  },
] as const satisfies readonly ModelInfo[];

export const ALL_MODELS = [...ANTHROPIC_MODELS, ...NEBIUS_MODELS] as const;

type AnyModelId = (typeof ALL_MODELS)[number]["id"];

export const ALL_MODEL_IDS = ALL_MODELS.map(
  (m) => m.id,
) as unknown as readonly [AnyModelId, ...AnyModelId[]];

export const DEFAULT_MODEL_ID: AnyModelId = "claude-sonnet-4-5-20250929";

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return ALL_MODELS.find((m) => m.id === modelId);
}

export function getModelProvider(modelId: string): ModelProvider {
  return getModelInfo(modelId)?.provider ?? "anthropic";
}

/**
 * Normalize a stored model id into the `provider/model-id` form that Vercel
 * AI Gateway expects. Bare Claude ids (legacy DB values from before Nebius
 * support landed) get the `anthropic/` prefix; ids that already include a
 * `/` are passed through unchanged.
 */
export function toGatewayModelId(modelId: string): string {
  return modelId.includes("/") ? modelId : `anthropic/${modelId}`;
}

/** True when this model should receive Anthropic-specific provider options. */
export function isAnthropicModel(modelId: string): boolean {
  return getModelProvider(modelId) === "anthropic";
}
