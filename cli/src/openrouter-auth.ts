import crypto from "crypto";
import http from "http";
import type { AddressInfo } from "net";
import { spinner, log } from "@clack/prompts";
import open from "open";

/**
 * OpenRouter OAuth-PKCE flow for the trustclaw deploy CLI.
 *
 * Mirrors the mission-control admin test page (`oauth-test/oauth-utils.ts` +
 * `oauth-test/callback/OAuthCallbackHandler.tsx`) but driven from a Node
 * process: we spin up a loopback server, open the browser, and exchange the
 * authorization code for a scoped API key once OpenRouter redirects back.
 *
 * @see https://openrouter.ai/docs/use-cases/oauth-pkce
 */

const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";
const OPENROUTER_EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";
const CALLBACK_PATH = "/callback";
const FLOW_TIMEOUT_MS = 5 * 60 * 1000;

interface ExchangeResponse {
  key: string;
  user_id?: string;
}

/**
 * Run the browser-based PKCE login. Returns the freshly-minted API key
 * (which starts with `sk-or-`). Throws on timeout, cancellation, browser
 * launch failure, or bad exchange.
 */
export async function resolveOpenRouterApiKey(): Promise<string> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateRandomState();

  const { server, port } = await startLoopbackServer();
  const callbackUrl = `http://localhost:${port}${CALLBACK_PATH}`;
  const authUrl = buildAuthUrl({ callbackUrl, codeChallenge, state });

  const codePromise = waitForCallback({ server, state });

  log.info("Opening browser to log in to OpenRouter...");
  log.info(`If it doesn't open, visit:\n${authUrl}`);
  // open() rejecting (e.g. no browser available) is non-fatal - the user can
  // still paste the URL manually. Any other error in the callback path will
  // surface through codePromise.
  await open(authUrl).catch(() => {
    log.warn("Could not auto-open the browser. Use the URL above.");
  });

  const s = spinner();
  s.start("Waiting for OpenRouter authorization");
  let code: string;
  try {
    code = await withTimeout(codePromise, FLOW_TIMEOUT_MS);
    s.stop("Authorization complete");
  } catch (err) {
    s.stop("Authorization failed");
    server.close();
    throw err;
  }

  const exchange = spinner();
  exchange.start("Exchanging code for an API key");
  let apiKey: string;
  try {
    apiKey = await exchangeCodeForKey({ code, codeVerifier });
    exchange.stop("API key issued");
  } catch (err) {
    exchange.stop("Exchange failed");
    throw err;
  }

  return apiKey;
}

interface BuildAuthUrlArgs {
  callbackUrl: string;
  codeChallenge: string;
  state: string;
}

function buildAuthUrl({
  callbackUrl,
  codeChallenge,
  state,
}: BuildAuthUrlArgs): string {
  const url = new URL(OPENROUTER_AUTH_URL);
  url.searchParams.set("callback_url", callbackUrl);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return url.toString();
}

async function startLoopbackServer(): Promise<{
  server: http.Server;
  port: number;
}> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    // Listen on a random ephemeral port so re-running the CLI doesn't
    // collide with anything (or with a previous aborted run).
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo | null;
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to bind loopback server"));
        return;
      }
      resolve({ server, port: addr.port });
    });
  });
}

interface WaitForCallbackArgs {
  server: http.Server;
  state: string;
}

/**
 * Resolves with the `code` query param once OpenRouter redirects back to
 * the loopback server. Validates `state` (CSRF) and renders a small HTML
 * page so the user knows they can close the tab. Always closes the server.
 */
async function waitForCallback({
  server,
  state,
}: WaitForCallbackArgs): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    server.on("request", (req, res) => {
      // Ignore favicon and other browser noise so the user doesn't see
      // a flash of "callback received" before they've actually approved.
      if (!req.url || !req.url.startsWith(CALLBACK_PATH)) {
        res.writeHead(404).end();
        return;
      }

      const requestUrl = new URL(req.url, "http://localhost");
      const code = requestUrl.searchParams.get("code");
      const receivedState = requestUrl.searchParams.get("state");

      if (receivedState !== state) {
        respondHtml(
          res,
          400,
          "State mismatch",
          "The OAuth callback state didn't match. Close this tab and try again.",
        );
        server.close();
        reject(new Error("OAuth state mismatch (possible CSRF)"));
        return;
      }

      if (!code) {
        respondHtml(
          res,
          400,
          "No authorization code",
          "OpenRouter didn't return a code. You can close this tab and try again.",
        );
        server.close();
        reject(new Error("OpenRouter did not return an authorization code"));
        return;
      }

      respondHtml(
        res,
        200,
        "Authorized - you can close this tab",
        "TrustClaw received your OpenRouter authorization. Return to the terminal to finish deploying.",
      );
      server.close();
      resolve(code);
    });
  });
}

interface ExchangeCodeArgs {
  code: string;
  codeVerifier: string;
}

async function exchangeCodeForKey({
  code,
  codeVerifier,
}: ExchangeCodeArgs): Promise<string> {
  const res = await fetch(OPENROUTER_EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
      code_challenge_method: "S256",
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `OpenRouter exchange failed (${res.status}): ${detail.slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as ExchangeResponse;
  if (!json.key || typeof json.key !== "string") {
    throw new Error("OpenRouter exchange returned no key");
  }
  if (!json.key.startsWith("sk-or-")) {
    throw new Error(
      "OpenRouter returned an API key in an unexpected format (expected sk-or-...)",
    );
  }
  return json.key;
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = "OpenRouter authorization timed out",
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function generateRandomState(): string {
  return crypto.randomBytes(16).toString("base64url");
}

function respondHtml(
  res: http.ServerResponse,
  status: number,
  title: string,
  body: string,
): void {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 480px; margin: 80px auto; padding: 0 24px; color: #1c1c1c; }
      h1 { font-size: 18px; margin: 0 0 8px; }
      p { color: #555; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(body)}</p>
  </body>
</html>`;
  res
    .writeHead(status, { "Content-Type": "text/html; charset=utf-8" })
    .end(html);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
