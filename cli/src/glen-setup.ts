import { confirm, password, text, log, spinner } from "@clack/prompts";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { ensure } from "./inputs.js";

const GLEN_URL = "https://app.tryglen.com";

// The glen CLI keeps the active org in ~/.glen/state.json; use it to pre-fill the org ID.
async function readLocalGlenOrgId(): Promise<string | undefined> {
  try {
    const raw = await readFile(join(homedir(), ".glen", "state.json"), "utf8");
    return (JSON.parse(raw) as { activeOrgId?: string }).activeOrgId;
  } catch {
    return undefined;
  }
}

async function fetchGlenOrgName(config: {
  apiKey: string;
  orgId: string;
}): Promise<string | null> {
  const res = await fetch(`${GLEN_URL}/api/mcp/trpc/listOrgs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "x-glen-org-id": config.orgId,
    },
    body: JSON.stringify({ json: {} }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    result?: {
      data?: { json?: { orgs?: { name: string; active: boolean }[] } };
    };
  };
  const orgs = body.result?.data?.json?.orgs ?? [];
  return orgs.find((org) => org.active)?.name ?? null;
}

export async function askGlenSetup(args: { existingEnvKeys: Set<string> }) {
  if (
    args.existingEnvKeys.has("GLEN_API_KEY") &&
    args.existingEnvKeys.has("GLEN_ORG_ID")
  ) {
    log.info("Glen already connected to the project - reusing.");
    return null;
  }

  const enableGlen = ensure(
    await confirm({
      message:
        "Connect glen team memory? TrustClaw records conversations to your team's glen memory and can search it (recommended)",
      initialValue: true,
    }),
  );
  if (!enableGlen) return null;

  log.info(`Create a glen API key at ${GLEN_URL}/settings/api-keys`);
  const localOrgId = await readLocalGlenOrgId();

  for (;;) {
    const apiKey = ensure(
      await password({
        message: "Glen API key",
        validate: (v) =>
          v && v.trim() ? undefined : "Paste your glen API key",
      }),
    ).trim();
    const orgId = ensure(
      await text({
        message: "Glen organization ID",
        initialValue: localOrgId ?? "",
        validate: (v) =>
          v && v.trim() ? undefined : "Paste your glen organization ID",
      }),
    ).trim();

    const s = spinner();
    s.start("Checking glen credentials");
    const orgName = await fetchGlenOrgName({ apiKey, orgId }).catch(() => null);
    if (orgName) {
      s.stop(`Glen connected to ${orgName}`);
      return { apiKey, orgId };
    }
    s.stop("Couldn't connect to glen with that key and organization");

    const retry = ensure(
      await confirm({ message: "Try again?", initialValue: true }),
    );
    if (!retry) return null;
  }
}
