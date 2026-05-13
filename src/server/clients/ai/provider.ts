import type { LanguageModel } from "ai";
import {
  createOpenRouter,
  type OpenRouterProvider,
} from "@openrouter/ai-sdk-provider";
import { env } from "~/env";
import { toGatewayModelId, toOpenRouterModelId } from "./model-mapping";

export const LLM_PROVIDERS = {
  vercelAiGateway: "vercel-ai-gateway",
  openrouter: "openrouter",
} as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[keyof typeof LLM_PROVIDERS];

let cachedOpenRouter: OpenRouterProvider | null = null;

/**
 * Lazy-cached OpenRouter provider instance. Exported so the embedding
 * factory in `./embedding.ts` can reuse the same authenticated client
 * without re-reading the env or creating duplicate connections.
 */
export function getOpenRouterProvider(): OpenRouterProvider {
  if (!cachedOpenRouter) {
    if (!env.OPENROUTER_API_KEY) {
      // env.ts already guards against this at boot when LLM_PROVIDER is
      // openrouter, but the type is `string | undefined` so we re-check.
      throw new Error(
        "OPENROUTER_API_KEY must be set when LLM_PROVIDER=openrouter.",
      );
    }
    cachedOpenRouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
  }
  return cachedOpenRouter;
}

/**
 * Resolve a canonical model id (as stored in the DB) into an `ai` SDK
 * LanguageModel for the currently-configured provider.
 *
 * Vercel AI Gateway accepts a bare string like `anthropic/<model>` so we
 * return it as-is; OpenRouter requires a `LanguageModelV3` instance.
 * Callers can pass the result directly to `ToolLoopAgent`, `generateText`,
 * `streamText`, etc.
 */
export function getLanguageModel(canonicalModelId: string): LanguageModel {
  if (env.LLM_PROVIDER === LLM_PROVIDERS.openrouter) {
    return getOpenRouterProvider().chat(toOpenRouterModelId(canonicalModelId));
  }
  return toGatewayModelId(canonicalModelId);
}
