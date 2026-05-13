# Database

TrustClaw uses **PostgreSQL with the pgvector extension**. The schema is in `prisma/schema.prisma`.

For development, apply the schema with:

```bash
pnpm prisma db push
```

## Models

### User

Standard user record. Each user gets one `ComposioClawInstance` (their agent), one `OnboardingState`, and any number of sessions.

Fields of note:
- `timezone` — IANA timezone string (default `"UTC"`), used to format times in the agent's system prompt.
- `username` — unique, used for login.

### ComposioClawInstance

The agent instance tied to a user. One instance per user.

| Field | Purpose |
|-------|---------|
| `anthropicModel` | Model ID used for LLM calls (e.g. `claude-sonnet-4-5-20250929`) |
| `telegramChatId` | Set when the user links a Telegram account |
| `telegramLinkToken` / `telegramLinkTokenExpiresAt` | Short-lived token for the Telegram linking flow |
| `soulPrompt` / `identityPrompt` / `userPrompt` | Custom system prompt sections. `null` = use the default. |
| `compactionCount` | Increments on each successful compaction; used as an optimistic lock |
| `lastCompactionSummary` | The most recent compaction summary, injected as the first message on each turn |
| `lastCompactionAt` | Only messages after this timestamp are loaded into context |
| `memoryFlushCount` | Tracks how many memory flushes have occurred for the current compaction cycle |

### Message

Every turn in the conversation. Stored and loaded per-instance.

| Field | Values / Purpose |
|-------|-----------------|
| `role` | `user` or `assistant` |
| `source` | `web`, `telegram`, or `cron` — records how the message was triggered |
| `messageType` | Controls whether the message is included in context loading (see below) |
| `content` | JSON message content |
| `inputTokens` / `outputTokens` / `cacheReadTokens` / `cacheWriteTokens` | Real usage from the LLM response |

**Message types:**
- `regular` — normal messages, included in context.
- `hidden` — internal trigger messages (e.g. cron prompts shown to the agent but not the user); excluded from context loading and the chat history UI.
- `memory_flush` — the flush turn; excluded from context loading.
- `compaction_summary` — reserved for future use.

### Memory

Persistent memories stored by the agent via `memory_save`.

| Field | Purpose |
|-------|---------|
| `content` | Plain text of the memory |
| `embedding` | `VECTOR(1024)` — used for cosine-similarity search |

### CronJob

Scheduled agent tasks created by the `schedule` tool.

| Field | Purpose |
|-------|---------|
| `expression` | Standard cron expression (e.g. `0 9 * * 1`) |
| `prompt` | The message sent to the agent when the job fires |
| `timezone` | IANA timezone for evaluating the cron expression |
| `enabled` | Toggle without deleting the job |
| `nextRunAt` | Pre-computed from the expression; used by the cron route to find due jobs |
| `lockedAt` / `lockedBy` | Optimistic lock to prevent double-execution |
| `lastError` | Stored when a cron run fails |

### OnboardingState

Tracks the user's progress through the onboarding wizard. Stores the agent's name, writing style, personality, emoji, and lore, which are later baked into the instance's identity and soul prompts.
