import { intro, outro, cancel, log } from "@clack/prompts";
import { detectAuth } from "./auth.js";
import { askProjectName, resolveOpenRouterKey } from "./inputs.js";
import { detectLocalRepo } from "./local-repo.js";
import { loadConfig } from "./config.js";
import { lookupExistingProject, listProjectEnvKeys } from "./vercel-env.js";
import { upsertEnvVars } from "./env-vars.js";

/**
 * Standalone `trustclaw set-openrouter-key` subcommand.
 *
 * Rotates the OpenRouter API key on an existing Vercel project without
 * re-running the full deploy flow. Useful when a key leaks, when switching
 * to a different OpenRouter account, or when the original key was revoked.
 *
 * Also writes LLM_PROVIDER=openrouter if it wasn't set yet, so this doubles
 * as the "switch a Gateway-deployed project to OpenRouter after the fact"
 * command.
 */
export async function setOpenrouterKey(): Promise<void> {
  console.clear();
  intro("trustclaw set-openrouter-key");

  try {
    const auth = await detectAuth();

    const localRepo = await detectLocalRepo();
    const cachedConfig = localRepo ? await loadConfig(localRepo.rootDir) : {};

    const projectName = await askProjectName(cachedConfig.vercelProjectName);

    const project = await lookupExistingProject({
      token: auth.vercelToken,
      teamId: auth.vercelTeamId,
      projectName,
    });
    if (!project) {
      cancel(
        `No Vercel project named "${projectName}" found. Run \`trustclaw deploy\` first or pick a different project.`,
      );
      process.exit(1);
    }

    const existingEnvKeys = await listProjectEnvKeys({
      token: auth.vercelToken,
      teamId: auth.vercelTeamId,
      projectId: project.id,
    });

    if (existingEnvKeys.has("OPENROUTER_API_KEY")) {
      log.info("Project already has OPENROUTER_API_KEY - it will be replaced.");
    } else {
      log.info(
        "Project has no OPENROUTER_API_KEY yet - this command will set both LLM_PROVIDER and OPENROUTER_API_KEY.",
      );
    }

    const newKey = await resolveOpenRouterKey();

    await upsertEnvVars({
      token: auth.vercelToken,
      teamId: auth.vercelTeamId,
      projectId: project.id,
      vars: [
        // Always (re)write LLM_PROVIDER so a project that was on the Gateway
        // gets switched in the same call.
        {
          key: "LLM_PROVIDER",
          value: "openrouter",
          target: ["production", "preview", "development"],
          type: "plain",
        },
        {
          key: "OPENROUTER_API_KEY",
          value: newKey,
          target: ["production", "preview", "development"],
          type: "encrypted",
        },
      ],
    });

    log.info(
      "Key updated. Redeploy the project (Vercel will auto-redeploy on next push, or run `vercel --prod`) for the new key to take effect.",
    );
    outro("Done.");
  } catch (err) {
    cancel(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
