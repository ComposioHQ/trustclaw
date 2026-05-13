import { exec as _exec, type ExecException } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { join } from "path";
import { spinner, log, confirm, isCancel, cancel } from "@clack/prompts";

const exec = promisify(_exec);

type ExecRunner = (
  cmd: string,
  opts: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr: string }>;

// Prisma emits this phrase whenever a push refuses to proceed because it
// detected a destructive change (column drop, type change with unsafe cast,
// required column on a table with rows, etc.). Detecting it lets us surface
// the diff to the operator instead of silently accepting data loss.
const DATA_LOSS_MARKERS = [
  "We found changes that cannot be executed",
  "--accept-data-loss",
  "data loss",
];

function looksLikeDataLossFailure(output: string): boolean {
  return DATA_LOSS_MARKERS.some((m) => output.includes(m));
}

async function findRepoRoot(): Promise<string> {
  // Prefer git for accuracy; fall back to walking up from cwd looking for prisma/schema.prisma.
  try {
    const { stdout } = await exec("git rev-parse --show-toplevel");
    const root = stdout.trim();
    if (root && existsSync(join(root, "prisma", "schema.prisma"))) return root;
  } catch {
    // not in a git repo, or git not installed
  }

  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "prisma", "schema.prisma"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    "Could not locate prisma/schema.prisma. Run this from inside your trustclaw clone.",
  );
}

interface RunMigrationArgs {
  databaseUrl: string;
  /**
   * Absolute path to a directory containing `prisma/schema.prisma`. Required
   * when the CLI is running outside any local trustclaw clone (the fork
   * deploy path) — pass the path returned by `cloneForkLocally`. If omitted,
   * we'll search for the schema in/around `process.cwd()`.
   */
  repoRoot?: string;
  /**
   * Testing hook — replace the child_process exec used to invoke npm/prisma.
   * Production callers should not set this.
   */
  _runner?: ExecRunner;
  /**
   * Testing hook — replace the interactive confirmation prompt that gates
   * destructive migrations. Production callers should not set this.
   */
  _confirmDestructive?: () => Promise<boolean>;
}

export async function runMigration(args: RunMigrationArgs): Promise<void> {
  const runner = args._runner ?? exec;
  const confirmDestructive =
    args._confirmDestructive ?? defaultConfirmDestructive;

  const s = spinner();
  s.start("Running database migration (prisma db push)");

  try {
    const repoRoot = args.repoRoot ?? (await findRepoRoot());
    if (!existsSync(join(repoRoot, "prisma", "schema.prisma"))) {
      throw new Error(
        `prisma/schema.prisma not found at ${repoRoot}. The provided repoRoot is wrong.`,
      );
    }
    const childEnv = { ...process.env, DATABASE_URL: args.databaseUrl };
    // The repo's prisma.config.ts does `import "dotenv/config"`. In the
    // fork-deploy path the cloned dir has no node_modules, so prisma fails
    // to load the config with "Cannot find module 'dotenv/config'". Install
    // dotenv first (--no-save keeps the lockfile clean), then run prisma.
    // Use `npx -y` so prisma itself doesn't need a global install.
    await runner("npm install --no-save --silent --no-audit --no-fund dotenv", {
      cwd: repoRoot,
      env: childEnv,
    });

    // First attempt: safe push (no --accept-data-loss). Succeeds for the
    // common case (fresh database, additive schema changes). If Prisma
    // rejects because it detected a destructive change, we'll surface the
    // diff and require explicit operator confirmation before retrying.
    try {
      await runner("npx -y prisma@^7.3.0 db push", {
        cwd: repoRoot,
        env: childEnv,
      });
      s.stop("Schema applied");
      return;
    } catch (err) {
      const output = errorOutput(err);
      if (!looksLikeDataLossFailure(output)) {
        throw err; // Genuine failure (auth, network, syntax error, etc.)
      }
      s.stop("Migration would cause data loss");
      log.warn(
        "Prisma detected schema changes that would destroy data:\n\n" + output,
      );
    }

    const proceed = await confirmDestructive();
    if (!proceed) {
      cancel("Migration cancelled — no destructive changes applied.");
      throw new Error(
        "Destructive migration declined by operator. Adjust the Prisma schema or restore the previous version before redeploying.",
      );
    }

    s.start("Re-running migration with --accept-data-loss");
    await runner("npx -y prisma@^7.3.0 db push --accept-data-loss", {
      cwd: repoRoot,
      env: childEnv,
    });
    s.stop("Schema applied (with operator-approved data loss)");
  } catch (err) {
    s.stop("Migration failed");
    throw err;
  }
}

async function defaultConfirmDestructive(): Promise<boolean> {
  const answer = await confirm({
    message:
      "Proceed with destructive migration? Existing data in the affected columns/tables will be lost.",
    initialValue: false,
  });
  if (isCancel(answer)) return false;
  return Boolean(answer);
}

function errorOutput(err: unknown): string {
  // Node's child_process error has stdout/stderr attached. Combine them
  // because Prisma prints the human-readable failure on stderr but the
  // attempted-step list on stdout.
  const e = err as ExecException & { stdout?: string; stderr?: string };
  return [e.stderr ?? "", e.stdout ?? "", e.message ?? ""].join("\n").trim();
}
