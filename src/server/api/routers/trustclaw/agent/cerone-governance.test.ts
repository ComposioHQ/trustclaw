import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const originalApiKey = process.env.CERONE_API_KEY;

let importCount = 0;
let warnings: string[] = [];

async function loadGovernance() {
  importCount += 1;
  return import(
    new URL(
      `./cerone-governance.ts?case=${importCount}`,
      import.meta.url,
    ).href,
  );
}

beforeEach(() => {
  warnings = [];
  console.warn = ((...args: Parameters<typeof console.warn>) => {
    warnings.push(args.map(String).join(" "));
  }) as typeof console.warn;
});

afterEach(() => {
  console.warn = originalWarn;
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) {
    delete process.env.CERONE_API_KEY;
  } else {
    process.env.CERONE_API_KEY = originalApiKey;
  }
});

test("approved action passes through", async () => {
  process.env.CERONE_API_KEY = "test-key";
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        result: "approved",
        trust_score: 0.98,
        reason: null,
      }),
    )) as typeof fetch;

  const { validateAction } = await loadGovernance();
  const result = await validateAction("agent-1", "gmail_send", { draft: true });

  assert.equal(result.result, "approved");
  assert.equal(result.approved, true);
  assert.equal(result.trust_score, 0.98);
  assert.deepEqual(warnings, []);
});

test("rejected action throws GovernanceError", async () => {
  process.env.CERONE_API_KEY = "test-key";
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        result: "rejected",
        trust_score: 0.12,
        reason: "Policy blocked this action",
      }),
    )) as typeof fetch;

  const { GovernanceError, validateAction } = await loadGovernance();

  await assert.rejects(
    validateAction("agent-1", "github_delete_repo", {}),
    (error: unknown) =>
      error instanceof Error &&
      error instanceof GovernanceError &&
      error.message === "Policy blocked this action",
  );
});

test("missing API key degrades gracefully", async () => {
  delete process.env.CERONE_API_KEY;
  globalThis.fetch = (async () => {
    throw new Error("fetch should not be called without configuration");
  }) as typeof fetch;

  const { validateAction } = await loadGovernance();

  const first = await validateAction("agent-1", "slack_send_message", {});
  const second = await validateAction("agent-1", "slack_send_message", {});

  assert.equal(first.approved, true);
  assert.equal(second.approved, true);
  assert.deepEqual(warnings, ["Cerone governance not configured"]);
});

test("flagged action logs warning but continues", async () => {
  process.env.CERONE_API_KEY = "test-key";
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        result: "flagged",
        trust_score: 0.61,
        reason: "Potentially sensitive destination",
      }),
    )) as typeof fetch;

  const { validateAction } = await loadGovernance();
  const result = await validateAction("agent-1", "gmail_send", {
    to: "x@y.com",
  });

  assert.equal(result.result, "flagged");
  assert.equal(result.approved, true);
  assert.match(warnings[0] ?? "", /\[cerone\] flagged gmail_send/);
});

test("API timeout fails open", async () => {
  process.env.CERONE_API_KEY = "test-key";
  globalThis.fetch = (async (_input, init) => {
    await new Promise<never>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new Error("timeout")),
      );
    });
    throw new Error("unreachable");
  }) as typeof fetch;

  const { validateAction } = await loadGovernance();
  const result = await validateAction("agent-1", "notion_create_page", {});

  assert.equal(result.approved, true);
  assert.equal(result.result, "approved");
  assert.match(warnings[0] ?? "", /allowing execution/);
});
