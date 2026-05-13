/**
 * Maps the canonical model id stored in the database (e.g. the literal
 * Anthropic API model id `claude-sonnet-4-5-20250929`) to the slug each
 * configured provider expects.
 *
 * Vercel AI Gateway uses the upstream Anthropic id verbatim, prefixed with
 * `anthropic/`. OpenRouter uses its own short-form slugs like
 * `anthropic/claude-sonnet-4.5`.
 *
 * Keep this list in sync with `ALLOWED_ANTHROPIC_MODELS` in
 * `src/server/api/routers/trustclaw/createInstance.schema.ts`.
 */

const OPENROUTER_MODEL_MAP: Record<string, string> = {
  "claude-opus-4-6": "anthropic/claude-opus-4.6",
  "claude-sonnet-4-5-20250929": "anthropic/claude-sonnet-4.5",
  "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4.5",
};

/**
 * Vercel AI Gateway slug. The Gateway routes `anthropic/<id>` to Anthropic
 * with `<id>` as the upstream model name, so we just prepend the provider
 * namespace if it isn't already there.
 */
export function toGatewayModelId(canonicalModelId: string): string {
  return canonicalModelId.startsWith("anthropic/")
    ? canonicalModelId
    : `anthropic/${canonicalModelId}`;
}

/**
 * OpenRouter slug. Falls back to the gateway-style id if the canonical id
 * is unknown to the map - OpenRouter does also accept `anthropic/<exact>`
 * for many models, and an unmapped fallback is preferable to a hard crash.
 */
export function toOpenRouterModelId(canonicalModelId: string): string {
  const mapped = OPENROUTER_MODEL_MAP[canonicalModelId];
  if (mapped) return mapped;
  return canonicalModelId.startsWith("anthropic/")
    ? canonicalModelId
    : `anthropic/${canonicalModelId}`;
}
