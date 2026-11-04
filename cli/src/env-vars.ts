import { spinner } from "@clack/prompts";
import crypto from "crypto";
import type { askGlenSetup } from "./glen-setup.js";

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
  // null when glen was skipped or is already configured on the project.
  glen: Awaited<ReturnType<typeof askGlenSetup>>;
}

interface EnvVarSpec {
  key: string;
  value: string;
  target: ("production" | "preview" | "development")[];
  type: "encrypted" | "plain";
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

  if (args.glen !== null) {
    vars.push(
      {
        key: "GLEN_API_KEY",
        value: args.glen.apiKey,
        target: ["production", "preview", "development"],
        type: "encrypted",
      },
      {
        key: "GLEN_ORG_ID",
        value: args.glen.orgId,
        target: ["production", "preview", "development"],
        type: "plain",
      },
    );
  }

  if (vars.length === 0) return;

  const s = spinner();
  s.start("Setting environment variables");

  for (const spec of vars) {
    const url = args.teamId
      ? `https://api.vercel.com/v10/projects/${args.projectId}/env?teamId=${args.teamId}&upsert=true`
      : `https://api.vercel.com/v10/projects/${args.projectId}/env?upsert=true`;

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${args.token}`, "Content-Type": "application/json" },
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
