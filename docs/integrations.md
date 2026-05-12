# Integrations

## Telegram bot

The Telegram integration lets users chat with their TrustClaw agent from any device via Telegram.

### Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. Set the required env vars:

   | Variable | Value |
   |----------|-------|
   | `TELEGRAM_BOT_TOKEN` | Token from BotFather |
   | `TELEGRAM_BOT_USERNAME` | Your bot's username (without `@`) |
   | `TELEGRAM_WEBHOOK_SECRET` | Any random secret string (32+ chars) |

3. Register the webhook with Telegram. Replace the placeholders:

   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://<your-app>/api/telegram-webhook",
       "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
     }'
   ```

4. In the TrustClaw dashboard, go to **Settings > Telegram** and link your account. TrustClaw generates a one-time link token; open it in Telegram to complete the link.

### How it works

- Telegram sends `POST /api/telegram-webhook` for each message.
- The handler verifies the `X-Telegram-Bot-Api-Secret-Token` header.
- It looks up the `ComposioClawInstance` by `telegramChatId`.
- It calls `prepareAgentRun()` and runs `agent.generate()` (non-streaming).
- The response is sent back via the Telegram Bot API.

When Telegram features are disabled (env vars not set), the webhook route returns 400 and all Telegram-related tRPC procedures return an appropriate error.

## Cron jobs

Cron jobs let the agent run recurring tasks on a schedule — daily summaries, reminders, periodic reports, etc.

### How the agent creates jobs

The agent has a `schedule` tool with three actions:

- **create** — takes a cron expression, a prompt, and an optional timezone. Stores the job and pre-computes `nextRunAt`.
- **list** — returns all jobs for the current instance.
- **delete** — removes a job by ID.

Users can also manage jobs directly in the dashboard under **Settings > Scheduled Tasks**.

### How jobs execute

A Vercel cron (`vercel.json`) hits `GET /api/cron/trustclaw` on the configured interval. That route:

1. Queries for all enabled jobs where `nextRunAt <= now()` and `lockedAt` is null (or stale).
2. For each due job, sets an optimistic lock (`lockedAt`, `lockedBy`).
3. Fires `POST /api/cron/trustclaw/execute` for each job (fan-out).

The execute handler:

1. Verifies the `Authorization: Bearer <CRON_SECRET>` header.
2. Calls `prepareAgentRun()` with a `hidden` user message wrapping the job's prompt in `<scheduled-task>` tags.
3. Runs `agent.generate()`.
4. Updates `lastRunAt`, `nextRunAt`, clears the lock, and records any error.

The agent is instructed to treat `<scheduled-task>` blocks as self-issued reminders — it executes them without greeting the user.

### Vercel Hobby plan limits

On the free Hobby plan:
- Cron jobs can only run **once per day**. More frequent expressions fail at deploy time.
- Functions time out after **300 seconds (5 minutes)**. Long agent turns may be cut short.

The deploy CLI auto-adjusts `vercel.json` to a daily expression when it detects a Hobby account. To get per-minute cron precision and 800-second function limits, upgrade to Vercel Pro.

### `CRON_SECRET`

All cron routes require the `Authorization: Bearer <CRON_SECRET>` header. Vercel injects this automatically for routes listed in `vercel.json`. For local development, set `CRON_SECRET` in `.env` and include the header when testing manually.
