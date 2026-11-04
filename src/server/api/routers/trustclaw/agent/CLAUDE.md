# TrustClaw Agent

## Overview

This is the AI agent runtime for TrustClaw. It orchestrates Anthropic Claude calls with Composio tools (external service integrations) and custom tools (memory, scheduling), while managing the context window through a 3-layer system adapted from [pi-mono](https://github.com/nicholasgasior/pi-mono) and [OpenClaw](https://github.com/nicholasgasior/openclaw).

Entry point: `prepareAgentRun()` in `setup.ts`, consumed by `app/api/chat/route.ts` (web), `app/api/telegram-webhook/route.ts`, and `app/api/cron/trustclaw/execute/route.ts`.

## Architecture

```
User message (web / telegram / cron)
    │
    ▼
┌─────────────────────────────────────────────────┐
│  setup.ts - prepareAgentRun()                   │
│                                                 │
│  1. Load instance from DB                       │
│  2. Build system prompt                         │
│  3. Load messages (compaction-aware)      ◄─── context/build-context.ts
│  4. Prune context (trim/clear old tools)  ◄─── context/context-pruning.ts
│  5. Save user message to DB                     │
│  6. Init Composio session + tools               │
│  7. Create ToolLoopAgent with Anthropic   ◄─── Vercel AI SDK
│     (memory_save / memory_search tools           │
│      backed by pgvector + OpenAI embeddings)     │
│  8. Return agent + messages to caller           │
│     (caller runs agent.stream() or .generate()) │
│  9. Update assistant message in DB (onFinish)   │
│ 10. Fire-and-forget post-response tasks:        │
│     a. Memory flush (if approaching limit) ◄── compaction/memory-flush.ts
│     b. Compaction (if over limit)         ◄─── compaction/run-compaction.ts
└─────────────────────────────────────────────────┘
```

## Directory Structure

```
agent/
├── setup.ts                    # prepareAgentRun() - builds agent, tools, context
├── index.ts                    # Re-exports prepareAgentRun, types, cron-utils
├── types.ts                    # ReconstructedMessage, JsonValue, ToolResultOutput
├── strip-tool-echoes.ts        # Strips echoed tool results from assistant text
├── system-prompt.ts            # Builds system prompt from identity + soul + user + memory
├── error-parser.ts             # Parses Composio/Anthropic errors into user-friendly messages
│
├── context/                    # Context window management
│   ├── build-context.ts        # DB loading, message reconstruction, post-response orchestration
│   ├── context-window.ts       # Maps model IDs → context window size (200K for all Claude 4.x)
│   ├── token-estimation.ts     # chars/4 heuristic, shouldCompact()
│   └── context-pruning.ts      # 2-phase pruning: soft trim then hard clear of tool results
│
├── compaction/                 # Context compaction (summarization when context overflows)
│   ├── run-compaction.ts       # Cut point algorithm, LLM summarization, DB persistence
│   └── prompts.ts              # Summarization prompts, message serialization, tool failure tracking
│
└── tools/                      # Agent tool definitions (one tool per file + sibling .schema.ts)
    ├── index.ts                # createCustomTools()
    ├── memory-save.ts / .schema.ts    # Save a memory (pgvector + OpenAI embeddings)
    ├── memory-search.ts / .schema.ts  # Cosine-similarity search over memories
    ├── schedule.ts / .schema.ts       # Create/list/delete cron jobs
    └── cron-utils.ts           # computeNextRunAt(), validateCronExpression()
```

## 3-Layer Context Management

The agent can run indefinitely without losing context. Three layers work together, all running **after** the response is sent to the user (fire-and-forget via `void runPostResponseTasks()`):

### Layer 1: Context Pruning (`context/context-pruning.ts`)

Runs **before** every LLM call. Trims large tool results to save tokens.

| Phase | Trigger | Action |
|-------|---------|--------|
| Soft trim | Context chars > 30% of window | Tool results > 4KB: keep first 1500 + `...[trimmed]...` + last 1500 chars |
| Hard clear | Context chars > 50% of window | Replace oldest tool results (> 50KB total) with `[Old tool result content cleared]` |

Protected zone: last 3 assistant turns are never pruned.

### Layer 2: Memory Flush (`compaction/memory-flush.ts`)

Runs **before** compaction when context is approaching the compaction threshold (`contextWindow - reserveTokens - FLUSH_SOFT_TOKENS`) and the flush hasn't yet run for the current compaction cycle. Performs a single non-streaming LLM call with only `memory_save` / `memory_search` tools and the recent conversation, prompting the model to persist any durable facts (user preferences, key decisions, ongoing task state) to the pgvector memory store before the conversation is summarized away.

Memories are stored in the `composio_claw_memory` table with 1024-dim vectors from OpenAI's `text-embedding-3-large` model. Flush failure is non-fatal - the next compaction cycle will retry.

### Layer 3: Compaction (`compaction/run-compaction.ts`)

Runs **after** the response when `contextTokens > contextWindow - reserveTokens` (default reserve: 20K tokens).

**Cut point algorithm** (from pi-mono): Walk backwards from newest messages, accumulate token estimates (chars/4), stop at `keepRecentTokens` (20K). Snap forward to nearest valid cut point (user/assistant message - never split a tool-call/tool-result pair).

**Summarization**: Calls `generateText()` with the compaction system prompt. Two modes:
- **Initial** (no previous summary): Produces structured summary with Goal, Constraints, Progress (Done/In Progress/Blocked), Key Decisions, Next Steps, Critical Context
- **Update** (has previous summary): Integrates new messages into the existing summary, moving progress items from In Progress → Done

**Staged summarization**: If messages to compact > 100K chars, splits into halves, summarizes each, then merges with a final LLM call.

**Fallback chain**: Full summarization → retry without large tool results → minimal text description. Never throws - compaction failure just means the next turn retries.

**Persistence**: Updates `instance.lastCompactionSummary` with an optimistic lock on `compactionCount` to prevent concurrent compactions. The summary is injected as the first user message (wrapped in `<summary>` tags) on subsequent turns.

## Message Flow Through DB

Messages stored in `composio_claw_message` with `messageType`:
- `regular` - normal user/assistant messages (loaded into context)
- `hidden` - internal trigger messages not shown to user (excluded from context loading and history)
- `memory_flush` - flush turn messages (excluded from context loading)
- `compaction_summary` - reserved for future use

After compaction, `loadContextMessages()` only loads messages where `createdAt >= lastCompactionAt`, plus prepends the compaction summary. This keeps DB queries fast regardless of total conversation length.

## Token Estimation

All token estimation uses the **chars/4 heuristic** (from pi-mono):
- User messages: `content.length / 4`
- Assistant messages: text + `JSON.stringify(tool call inputs)` / 4
- Tool results: `JSON.stringify(output)` / 4

When real LLM usage is available (from `result.usage` after `streamText()`), those values are used instead. The sum `inputTokens + outputTokens` from the completed turn approximates next turn's context size.

## Tools

### Custom tools (always available)
- **memory_save**: Persist a durable fact to the pgvector memory store
- **memory_search**: Cosine-similarity search over memories
- **schedule**: Create/list/delete cron jobs (see `../../../app/api/cron/trustclaw/CLAUDE.md`)

### Glen tools (only when `GLEN_API_KEY` and `GLEN_ORG_ID` are set)
From `createGlenClient` in `~/server/clients/glen.ts`, which returns `null` when glen is off and also supplies a `<glen-team-memory>` system-prompt block:
- **glen_search**: Search the team's shared glen memory
- Every finished turn is sent to glen's `turn` endpoint from `onFinish` (fire-and-forget; failures are logged and never break the chat)

### Composio tools (dynamic)
Created per-session via `createComposioClient(apiKey).create(orgId).tools()`. These provide integrations with external services (Gmail, Slack, GitHub, etc.) based on the user's connected accounts.

## System Prompt

Built by `system-prompt.ts`. Sections:
1. Soul prompt (personality/values - default or user-customized)
2. Identity + user prompts (sourced from `OnboardingState`)
3. Custom tools description
4. Messaging guidelines
5. Session continuity note (only when compaction summary exists)
6. Current time

## Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| Context window | 200,000 tokens | `context/context-window.ts` |
| Reserve tokens | 20,000 | `context/token-estimation.ts` |
| Keep recent tokens | 20,000 | `context/token-estimation.ts` |
| Message safety cap | 200 | `context/build-context.ts` |
| Max tool steps | 100 | `setup.ts` (via `stepCountIs(100)`) |
| Soft trim ratio | 0.3 | `context/context-pruning.ts` |
| Hard clear ratio | 0.5 | `context/context-pruning.ts` |
| Soft trim head/tail | 1,500 chars each | `context/context-pruning.ts` |
| Min prunable tool chars | 50,000 | `context/context-pruning.ts` |

## Algorithm Origins

The compaction system is adapted from two open-source projects. All prompts and algorithms are copied with the source references noted in file comments:

| Component | Source |
|-----------|--------|
| Token estimation (chars/4) | `pi-mono/packages/coding-agent/src/core/compaction/compaction.ts:225-283` |
| Cut point algorithm | `pi-mono/packages/coding-agent/src/core/compaction/compaction.ts:376-438` |
| Initial/Update summarization prompts | `pi-mono/packages/coding-agent/src/core/compaction/compaction.ts:444-514` |
| Summarization system prompt | `pi-mono/packages/coding-agent/src/core/compaction/utils.ts:152-154` |
| Message serialization | `pi-mono/packages/coding-agent/src/core/compaction/utils.ts:93-146` |
| Compaction summary prefix | `pi-mono/packages/coding-agent/src/core/messages.ts:11-17` |
| Context pruning | `openclaw/src/agents/pi-extensions/context-pruning/pruner.ts:225-346` |
| Pruning settings | `openclaw/src/agents/pi-extensions/context-pruning/settings.ts:48-65` |
| Adaptive chunking / staged summarization | `openclaw/src/agents/compaction.ts:110-129, 244-305` |
| Fallback chain | `openclaw/src/agents/compaction.ts:176-242` |
| Tool failure tracking | `openclaw/src/agents/pi-extensions/compaction-safeguard.ts:78-135` |

## External Consumers

| File | Imports |
|------|---------|
| `app/api/chat/route.ts` | `prepareAgentRun` - web streaming via `agent.stream()` |
| `app/api/telegram-webhook/route.ts` | `prepareAgentRun` - telegram via `agent.generate()` |
| `app/api/cron/trustclaw/execute/route.ts` | `prepareAgentRun`, `computeNextRunAt` - cron via `agent.generate()` |
