import { protectedProcedure } from "~/server/api/trpc";
import {
  isNebiusConfigured,
  getNebiusRouting,
} from "~/server/clients/nebius";
import { ANTHROPIC_MODELS, NEBIUS_MODELS, type ModelInfo } from "./models";

/**
 * Lists chat models available in this deployment.
 *
 * Anthropic always ships (routed through AI Gateway via Vercel OIDC).
 *
 * Nebius is surfaced when the self-hoster has set NEBIUS_ROUTING:
 *   - "direct"  requires NEBIUS_API_KEY (we hit Nebius's API ourselves).
 *   - "gateway" trusts the self-hoster has registered a Nebius credential
 *               in their Vercel AI Gateway project (we can't probe that
 *               from the runtime, so the env flag is the explicit opt-in).
 *
 * The routing mode is returned so the UI can show the right hint when
 * Nebius is disabled or explain which path is in use.
 */
export const getAvailableModels = protectedProcedure.query(() => {
  const nebiusEnabled = isNebiusConfigured();
  const nebiusRouting = nebiusEnabled ? getNebiusRouting() : null;

  const models: ModelInfo[] = [
    ...ANTHROPIC_MODELS,
    ...(nebiusEnabled ? NEBIUS_MODELS : []),
  ];

  return {
    nebiusEnabled,
    nebiusRouting,
    models,
  };
});
