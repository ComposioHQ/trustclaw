import type { EmbeddingModel } from "ai";
import { env } from "~/env";
import { getOpenRouterProvider, LLM_PROVIDERS } from "./provider";

/**
 * Canonical embedding model id used by both providers. OpenRouter and the
 * Vercel AI Gateway both proxy this same OpenAI model, so the 1024-dim
 * vectors in pgvector remain compatible when switching providers - no
 * re-embedding required.
 */
const OPENAI_EMBED_MODEL_ID = "openai/text-embedding-3-large";

/**
 * Resolve the active embedding model. Returns a bare string for the Vercel
 * AI Gateway path (preserves existing behaviour) and a fully-constructed
 * EmbeddingModelV3 for OpenRouter.
 */
export function getEmbeddingModel(): EmbeddingModel {
  if (env.LLM_PROVIDER === LLM_PROVIDERS.openrouter) {
    return getOpenRouterProvider().textEmbeddingModel(OPENAI_EMBED_MODEL_ID);
  }
  return OPENAI_EMBED_MODEL_ID;
}
