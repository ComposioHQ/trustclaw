# API Reference

## `trustclaw` router

### Instance management

| Procedure | Type | Description |
|-----------|------|-------------|
| `trustclaw.getInstance` | query | Returns the current user's agent instance, or `null` if one doesn't exist yet. |
| `trustclaw.getStatus` | query | Returns a lightweight status object (instance exists, Telegram linked, etc.). |
| `trustclaw.createInstance` | mutation | Creates a new agent instance for the current user. Called at the end of onboarding. |
| `trustclaw.updateSettings` | mutation | Updates instance settings: model, soul/identity/user prompts, timezone. |
| `trustclaw.deleteInstance` | mutation | Permanently deletes the instance, all messages, memories, and cron jobs. |

### Onboarding

| Procedure | Type | Description |
|-----------|------|-------------|
| `trustclaw.saveOnboardingState` | mutation | Saves progress through the onboarding wizard (step, name, writing style, personality, emoji, lore, model). |

### Conversation

| Procedure | Type | Description |
|-----------|------|-------------|
| `trustclaw.getHistory` | query | Returns paginated conversation history (excludes `hidden` and `memory_flush` messages). |
| `trustclaw.getStreamingMessage` | query | Polls for the in-progress assistant message during a streaming turn (fallback when Redis is unavailable). |

### Memory

| Procedure | Type | Description |
|-----------|------|-------------|
| `trustclaw.getMemories` | query | Returns all stored memories for the current instance, ordered by `createdAt` descending. |

### Cron jobs

| Procedure | Type | Description |
|-----------|------|-------------|
| `trustclaw.getCronJobs` | query | Returns all cron jobs for the current instance. |
| `trustclaw.toggleCronJob` | mutation | Enables or disables a cron job by ID. |
| `trustclaw.deleteCronJob` | mutation | Deletes a cron job by ID. |

### Telegram

| Procedure | Type | Description |
|-----------|------|-------------|
| `trustclaw.linkTelegram` | mutation | Generates a one-time Telegram link token and returns the bot deep-link URL. |
| `trustclaw.unlinkTelegram` | mutation | Removes the Telegram link from the current instance. |

### Integrations

| Procedure | Type | Description |
|-----------|------|-------------|
| `trustclaw.getIntegrationAuthLinks` | query | Returns OAuth auth links for Composio integrations the user hasn't connected yet. |
| `trustclaw.checkConnectionStatus` | query | Checks whether a specific Composio toolkit is connected for the current user. |

---

## `toolkits` router

| Procedure | Type | Description |
|-----------|------|-------------|
| `toolkits.getToolkits` | query | Returns available Composio toolkits with their connection status for the current user. |
| `toolkits.getAuthLink` | mutation | Generates an OAuth redirect URL for connecting a specific toolkit. |

---

## HTTP routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/chat` | POST | Session cookie | Streaming agent turn from the web UI |
| `/api/telegram-webhook` | POST | `X-Telegram-Bot-Api-Secret-Token` header | Telegram message handler |
| `/api/cron/trustclaw` | GET | `Authorization: Bearer <CRON_SECRET>` | Finds and fans out due cron jobs |
| `/api/cron/trustclaw/execute` | POST | `Authorization: Bearer <CRON_SECRET>` | Executes a single cron job |
| `/api/auth/[...all]` | GET/POST | — | Auth handler |
