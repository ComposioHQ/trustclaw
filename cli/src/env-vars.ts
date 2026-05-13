import { spinner } from "@clack/prompts";
import crypto from "crypto";
import type { LlmProvider } from "./inputs.js";

interface SetEnvArgs {
  token: string;
  teamId: string | null;
  projectId: string;
  // null when the project already has COMPOSIO_API_KEY set and we're reusing it.
  composioApiKey: string | null;
  // true when BETTER_AUTH_SECRET is already on the project - skip generating a new one.
  hasBetterAuthSecret: boolean;
  // true when CRON_SECRET is already on the project - skip generating a new one.
  hasCronSecret: boolean;
  // Which LLM provider this deployment should route through. "vercel-ai-gateway"
  // is the default and requires no extra env; "openrouter" requires
  // openrouterApiKey unless one is already on the project.
  llmProvider: LlmProvider;
  // null when the project already has OPENROUTER_API_KEY set, or when
  // llmProvider is "vercel-ai-gateway".
  openrouterApiKey: string | null;
}

export interface EnvVarSpec {
  key: string;
  value: string;
  target: ("production" | "preview" | "development")[];
  type: "encrypted" | "plain";
}

export interface UpsertEnvVarsArgs {
  token: string;
  teamId: string | null;
  projectId: string;
  vars: EnvVarSpec[];
}

/**
 * Upsert (POST + upsert=true) a list of env vars on a Vercel project. Shared
 * by the deploy flow and the focused `set-openrouter-key` subcommand.
 */
export async function upsertEnvVars(args: UpsertEnvVarsArgs): Promise<void> {
  if (args.vars.length === 0) return;

  const s = spinner();
  s.start("Setting environment variables");

  for (const spec of args.vars) {
    const url = args.teamId
      ? `https://api.vercel.com/v10/projects/${args.projectId}/env?teamId=${args.teamId}&upsert=true`
      : `https://api.vercel.com/v10/projects/${args.projectId}/env?upsert=true`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(spec),
    });

    if (!res.ok) {
      const body = await res.text();
      s.stop(`Failed to set ${spec.key}`);
      throw new Error(`Failed to set ${spec.key}: ${res.status} ${body}`);
    }
  }

  s.stop("Environment variables set");
}

export async function setEnvVars(args: SetEnvArgs): Promise<void> {
  const vars: EnvVarSpec[] = [];

  if (!args.hasBetterAuthSecret) {
    vars.push({
      key: "BETTER_AUTH_SECRET",
      value: crypto.randomBytes(32).toString("base64"),
      target: ["production", "preview", "development"],
      type: "encrypted",
    });
  }

  if (!args.hasCronSecret) {
    vars.push({
      key: "CRON_SECRET",
      value: crypto.randomBytes(32).toString("base64url"),
      target: ["production", "preview", "development"],
      type: "encrypted",
    });
  }

  if (args.composioApiKey !== null) {
    vars.push({
      key: "COMPOSIO_API_KEY",
      value: args.composioApiKey,
      target: ["production", "preview", "development"],
      type: "encrypted",
    });
  }

  // LLM provider selection. We always write LLM_PROVIDER when openrouter is
  // chosen so the running app picks the right factory; we skip it for the
  // default to keep the project env clean (the app falls back to
  // vercel-ai-gateway when unset).
  if (args.llmProvider === "openrouter") {
    vars.push({
      key: "LLM_PROVIDER",
      value: "openrouter",
      target: ["production", "preview", "development"],
      type: "plain",
    });
    if (args.openrouterApiKey !== null) {
      vars.push({
        key: "OPENROUTER_API_KEY",
        value: args.openrouterApiKey,
        target: ["production", "preview", "development"],
        type: "encrypted",
      });
    }
  }

  await upsertEnvVars({
    token: args.token,
    teamId: args.teamId,
    projectId: args.projectId,
    vars,
  });
}
