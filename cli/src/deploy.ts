import { intro, outro, note, cancel } from "@clack/prompts";
import open from "open";
import { detectAuth } from "./auth.js";
import { warnIfOutdated } from "./version-check.js";
import { askProjectName, gatherRemainingInputs } from "./inputs.js";
import { resolveComposioApiKey, isValidComposioKey } from "./composio-auth.js";
import { forkRepo } from "./github.js";
import {
  detectLocalRepo,
  confirmLocalPublish,
  publishLocalCopy,
  cloneForkLocally,
} from "./local-repo.js";
import { applyPlanConfig } from "./cron-config.js";
import { createVercelProject, disableDeploymentProtection } from "./vercel.js";
import { provisionStores } from "./stores.js";
import { setEnvVars } from "./env-vars.js";
import { runMigration } from "./migrate.js";
import { triggerProductionDeploy } from "./trigger-deploy.js";
import { maybeSetupTelegram } from "./telegram-setup.js";
import {
  fetchProjectEnvValue,
  getProductionAlias,
  listProjectEnvKeys,
  lookupExistingProject,
} from "./vercel-env.js";
import { loadConfig, saveConfig } from "./config.js";

export async function deploy(): Promise<void> {
  console.clear();
  intro("trustclaw deploy");

  try {
    await warnIfOutdated();
    const auth = await detectAuth();

    // Detect local checkout up front so we can read cached defaults from
    // .trustclaw-deploy.json (project name, repo name) and pre-fill prompts.
    const localRepo = await detectLocalRepo();
    const cachedConfig = localRepo ? await loadConfig(localRepo.rootDir) : {};

    const projectName = await askProjectName(cachedConfig.vercelProjectName);

    // Pre-flight: if the project already exists, fetch its env keys so we can
    // skip prompts (Composio key, Redis question, Telegram setup) for anything
    // that's already been configured on a prior run.
    const existingProject = await lookupExistingProject({
      token: auth.vercelToken,
      teamId: auth.vercelTeamId,
      projectName,
    });
    const existingEnvKeys = existingProject
      ? await listProjectEnvKeys({
          token: auth.vercelToken,
          teamId: auth.vercelTeamId,
          projectId: existingProject.id,
        })
      : new Set<string>();

    // Resolve the Composio API key. If a valid one is already on the project,
    // reuse it; otherwise pull from the local Composio CLI (running
    // `composio login` interactively if not authenticated).
    let composioApiKey: string | null = null;
    if (existingProject && existingEnvKeys.has("COMPOSIO_API_KEY")) {
      const existing = await fetchProjectEnvValue(
        {
          token: auth.vercelToken,
          teamId: auth.vercelTeamId,
          projectId: existingProject.id,
        },
        "COMPOSIO_API_KEY",
      );
      if (!isValidComposioKey(existing)) {
        composioApiKey = await resolveComposioApiKey();
      }
    } else {
      composioApiKey = await resolveComposioApiKey();
    }

    const remaining = await gatherRemainingInputs({ existingEnvKeys });

    let repo: string;
    // Path to a directory with a working prisma/schema.prisma. In local mode
    // it's the user's checkout; in fork mode we clone the fork into a temp
    // dir so prisma db push has a place to run.
    let migrationRepoRoot: string | undefined;
    if (localRepo) {
      const choice = await confirmLocalPublish(
        localRepo,
        cachedConfig.githubRepoName,
      );
      if (choice) {
        await applyPlanConfig(localRepo.rootDir, auth.vercelBillingPlan);
        ({ repo } = await publishLocalCopy({
          token: auth.githubToken,
          username: auth.githubUsername,
          repoName: choice.repoName,
          rootDir: localRepo.rootDir,
          currentBranch: localRepo.currentBranch,
        }));
        await saveConfig(localRepo.rootDir, {
          githubRepoName: choice.repoName,
        });
        migrationRepoRoot = localRepo.rootDir;
      } else {
        ({ repo } = await forkRepo(auth.githubToken, auth.githubUsername));
        migrationRepoRoot = await cloneForkLocally({
          repoSlug: repo,
          token: auth.githubToken,
        });
      }
    } else {
      ({ repo } = await forkRepo(auth.githubToken, auth.githubUsername));
      migrationRepoRoot = await cloneForkLocally({
        repoSlug: repo,
        token: auth.githubToken,
      });
    }

    const project = await createVercelProject({
      token: auth.vercelToken,
      teamId: auth.vercelTeamId,
      projectName,
      githubRepoSlug: repo,
      githubToken: auth.githubToken,
    });

    // Project created/reused successfully - cache the name so future runs
    // skip the prompt.
    if (localRepo) {
      await saveConfig(localRepo.rootDir, { vercelProjectName: project.name });
    }

    // Vercel enables SSO on new projects by default ("all_except_custom_domains"),
    // which makes external webhooks (Telegram, etc.) hit a login wall. Turn it off.
    await disableDeploymentProtection({
      token: auth.vercelToken,
      teamId: auth.vercelTeamId,
      projectId: project.id,
    });

    const stores = await provisionStores({
      token: auth.vercelToken,
      teamId: auth.vercelTeamId,
      projectId: project.id,
      projectName: project.name,
      ownerSlug: auth.vercelOwnerSlug,
      enableRedis: remaining.enableRedis,
    });

    await setEnvVars({
      token: auth.vercelToken,
      teamId: auth.vercelTeamId,
      projectId: project.id,
      composioApiKey,
      hasBetterAuthSecret: existingEnvKeys.has("BETTER_AUTH_SECRET"),
      hasCronSecret: existingEnvKeys.has("CRON_SECRET"),
      llmProvider: remaining.llmProvider,
      openrouterApiKey: remaining.openrouterApiKey,
    });

    await runMigration({
      databaseUrl: stores.databaseUrl,
      repoRoot: migrationRepoRoot,
    });

    const result = await triggerProductionDeploy({
      token: auth.vercelToken,
      teamId: auth.vercelTeamId,
      projectId: project.id,
      githubRepoSlug: repo,
    });

    // Print outside the clack box so the URL doesn't wrap across lines and
    // stays copy-friendly.
    const deploymentUrl = `https://${result.url}`;
    console.log(`\n  Deployment URL: ${deploymentUrl}\n`);
    await open(deploymentUrl).catch(() => {});

    // Use the stable production alias (e.g. trustclaw-test.vercel.app) for the
    // Telegram webhook so it survives across redeploys. The per-deployment URL
    // returned by triggerProductionDeploy changes on every push.
    const stableUrl = await getProductionAlias({
      token: auth.vercelToken,
      teamId: auth.vercelTeamId,
      projectId: project.id,
      projectName: project.name,
    });

    await maybeSetupTelegram({
      vercelToken: auth.vercelToken,
      vercelTeamId: auth.vercelTeamId,
      projectId: project.id,
      deploymentUrl: stableUrl,
      githubRepoSlug: repo,
      existingEnvKeys,
    });

    note(
      "Cron jobs are pre-configured in vercel.json and will run automatically once deploy completes.\n" +
        "View them in your Vercel dashboard under the project's Cron Jobs tab.",
      "Cron",
    );

    outro("Visit the deployment URL above to register your first user.");
  } catch (err) {
    cancel(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
