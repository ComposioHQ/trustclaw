# TrustClaw

**Your AI that does things while you sleep. _Securely._**

A 24/7 personal AI assistant with 1000+ tools via **OAuth** and **sandboxed execution**. Built on the ideas behind OpenClaw, rebuilt from scratch for security. Talks to you on the web or Telegram, remembers what matters, and handles recurring work on autopilot.

> 🚀 **Self-host on Vercel** - one command, ~2 minutes. See below.

[Demo Video](https://x.com/sarahfim/status/2022518658048888916)
[Open Source Launch Video](https://x.com/sarahfim/status/2053989393036145121)


---

## ⚡ Deploy your own in seconds


Click here to use the Vercel Template:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FComposioHQ%2Ftrustclaw&project-name=trustclaw&repository-name=trustclaw&env=BETTER_AUTH_SECRET,COMPOSIO_API_KEY,CRON_SECRET&envDescription=Generate%20BETTER_AUTH_SECRET%20and%20CRON_SECRET%20with%3A%20openssl%20rand%20-base64%2032.%20Get%20a%20free%20COMPOSIO_API_KEY%20at%20https%3A%2F%2Fdashboard.composio.dev%2Flogin%3Fflow%3Ddeveloper&envLink=https%3A%2F%2Fgithub.com%2FComposioHQ%2Ftrustclaw%23environment-variables&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%2C%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22upstash%22%2C%22productSlug%22%3A%22upstash-kv%22%2C%22protocol%22%3A%22storage%22%7D%5D&skippable-integrations=1)


### Or use the CLI

```bash
npx @composio/trustclaw deploy
```

That's it. The CLI handles the entire flow.

**Prerequisites:**

- A [Vercel account](https://vercel.com) (`npx vercel login` once)
- A [GitHub account](https://github.com) (`gh auth login` once)
- A free [Composio API key](https://dashboard.composio.dev/login?next=%2F~%2Fproject%2Fsettings%2Fapi-keys&flow=developer) (install the cli `curl -fsSL https://composio.dev/install | bash`)

LLM and embedding calls route through Vercel AI Gateway - **no Anthropic or OpenAI API keys required.**

---

## ✨ Why TrustClaw

| | |
|---|---|
| 🔐 **OAuth Only** | Connects through OAuth. No passwords stored or shared. |
| ⚡ **Zero Setup** | Sign up, chat, done. No API keys or config files. |
| 💤 **Works While You Sleep** | Schedule tasks and let your agent handle them on autopilot. |
| ☁️ **Sandboxed Execution** | Every action runs in an isolated cloud environment that's gone when the task is done. |

### What it can do

- Chat with Claude in a Next.js dashboard or via a Telegram bot
- Long-term memory backed by Postgres + pgvector
- 3-layer context management (pruning, memory flush, summarization compaction) so conversations can run indefinitely
- 1000+ Composio tool integrations (Gmail, GitHub, Slack, Notion, Linear, Calendar, Drive, Stripe, HubSpot, …) gated by the user's connected accounts
- Cron-scheduled agent runs for recurring tasks
- Username/password login via Better Auth
- Computer use via [opendesk](https://github.com/vitalops/opendesk) — screenshot, mouse, keyboard, OCR, and more (self-hosted only, opt-in)

---

## 🛡 Security model

TrustClaw is a deliberate response to the security problems with running AI agents locally:

| | TrustClaw | Vanilla local agents |
|---|---|---|
| **Setup** | Seconds | Hours of config |
| **Credentials** | Encrypted, managed by Composio | Plaintext in local config |
| **Code Execution** | Remote sandbox | On your local machine |
| **Integrations** | OAuth, 1000+ apps | Manual API key setup per app |
| **Skill Security** | Managed tool surface | Unvetted public registry |
| **Audit Trails** | Full action log | None |
| **Revocation** | One click | Find and delete config files |

The design choices:

- **No raw API keys handed to the agent** - Composio brokers OAuth for every tool
- **No code runs on your machine** - every tool call executes in an isolated remote environment
- **No long-lived shell access** - destructive prompt injection from a scraped email can't `rm -rf` your laptop because the agent doesn't have a shell on your laptop

---

## 🏗 Architecture

```
┌──────────────┐    ┌──────────────────────────────────────────┐
│  Web (Next)  │───▶│             Next.js App                  │
│   Telegram   │───▶│  ┌────────────────────────────────────┐  │
│     Cron     │───▶│  │  tRPC API + agent runtime          │  │
└──────────────┘    │  │  (prepareAgentRun → ToolLoopAgent) │  │
                    │  └─────────┬──────────────────────────┘  │
                    │            │                              │
                    │   ┌────────┼─────────┬──────────┐        │
                    │   ▼        ▼         ▼          ▼        │
                    │ Postgres  Redis  AI Gateway  Composio    │
                    │ (pgvector)      (LLM + emb.)             │
                    └──────────────────────────────────────────┘
```

### Tech stack

- [Next.js 15](https://nextjs.org) (App Router) + React 19
- [tRPC](https://trpc.io) for all backend logic
- [Better Auth](https://www.better-auth.com/) (username/password)
- [Prisma](https://prisma.io) + Postgres + [pgvector](https://github.com/pgvector/pgvector)
- [Vercel AI SDK](https://sdk.vercel.ai) + AI Gateway (LLM + embeddings)
- [Composio SDK](https://composio.dev) for tool integrations
- [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- Redis (resumable streams, optional)

---

## ⚠️ Before deploying to production

### Heads-up about the Vercel free (Hobby) plan

TrustClaw runs fine on the free Hobby plan, but Vercel applies two limits that affect the agent:

- **Cron jobs can only run once per day**, and even then they fire anywhere within a 60-minute window of the scheduled hour. Any cron expression more frequent than daily (e.g. hourly, every-30-min) **fails at deploy time** on Hobby. The CLI auto-adjusts `vercel.json` to a daily schedule when it detects you're on Hobby.
- **Functions are capped at 300s (5 min)** — long-running agent turns may time out.

To get **per-minute cron precision** and **up to 800s (~13 min) per function**, upgrade to [Vercel Pro](https://vercel.com/pricing) and re-run the CLI (or manually flip `vercel.json` back to `* * * * *` + bump `maxDuration`).

### No rate-limiting or billing out of the box

TrustClaw ships **without** rate limiting, per-user usage caps, or billing logic. If you put a TrustClaw instance on the public internet for strangers to sign up to, **any user can drain your Composio + AI Gateway credits indefinitely**. Before opening signups to anyone but yourself / a trusted handful of people, add at least:

- A rate limiter on the chat + cron endpoints (e.g. [Upstash Rate Limit](https://upstash.com/docs/oss/sdks/ts/ratelimit/overview), [Vercel WAF Rate Limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting))
- A monthly per-user message / tool-call cap enforced server-side
- Billing or invite-only signup if you want to recoup costs

---

## 🧰 Manual setup (local dev)

If you'd rather skip the deploy CLI and run TrustClaw locally:

```bash
pnpm install
cp .env.example .env       # fill in DATABASE_URL, BETTER_AUTH_SECRET, COMPOSIO_API_KEY
pnpm prisma db push        # apply schema (Postgres + pgvector required)
pnpm dev                   # http://localhost:3000
```

For local AI Gateway access, run `vercel link && vercel env pull` to get a short-lived OIDC token, or set `AI_GATEWAY_API_KEY` manually.

For Telegram, point your bot's webhook at `<NEXT_PUBLIC_APP_URL>/api/telegram-webhook` with `TELEGRAM_WEBHOOK_SECRET` as the secret token.

### Required env vars

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres + pgvector connection string |
| `BETTER_AUTH_SECRET` | Session signing key (32+ random bytes) |
| `COMPOSIO_API_KEY` | Composio tool integrations |
| `CRON_SECRET` | Auth for `/api/cron/*` routes (auto-injected on Vercel) |
| `REDIS_URL` _(optional)_ | Resumable streams + abort flags |
| `COMPUTER_USE_ENABLED` _(optional)_ | Set to any value to enable computer use tools (local/self-hosted only — requires [opendesk](https://github.com/vitalops/opendesk)) |
| `TELEGRAM_BOT_TOKEN` _(optional)_ | Telegram bot |
| `TELEGRAM_BOT_USERNAME` _(optional)_ | Telegram bot |
| `TELEGRAM_WEBHOOK_SECRET` _(optional)_ | Telegram webhook auth |

See [`.env.example`](./.env.example) for the full template.

---

## 🤝 Contributing

Bug reports, feature ideas, and PRs all welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, project layout, coding conventions, and the PR checklist.

For security issues, email [sarah@composio.dev](mailto:sarah@composio.dev) directly - please don't open a public issue.

## 📝 License

MIT - see [LICENSE](./LICENSE).

Built on top of [Composio](https://composio.dev). Inspired by [OpenClaw](https://github.com/openclaw/openclaw), rebuilt for security.
