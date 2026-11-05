import { spinner } from "@clack/prompts";
import crypto from "crypto";

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
  // null when GLEN_ENABLED is already set on the project.
  glenEnabled: boolean | null;
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

  if (args.glenEnabled !== null) {
    vars.push({
      key: "GLEN_ENABLED",
      value: String(args.glenEnabled),
      target: ["production", "preview", "development"],
      type: "plain",
    });
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
