import { confirm, log } from "@clack/prompts";
import { ensure } from "./inputs.js";

export async function askGlenEnabled(args: { existingEnvKeys: Set<string> }) {
  if (args.existingEnvKeys.has("GLEN_ENABLED")) {
    log.info("GLEN_ENABLED already set on the project - reusing.");
    return null;
  }

  return ensure(
    await confirm({
      message:
        "Enable glen team memory? Each user connects their own glen account during onboarding (recommended)",
      initialValue: true,
    }),
  );
}
