import { text, confirm, isCancel, cancel, log } from "@clack/prompts";

export function ensure<T>(value: T | symbol): T {
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

interface RemainingInputsArgs {
  existingEnvKeys: Set<string>;
}

/**
 * The only remaining "remaining input" is whether to add Redis. Composio is
 * resolved automatically from the local Composio CLI; stores are provisioned
 * via `vercel integration add` without user prompts.
 */
export async function gatherRemainingInputs(
  args: RemainingInputsArgs,
): Promise<{ enableRedis: boolean }> {
  if (
    args.existingEnvKeys.has("REDIS_URL") ||
    args.existingEnvKeys.has("KV_URL")
  ) {
    log.info("Redis already connected to the project - reusing.");
    return { enableRedis: true };
  }
  const enableRedis = ensure(
    await confirm({
      message: "Add Upstash Redis for resumable streams? (recommended)",
      initialValue: true,
    }),
  );
  return { enableRedis };
}
