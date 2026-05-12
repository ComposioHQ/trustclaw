import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { env } from "~/env";

export const NEBIUS_DEFAULT_BASE_URL =
  "https://api.tokenfactory.nebius.com/v1";

export const NEBIUS_MODEL_PREFIX = "nebius/";

export type NebiusRoutingMode = "direct" | "gateway";

export function isNebiusModel(modelId: string): boolean {
  return modelId.startsWith(NEBIUS_MODEL_PREFIX);
}

/**
 * Resolved routing mode for Nebius models. Defaults to "direct" so the
 * existing direct-client path is the out-of-the-box behavior; self-hosters
 * who want unified observability set NEBIUS_ROUTING=gateway and register a
 * Nebius credential in their Vercel AI Gateway settings.
 */
export function getNebiusRouting(): NebiusRoutingMode {
  return env.NEBIUS_ROUTING === "gateway" ? "gateway" : "direct";
}

/**
 * True when Nebius models should appear in the UI given the current env.
 *
 * - direct mode requires NEBIUS_API_KEY (we hit Nebius ourselves)
 * - gateway mode trusts the self-hoster has registered a Nebius credential
 *   in their Vercel AI Gateway project — we can't probe that from the
 *   runtime, so the routing-mode flag itself is the opt-in.
 */
export function isNebiusConfigured(): boolean {
  return getNebiusRouting() === "gateway" ? true : !!env.NEBIUS_API_KEY;
}

let cachedDirectClient: ReturnType<typeof createOpenAICompatible> | null = null;

function getDirectClient() {
  if (!env.NEBIUS_API_KEY) {
    throw new Error(
      "NEBIUS_API_KEY is not set. Required when NEBIUS_ROUTING is unset or 'direct'.",
    );
  }
  cachedDirectClient ??= createOpenAICompatible({
    name: "nebius",
    baseURL: env.NEBIUS_BASE_URL ?? NEBIUS_DEFAULT_BASE_URL,
    apiKey: env.NEBIUS_API_KEY,
  });
  return cachedDirectClient;
}

/**
 * Resolve a TrustClaw model identifier to a concrete `LanguageModel` when we
 * need to bypass the default AI-Gateway string-model path.
 *
 * Returns `null` to mean "fall through to the Gateway string-model form" —
 * the caller will pass the model id through `toGatewayModelId()` instead.
 *
 * | Model              | Routing mode | Return value                  |
 * |--------------------|--------------|-------------------------------|
 * | `nebius/<id>`      | direct       | direct Nebius client model    |
 * | `nebius/<id>`      | gateway      | null → Gateway routes it      |
 * | anything else      | (any)        | null → Gateway routes it      |
 */
export function resolveModel(modelId: string): LanguageModel | null {
  if (!isNebiusModel(modelId)) return null;
  if (getNebiusRouting() === "gateway") return null;

  const upstreamId = modelId.slice(NEBIUS_MODEL_PREFIX.length);
  return getDirectClient().chatModel(upstreamId);
}
