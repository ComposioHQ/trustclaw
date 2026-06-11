# Agent Runtime

The agent runtime lives in `src/server/api/routers/trustclaw/agent/`. The entry point is `prepareAgentRun()` in `setup.ts`, which is called by all three route handlers (web chat, Telegram webhook, cron executor).

## What `prepareAgentRun` does

1. Load the `ComposioClawInstance` from the database.
2. Build the system prompt from the instance's soul/identity/user prompts plus retrieved memories.
3. Load recent messages from the database (compaction-aware — only messages since the last compaction are loaded).
4. Prune large tool results from the context to stay within token limits.
5. Save the incoming user message to the database.
6. Initialise a Composio session and fetch the tool list for the user's connected accounts.
7. Create a `ToolLoopAgent` (Vercel AI SDK) with Anthropic Claude, Composio tools, and custom tools.
8. Return the agent and the prepared message list to the caller.

After the agent finishes generating:

9. The assistant message is written back to the database.
10. Background tasks fire asynchronously: memory flush (if approaching context limit) and compaction (if over limit).

## System prompt

`system-prompt.ts` assembles the prompt from these sections (in order):

1. **Soul prompt** — personality and values. Default is baked in; users can override it during onboarding.
2. **Identity prompt** — the agent's name and self-description (from onboarding).
3. **User prompt** — custom instructions from the user (from onboarding).
4. **Composio tool router docs** — explains how to search, connect, and execute Composio tools.
5. **Custom tools description** — documents `memory_save`, `memory_search`, and `schedule`.
6. **Messaging guidelines** — style rules (concise, no raw JSON dumps, etc.).
7. **Session continuity note** — injected only when a compaction summary exists.
8. **Relevant memories** — top-N memories retrieved by semantic similarity to the current message.
9. **Current time** — formatted in the user's timezone using moment-timezone.

## Tools

### Custom tools (always available)

| Tool | Description |
|------|-------------|
| `memory_save` | Embeds a fact with OpenAI `text-embedding-3-large` (1024-dim) and stores it in `composio_claw_memory` via pgvector. |
| `memory_search` | Cosine-similarity search over stored memories. Returns the top-N most relevant memories. |
| `schedule` | Creates, lists, or deletes cron jobs in `composio_claw_cron_job`. |

### Composio tools (dynamic)

Loaded per-session from Composio using the global API key and the user's connected accounts. These cover 500+ external services: Gmail, Slack, GitHub, Notion, Calendar, Linear, Stripe, HubSpot, and more.

The agent is instructed to always:
1. **Search** for a tool before using it (`COMPOSIO_SEARCH_TOOLS`).
2. **Connect** the user's account if the toolkit isn't linked (`COMPOSIO_MANAGE_CONNECTIONS`).
3. **Execute** with `COMPOSIO_MULTI_EXECUTE_TOOL`.
4. Use the **workbench** (`COMPOSIO_REMOTE_WORKBENCH`) for large or complex results.

## 3-layer context management

The agent can run indefinitely without context overflow. Three layers work together.

### Layer 1 — Context pruning (before every LLM call)

Implemented in `context/context-pruning.ts`. Runs synchronously before the LLM is called.

| Phase | Trigger | Action |
|-------|---------|--------|
| Soft trim | Context > 30% of window | Tool results over 4 KB are trimmed to first + last 1,500 chars |
| Hard clear | Context > 50% of window | Oldest tool results (over 50 KB total) are replaced with a placeholder |

The last 3 assistant turns are never pruned.

### Layer 2 — Memory flush (before compaction)

Implemented in `compaction/memory-flush.ts`. Fires when context approaches the compaction threshold and the flush hasn't run for the current compaction cycle.

Makes a single non-streaming LLM call with only `memory_save` / `memory_search` available, prompting the model to persist durable facts before the conversation is summarised away.

### Layer 3 — Compaction (after response)

Implemented in `compaction/run-compaction.ts`. Fires when estimated context tokens exceed `contextWindow - reserveTokens` (200,000 - 20,000 = 180,000 tokens).

**Cut point**: walks backwards from the newest messages, accumulating token estimates (`chars / 4` heuristic), and stops at `keepRecentTokens` (20,000). The cut point snaps to the nearest user/assistant message boundary (never splits a tool-call/tool-result pair).

**Summarisation**: calls `generateText()` with a structured prompt. Two modes:
- **Initial** — produces a summary with Goal, Constraints, Progress, Key Decisions, Next Steps, Critical Context.
- **Update** — integrates new messages into the existing summary.

If the content to summarise exceeds 100,000 chars, it is split and summarised in halves first, then merged.

**Fallback chain**: full summarisation → retry without large tool results → minimal text. Never throws — a failure just means the next turn retries.

After compaction, only messages since `lastCompactionAt` are loaded, and the summary is prepended as the first user message (wrapped in `<summary>` tags).

## Key constants

| Constant | Value |
|----------|-------|
| Context window | 200,000 tokens |
| Reserve tokens | 20,000 |
| Keep recent tokens | 20,000 |
| Max tool steps per turn | 100 |
| Message safety cap (DB load) | 200 |
| Soft trim threshold | 30% of window |
| Hard clear threshold | 50% of window |
| Soft trim head/tail | 1,500 chars each |
