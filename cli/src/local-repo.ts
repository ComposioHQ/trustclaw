import { execFile as _execFile } from "child_process";
import { promisify } from "util";
import { readFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { spinner, log, confirm, isCancel, cancel, text } from "@clack/prompts";

const execFile = promisify(_execFile);

// We embed the GitHub token in `https://x-access-token:${token}@github.com/...`
// URLs to authenticate clones and pushes. When a child_process call fails,
// Node's error includes the failed command + stdout/stderr, which can echo
// that URL — leaking the token to interactive terminals and CI logs. Scrub
// it from any error fields before re-throwing.
const CREDENTIAL_URL_PATTERN = /(https?:\/\/[^/@\s:]+:)[^@\s]+@/gi;

function redactCredentials(value: string): string {
  return value.replace(CREDENTIAL_URL_PATTERN, "$1<redacted>@");
}

function sanitizeChildProcessError(err: unknown): unknown {
  if (!(err instanceof Error)) return err;
  err.message = redactCredentials(err.message);
  const e = err as Error & {
    stdout?: string | Buffer;
    stderr?: string | Buffer;
    cmd?: string;
  };
  if (typeof e.stdout === "string") e.stdout = redactCredentials(e.stdout);
  if (typeof e.stderr === "string") e.stderr = redactCredentials(e.stderr);
  if (typeof e.cmd === "string") e.cmd = redactCredentials(e.cmd);
  return err;
}

// Run `git` with an explicit argv array — no shell, no string interpolation.
// This prevents shell-metachar injection through values like a branch name
// (e.g. `main;rm -rf ~`) that the previous `exec(\`git ... ${branch}\`)` form
// would have parsed and executed.
//
// On failure, any embedded credentials in error message/stdout/stderr are
// scrubbed before the error propagates.
async function runGit(
  args: string[],
  opts: { cwd?: string } = {},
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFile("git", args, opts);
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  } catch (err) {
    throw sanitizeChildProcessError(err);
  }
}

export interface LocalRepoInfo {
  rootDir: string;
  currentBranch: string;
  hasUncommittedChanges: boolean;
}

export async function detectLocalRepo(): Promise<LocalRepoInfo | null> {
  try {
    const { stdout: rootRaw } = await runGit(["rev-parse", "--show-toplevel"]);
    const rootDir = rootRaw.trim();
    if (!rootDir) return null;

    const pkgRaw = await readFile(join(rootDir, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgRaw) as { name?: string };
    if (pkg.name !== "trustclaw") return null;

    const { stdout: branchRaw } = await runGit(
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd: rootDir },
    );
    const currentBranch = branchRaw.trim();

    const { stdout: statusRaw } = await runGit(["status", "--porcelain"], {
      cwd: rootDir,
    });
    const hasUncommittedChanges = statusRaw.trim().length > 0;

    return { rootDir, currentBranch, hasUncommittedChanges };
  } catch {
    return null;
  }
}

interface PublishArgs {
  token: string;
  username: string;
  repoName: string;
  rootDir: string;
  currentBranch: string;
}

export async function publishLocalCopy(args: PublishArgs): Promise<{ repo: string }> {
  const { token, username, repoName, rootDir, currentBranch } = args;
  const targetRepo = `${username}/${repoName}`;
  const s = spinner();

  s.start(`Checking GitHub for ${targetRepo}`);
  const checkRes = await fetch(`https://api.github.com/repos/${targetRepo}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  const repoExists = checkRes.ok;

  let forceOverwrite = false;
  if (repoExists) {
    s.stop(`Repo already exists: ${targetRepo}`);
    const overwrite = await confirm({
      message: `Force-push local "${currentBranch}" over ${targetRepo}:main? (overwrites remote history)`,
      initialValue: false,
    });
    if (isCancel(overwrite) || !overwrite) {
      cancel("Cancelled.");
      throw new Error(
        `Pick a different repo name or delete ${targetRepo} on GitHub, then retry.`,
      );
    }
    forceOverwrite = true;
    s.start(`Force-pushing to ${targetRepo}`);
  } else {
    s.message(`Creating private GitHub repo ${targetRepo}`);
    const createRes = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: repoName,
        private: true,
        auto_init: false,
        description: "Self-hosted trustclaw deployment",
      }),
    });

    if (!createRes.ok) {
      const body = await createRes.text();
      s.stop("GitHub repo creation failed");
      throw new Error(`Failed to create repo: ${createRes.status} ${body}`);
    }
  }

  s.message(`Pushing local ${currentBranch} → ${targetRepo}:main`);
  const remoteUrl = `https://x-access-token:${token}@github.com/${targetRepo}.git`;
  // Use a temp remote name to avoid clobbering the user's existing remotes.
  const remoteName = `trustclaw-deploy-${Date.now()}`;

  try {
    await runGit(["remote", "add", remoteName, remoteUrl], { cwd: rootDir });
    const pushArgs = ["push"];
    if (forceOverwrite) pushArgs.push("--force");
    pushArgs.push(remoteName, `${currentBranch}:main`);
    await runGit(pushArgs, { cwd: rootDir });
  } finally {
    // Always clean up the temp remote, even on push failure.
    await runGit(["remote", "remove", remoteName], { cwd: rootDir }).catch(
      () => {},
    );
  }

  s.stop(`Pushed to ${targetRepo}`);
  return { repo: targetRepo };
}

/**
 * Clone a GitHub repo to a temp dir using token-based auth. Used by the fork
 * deploy path (`pnpm dlx @composio/trustclaw deploy` from a non-trustclaw
 * directory) so we have a local checkout to run prisma migrations against.
 *
 * Returns the absolute path to the clone.
 */
export async function cloneForkLocally(args: {
  repoSlug: string;
  token: string;
}): Promise<string> {
  const { repoSlug, token } = args;
  const targetDir = join(tmpdir(), `trustclaw-fork-${Date.now()}`);
  await mkdir(targetDir, { recursive: true });

  const s = spinner();
  s.start(`Cloning ${repoSlug} for migration step`);
  const cloneUrl = `https://x-access-token:${token}@github.com/${repoSlug}.git`;
  try {
    await runGit(["clone", "--depth", "1", cloneUrl, targetDir]);
    s.stop(`Cloned ${repoSlug} to ${targetDir}`);
  } catch (err) {
    s.stop(`Failed to clone ${repoSlug}`);
    throw new Error(
      `git clone failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return targetDir;
}

export async function confirmLocalPublish(
  info: LocalRepoInfo,
  defaultRepoName?: string,
): Promise<{
  repoName: string;
} | null> {
  log.info(
    `Detected local trustclaw checkout at ${info.rootDir} (branch: ${info.currentBranch})`,
  );

  if (info.hasUncommittedChanges) {
    log.warn(
      "You have uncommitted changes - only committed code will be pushed. " +
        "Commit first if you want them included.",
    );
    const proceed = await confirm({
      message: "Continue anyway?",
      initialValue: false,
    });
    if (isCancel(proceed) || !proceed) {
      cancel("Cancelled.");
      return null;
    }
  }

  // If we already have a cached repo name from a prior run, skip both the
  // "Publish?" confirm and the name prompt - the user clearly opted into the
  // publish flow before. Edit `.trustclaw-deploy.json` to change the repo
  // name, or delete it to get the prompts back.
  if (defaultRepoName) {
    log.info(`Using cached GitHub repo: ${defaultRepoName}`);
    return { repoName: defaultRepoName };
  }

  const usePublish = await confirm({
    message: "Publish this local copy to a new private GitHub repo and deploy that?",
    initialValue: true,
  });
  if (isCancel(usePublish)) {
    cancel("Cancelled.");
    return null;
  }
  if (!usePublish) {
    return null;
  }

  const repoName = await text({
    message: "GitHub repo name (will be created as private under your account)",
    initialValue: "trustclaw",
    validate: (v) =>
      v && /^[a-zA-Z0-9._-]+$/.test(v)
        ? undefined
        : "Letters, numbers, dots, dashes, underscores only",
  });
  if (isCancel(repoName)) {
    cancel("Cancelled.");
    return null;
  }

  return { repoName };
}
