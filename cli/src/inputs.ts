import {
  text,
  confirm,
  isCancel,
  cancel,
  log,
  select,
  password,
} from "@clack/prompts";
import { resolveOpenRouterApiKey } from "./openrouter-auth.js";

function ensure<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Cancelled.");
    process.exit(0);
  }
  return value as T;
}

export async function askProjectName(defaultName?: string): Promise<string> {
  return ensure(
    await text({
      message: "Vercel project name",
      initialValue: defaultName ?? "trustclaw",
      validate: (v) =>
        v && /^[a-z0-9-]+$/.test(v)
          ? undefined
          : "Lowercase letters, numbers, and dashes only",
    }),
  );
}

export type LlmProvider = "vercel-ai-gateway" | "openrouter";

interface RemainingInputsArgs {
  existingEnvKeys: Set<string>;
}

export interface RemainingInputs {
  enableRedis: boolean;
  llmProvider: LlmProvider;
  // null when the project already has OPENROUTER_API_KEY set (reusing) or
  // when the user chose the Vercel AI Gateway path (no key needed).
  openrouterApiKey: string | null;
}

/**
 * Prompts for the inputs we can't infer automatically: Redis on/off and which
 * LLM provider to route through. Composio is resolved separately from the
 * local Composio CLI; stores are provisioned via `vercel integration add`.
 */
export async function gatherRemainingInputs(
  args: RemainingInputsArgs,
): Promise<RemainingInputs> {
  const enableRedis = await askEnableRedis(args.existingEnvKeys);
  const { llmProvider, openrouterApiKey } = await askLlmProvider(
    args.existingEnvKeys,
  );
  return { enableRedis, llmProvider, openrouterApiKey };
}

async function askEnableRedis(existingEnvKeys: Set<string>): Promise<boolean> {
  if (existingEnvKeys.has("REDIS_URL") || existingEnvKeys.has("KV_URL")) {
    log.info("Redis already connected to the project - reusing.");
    return true;
  }
  return ensure(
    await confirm({
      message: "Add Upstash Redis for resumable streams? (recommended)",
      initialValue: true,
    }),
  );
}

async function askLlmProvider(
  existingEnvKeys: Set<string>,
): Promise<{ llmProvider: LlmProvider; openrouterApiKey: string | null }> {
  // If OpenRouter is already configured, default to keeping it but let the
  // user rotate the key without re-running through the dashboard. Picking
  // a different provider effectively clears OpenRouter for new runs (we
  // still leave the old key on the project so existing deploys keep
  // working until they redeploy with the new LLM_PROVIDER value).
  const alreadyOnOpenRouter = existingEnvKeys.has("OPENROUTER_API_KEY");

  const llmProvider = ensure(
    await select<LlmProvider>({
      message: "Which LLM provider should this deployment use?",
      options: [
        {
          value: "vercel-ai-gateway",
          label: "Vercel AI Gateway (default, OIDC auth)",
        },
        {
          value: "openrouter",
          label: alreadyOnOpenRouter
            ? "OpenRouter (currently configured - choose to keep or rotate next)"
            : "OpenRouter (use your own OPENROUTER_API_KEY)",
        },
      ],
      initialValue: alreadyOnOpenRouter ? "openrouter" : "vercel-ai-gateway",
    }),
  );

  if (llmProvider !== "openrouter") {
    return { llmProvider, openrouterApiKey: null };
  }

  if (alreadyOnOpenRouter) {
    return resolveExistingOrRotate();
  }
  const openrouterApiKey = await resolveOpenRouterKey();
  return { llmProvider, openrouterApiKey };
}

/**
 * Rotate prompt for the "key is already on the project" case. Defaults
 * to keeping the existing key so a quick redeploy doesn't accidentally
 * mint a new credential.
 */
async function resolveExistingOrRotate(): Promise<{
  llmProvider: "openrouter";
  openrouterApiKey: string | null;
}> {
  const action = ensure(
    await select<"keep" | "browser" | "paste">({
      message: "OPENROUTER_API_KEY is already set on this project.",
      options: [
        { value: "keep", label: "Keep the existing key" },
        { value: "browser", label: "Rotate via browser login (PKCE)" },
        { value: "paste", label: "Rotate by pasting a new key" },
      ],
      initialValue: "keep",
    }),
  );

  if (action === "keep") {
    log.info("Reusing the existing OpenRouter key.");
    return { llmProvider: "openrouter", openrouterApiKey: null };
  }
  if (action === "browser") {
    const key = await resolveOpenRouterKeyViaBrowserOrPaste();
    return { llmProvider: "openrouter", openrouterApiKey: key };
  }
  const key = await promptPasteOpenRouterKey();
  return { llmProvider: "openrouter", openrouterApiKey: key };
}

/**
 * Acquire an OpenRouter API key. Defaults to the browser PKCE flow which
 * mints a scoped key without copy-paste; the user can opt for manual paste
 * (useful on headless boxes / SSH) or if the PKCE flow fails (no browser
 * available, network blocked, etc.) we fall back automatically.
 *
 * Exported so the standalone `set-openrouter-key` subcommand can reuse the
 * same prompt logic.
 */
export async function resolveOpenRouterKey(): Promise<string> {
  const useBrowser = ensure(
    await confirm({
      message:
        "Log in via browser to mint a scoped OpenRouter key? (No to paste manually)",
      initialValue: true,
    }),
  );

  if (useBrowser) {
    return resolveOpenRouterKeyViaBrowserOrPaste();
  }
  return promptPasteOpenRouterKey();
}

async function resolveOpenRouterKeyViaBrowserOrPaste(): Promise<string> {
  try {
    return await resolveOpenRouterApiKey();
  } catch (err) {
    log.warn(
      `Browser login failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    log.info("Falling back to manual key entry.");
    return promptPasteOpenRouterKey();
  }
}

async function promptPasteOpenRouterKey(): Promise<string> {
  return ensure(
    await password({
      message: "Paste your OpenRouter API key (https://openrouter.ai/keys)",
      validate: (v) =>
        v && v.startsWith("sk-or-")
          ? undefined
          : "OpenRouter keys start with sk-or-",
    }),
  );
}
