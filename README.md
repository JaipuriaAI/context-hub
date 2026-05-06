# Context Hub

**Your personal AI context layer — shared across Claude.ai, Claude Code, the Claude App, ChatGPT, Perplexity, Cursor, and any other MCP-speaking client.**

Stop repeating yourself across AI tools. Context Hub is a shared MCP server that gives every AI session access to the same memories, projects, instructions, and identity. Brainstorm on your phone, pick up in Claude Code on your laptop, continue in ChatGPT on the web — everything stays in sync.

**Built on Cloudflare Workers (free tier). Costs $0/month. Always on. No cold starts.**

> **New in 0.2.0:** Context Hub now works with **any MCP client**, not just Claude. When you save a memory or log context from ChatGPT, Perplexity, Cursor, Windsurf, Zed, or a custom agent system, the `source` field is auto-detected from the MCP client's self-reported name — so you can always see where each memory came from.

---

## The Problem

AI tools each maintain **separate context**:

- A memory saved in Claude.ai isn't available in Claude Code, ChatGPT, or Perplexity
- Project instructions set up in one tool don't transfer to the next
- You end up re-explaining who you are, what you're working on, and how you prefer responses — every time you switch tools
- There's no official API to sync this data between interfaces or vendors

## The Solution

Context Hub is a single MCP server that **every one of your AI clients connects to simultaneously**. It becomes your shared source of truth:

| What's Stored    | Example                                                |
| ---------------- | ------------------------------------------------------ |
| **Memories**     | "Mayank prefers FastAPI over Django for new projects"  |
| **Projects**     | Name, description, and custom instructions per project |
| **Instructions** | "Always use TypeScript. Never suggest ORMs."           |
| **Identity**     | Name, role, expertise, location, tools, education      |
| **Context Log**  | Breadcrumb trail: "Discussed OAuth2 on phone at 3pm"   |

## Architecture

```
Claude App (Phone) ─────┐
Claude.ai (Browser) ────┤
ChatGPT (Connector) ────┤    Custom Connector / MCP (HTTPS)
Perplexity ─────────────┤
Cursor / Windsurf ──────┤
Any MCP client ─────────┤
                        ▼
               ┌──────────────────┐
               │  Context Hub     │    Cloudflare Workers
               │  MCP Server      │    Free tier ($0/month)
               │                  │    Always on, global edge
               │  24 MCP tools    │    No cold starts
               │  Auto-detects    │    source = MCP client name
               │  the caller      │    (claude-code, chatgpt, …)
               └────────┬─────────┘
                        │
                        ▼
               ┌──────────────────┐
               │  Cloudflare D1   │    Free SQLite database
               │  (5GB free)      │    5M reads/day
               │                  │    100K writes/day
               └──────────────────┘
                        ▲
                        │  HTTP transport (MCP)
               ┌────────┴─────────┐
               │  Claude Code /   │
               │  any terminal    │
               │  MCP client      │
               └──────────────────┘
```

## Cost: $0/month Forever

Runs entirely on Cloudflare's free tier with massive headroom:

| Resource        | Free Limit  | Typical Usage         | Headroom |
| --------------- | ----------- | --------------------- | -------- |
| Worker Requests | 100,000/day | ~250/day              | 400x     |
| D1 Storage      | 5 GB        | ~10 MB (10K memories) | 500x     |
| D1 Reads        | 5M/day      | ~500/day              | 10,000x  |
| D1 Writes       | 100K/day    | ~50/day               | 2,000x   |

---

## How Is This Different?

There are many MCP memory servers. Here's why Context Hub exists and how it compares:

### The Core Difference

**Every other memory MCP server is local-only and vendor-locked.** They run on your machine via stdio, which means your phone can't reach them, your browser can't reach them, and they're usually tied to a single AI client. Context Hub runs in the cloud (Cloudflare Workers) and speaks the open MCP protocol — so any client that speaks MCP (Claude.ai, Claude Code, Claude App, ChatGPT connectors, Perplexity, Cursor, Windsurf, Zed, custom agents) connects to the same data.

### Comparison Table

| Feature                                                          |       Context Hub        | Anthropic server-memory | mcp-memory-keeper |      Basic Memory       |    OpenMemory (Mem0)     |       mem0-mcp-selfhosted        |
| ---------------------------------------------------------------- | :----------------------: | :---------------------: | :---------------: | :---------------------: | :----------------------: | :------------------------------: |
| **Works with Claude.ai (browser)**                               |           Yes            |           No            |        No         |    Yes (cloud plan)     |            No            |                No                |
| **Works with Claude App (phone)**                                |           Yes            |           No            |        No         |           No            |            No            |                No                |
| **Works with Claude Code**                                       |           Yes            |           Yes           |        Yes        |           Yes           |           Yes            |               Yes                |
| **Works with ChatGPT / Perplexity / Cursor / other MCP clients** |           Yes            |           No            |        No         |           No            |            No            |                No                |
| **Auto-detects calling client (source tag)**                     |           Yes            |           No            |        No         |           No            |            No            |                No                |
| **Cloud-hosted (accessible anywhere)**                           |           Yes            |     No (local JSON)     | No (local SQLite) |     Optional (paid)     |    No (local Docker)     |        No (local Docker)         |
| **Free forever**                                                 |         Yes ($0)         |           Yes           |        Yes        | Free local / Paid cloud |     Yes (self-host)      |         Yes (self-host)          |
| **Setup time**                                                   |         ~10 min          |         ~2 min          |      ~2 min       |         ~5 min          |         ~30 min          |             ~15 min              |
| **Infrastructure required**                                      |  None (Cloudflare free)  |          None           |       None        |      None (local)       | Docker + Qdrant + Ollama | Docker + Qdrant + Ollama + Neo4j |
| **Full-text search**                                             |        Yes (FTS5)        |      Keyword only       |        Yes        |           Yes           |    Semantic (vectors)    |        Semantic (vectors)        |
| **Decision tracking (with reasoning)**                           |           Yes            |           No            |        No         |           No            |            No            |                No                |
| **Project management**                                           |     Yes (full CRUD)      |           No            |   Channels only   |        Projects         |            No            |                No                |
| **Custom instructions sync**                                     |           Yes            |           No            |        No         |           No            |            No            |                No                |
| **Identity profile**                                             |           Yes            |           No            |        No         |           No            |            No            |                No                |
| **Cross-interface context log**                                  |           Yes            |           No            |        No         |           No            |            No            |                No                |
| **Export/import**                                                |        Yes (JSON)        |           No            |    Yes (JSON)     |     Yes (Markdown)      |            No            |                No                |
| **Deduplication**                                                |    3-layer auto-dedup    |           No            |        No         |           No            |      Semantic dedup      |          Semantic dedup          |
| **Analytics dashboard**                                          |           Yes            |           No            |        No         |           No            |            No            |                No                |
| **Number of tools**                                              |            24            |            6            |        ~15        |           ~8            |           4-6            |                11                |
| **Storage**                                                      | Cloudflare D1 (5GB free) |        JSON file        |   Local SQLite    |     Markdown files      |   Qdrant + PostgreSQL    |         Qdrant + SQLite          |
| **Data ownership**                                               | Your Cloudflare account  |      Your machine       |   Your machine    |      Your machine       |       Your machine       |           Your machine           |

### Why Not Just Use...

**"...Anthropic's official server-memory?"**
It stores a JSON file on your local machine. Great for Claude Desktop, but Claude.ai and your phone can't access it. No search beyond basic keyword matching. No projects, instructions, or identity management.

**"...mcp-memory-keeper?"**
Excellent for Claude Code session persistence (channels, checkpoints, git integration). But it's local-only — stdio transport, no HTTP endpoint. Claude.ai and your phone can't reach it. It solves a different problem: context within one tool vs. context across all tools.

**"...Basic Memory?"**
Good local-first knowledge management with Markdown files and a semantic graph. The cloud version requires a paid plan. It doesn't track decisions, instructions, or identity. No cross-interface context logging.

**"...OpenMemory / Mem0?"**
Powerful semantic search with vector embeddings. But requires Docker + Qdrant + Ollama running on your machine (~500MB download, 30 min setup). Local-only — no cloud access for your phone. Overkill infrastructure for personal context management. No decision tracking, no project management, no instructions sync.

**"...mem0-mcp-selfhosted?"**
Same as Mem0 but fully self-hosted. Requires Docker + Qdrant + Ollama + optionally Neo4j. Impressive 11 tools with knowledge graph support. But it's local stdio only, requires significant infrastructure, and solves the "semantic recall" problem rather than the "cross-interface sync" problem.

### Context Hub's Unique Position

Context Hub is the only tool that:

1. **Bridges every MCP-speaking AI client** — Claude.ai, Claude Code, Claude App, ChatGPT connectors, Perplexity, Cursor, Windsurf, Zed, and custom agent systems, all reading and writing the same data
2. **Auto-detects the calling client** — every memory, decision, and context-log entry is automatically tagged with the MCP client's self-reported name (e.g. `claude-code`, `chatgpt`, `perplexity`), so you can always see where it came from
3. **Runs in the cloud for free** (Cloudflare Workers free tier, no Docker, no containers)
4. **Tracks decisions with reasoning** (not just what, but why)
5. **Syncs custom instructions and identity** across every AI client
6. **Provides cross-client breadcrumbs** ("what was I discussing in ChatGPT yesterday?")
7. **Setup takes 10 minutes** with zero infrastructure management

If you only use a single AI tool and want local-only memory, tools like mcp-memory-keeper or server-memory are simpler choices. Context Hub is for people who use multiple AI clients (or keep trying new ones) and want their context to follow them everywhere.

---

## Quick Start

### Option A: One Command (Recommended)

```bash
npx create-context-hub
```

That's it. The CLI walks you through everything interactively — scaffolds the project, logs into Cloudflare, creates the D1 database, runs migrations, deploys, sets up an API key, and configures Claude Code. Takes ~2 minutes.

### Option B: Manual Setup (5 Steps, ~10 minutes)

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)

### Step 1: Clone and install

```bash
git clone https://github.com/JaipuriaAI/context-hub.git
cd context-hub
npm install
```

### Step 2: Login to Cloudflare and create database

```bash
npx wrangler login          # Opens browser for Cloudflare auth
npx wrangler d1 create context-hub-db
```

Wrangler will offer to add the database to your config. Say **yes** to add it, then say **no** to "connect to remote for local dev".

> **Important:** After wrangler adds the config, open `wrangler.json` and make sure the D1 binding name is `"DB"` (not `"context_hub_db"`). Your code uses `env.DB` to access the database.

### Step 3: Run the migration

```bash
npx wrangler d1 execute context-hub-db --remote --file=./migrations/0001_init.sql
```

This creates 5 tables: `memories`, `projects`, `instructions`, `identity`, and `context_log` — with full-text search indexes.

### Step 4: Deploy

```bash
npx wrangler deploy
```

You'll get a URL like:

```
https://claude-context-hub.YOUR_SUBDOMAIN.workers.dev
```

**Save this URL** — you'll need it for both Claude.ai and Claude Code.

### Step 5: Connect your AI clients

Context Hub is a standard MCP server, so **any client that speaks MCP works**. Here are the most common ones:

#### Claude.ai + Claude App (phone)

1. Go to [claude.ai/settings/connectors](https://claude.ai/settings/connectors)
2. Scroll to the bottom and click **"Add custom connector"**
3. Enter your Worker URL with `/mcp` appended:
   ```
   https://claude-context-hub.YOUR_SUBDOMAIN.workers.dev/mcp
   ```
4. Click **Add**, then click **Connect**

The connector works across Claude.ai on browser AND the Claude App on your phone — same account, same connector.

#### Claude Code (terminal)

```bash
claude mcp add --transport http --scope user context-hub \
  https://claude-context-hub.YOUR_SUBDOMAIN.workers.dev/mcp
```

Context Hub is now available in every Claude Code session, every project.

#### ChatGPT (Developer-mode connector)

In ChatGPT, open **Settings → Connectors → Add** (requires Developer mode or a Plus/Team plan with MCP connector support), then paste the same `/mcp` URL. ChatGPT will self-identify as `chatgpt` — memories it saves get `source = "chatgpt"` automatically.

#### Perplexity, Cursor, Windsurf, Zed, Cline, Continue, custom agents

Any MCP-speaking client follows the same pattern — register the hub's `/mcp` URL as an MCP server. The server **auto-detects the client from the MCP `initialize` handshake**, so you don't need to configure the `source` field manually. Whatever name the client self-reports (Cursor, Windsurf, your custom agent, etc.) becomes the `source` slug.

---

## Verify It Works

### Test from Claude.ai or Claude App

Open a new conversation with the Context Hub connector enabled and say:

> "Save my identity: my name is [Your Name], I'm a [your role] based in [location]. I work with [your tech stack]."

Claude will call `set_identity` multiple times to save each field.

Then start a **new** conversation and say:

> "Who am I? Check your Context Hub."

Claude will call `get_identity` and recall everything you saved — across conversations!

### Test from Claude Code

```
> What do you know about me? Check context hub.
```

Claude Code will call `get_identity` and show the same data you saved from Claude.ai.

### Test cross-client sync

1. **On your phone** (Claude App): "I'm thinking about adding OAuth2 to the auth system. Save this thought."
2. **In ChatGPT** (browser): "What was I thinking about on my phone? Check recent context."
3. **In Claude Code** (laptop terminal): "Show me everything discussed in ChatGPT today."

Every client sees the others' entries instantly. Each entry is tagged with the `source` of the client that wrote it (`claude-app`, `chatgpt`, `claude-code`, etc.) so you can filter by origin.

---

## Example Prompts

Here are real prompts you can use with Context Hub. These work in any MCP client (Claude.ai, Claude App, Claude Code, ChatGPT, Perplexity, Cursor, Windsurf, Zed, and any custom agent):

### Setting up your identity

> "Save my identity in Context Hub: I'm Sarah Chen, a senior backend engineer at Acme Corp, based in Singapore. I specialize in Go, PostgreSQL, and distributed systems. I use VS Code, Claude Code, and Docker daily."

### Saving preferences as instructions

> "Save these as instructions in Context Hub: Always use TypeScript for new projects. Prefer functional programming patterns. Keep responses concise. Use dark mode examples in code snippets."

### Creating a project

> "Create a project in Context Hub called 'payments-v2' — it's a Stripe integration rewrite using PaymentIntents API. Key constraint: must support both one-time and subscription payments. We decided to use webhooks over polling."

### Brainstorming across clients

**Phone (Claude App):**

> "Log this context: I've been thinking about migrating from REST to tRPC for the internal dashboard. Main reasons are type safety and reduced boilerplate. Need to evaluate bundle size impact."

**Laptop (Claude Code or Cursor):**

> "What context was logged recently? I was thinking about something on my commute."

**Web (ChatGPT or Perplexity):**

> "Show me what I logged in Claude Code yesterday — filter by source 'claude-code'."

### Session start ritual

> "Load my full context from Context Hub — who am I, my instructions, recent memories, and what I've been working on across interfaces."

This calls `get_full_context` and gives Claude the complete picture in one shot.

### Searching memories

> "Search my memories for anything about authentication decisions"

> "What do I know about the payments project? Search my hub."

### Viewing your dashboard

> "Show me my Context Hub stats"

Returns a visual dashboard with memory counts, storage usage, activity timeline, and top tags.

### Listing everything

> "Show me everything in my Context Hub — all memories, projects, instructions, identity"

This calls `list_all_data` and returns the complete inventory across all tables.

---

## MCP Tools Reference (24 tools)

### Memories (5 tools)

| Tool                   | What It Does                                                                                                                                          | Smart Behavior                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `save_memory`          | Save a memory with category and tags. `source` is auto-detected from the MCP client (e.g. `claude-code`, `chatgpt`, `perplexity`). Auto-deduplicates. | Detects category from context: "I prefer X" → preference, "decided to use X" → decision  |
| `update_memory`        | Update an existing memory by ID. Only changes the fields you provide.                                                                                 | "change memory #X" or "fix that memory" → pass only the fields to change, rest preserved |
| `search_memories`      | Full-text search across all memories                                                                                                                  | Uses natural language keywords, tries synonyms if no results                             |
| `list_recent_memories` | List recent memories with smart limits                                                                                                                | "show all" → 500 results, "show recent" → 15, default 100                                |
| `delete_memory`        | Remove a memory by ID                                                                                                                                 | —                                                                                        |

### Decisions (2 tools)

| Tool               | What It Does                                                                           | Smart Behavior                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `save_decision`    | Save a decision with reasoning and rejected alternatives. Stored as structured memory. | "let's go with X because Y" → extract decision, reasoning, alternatives. Always capture the WHY |
| `search_decisions` | Search only decisions with full reasoning context                                      | "why did we decide X?" → searches decision memories, optionally filtered by project             |

### Projects (4 tools)

| Tool              | What It Does                                                     | Smart Behavior                                                                    |
| ----------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `save_project`    | Create/update a project with description and instructions        | Upserts — safe to call repeatedly with updated info                               |
| `get_project`     | Get project details + custom instructions                        | Use before working on a project to load its context                               |
| `list_projects`   | List all projects                                                | Default: active only. User says "all" → includes archived                         |
| `archive_project` | Soft-delete a project (data preserved, hidden from active lists) | "I'm done with project X" → archives it. Reactivate by calling save_project again |

### Instructions (3 tools)

| Tool                 | What It Does                                    | Smart Behavior                                                                                  |
| -------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `save_instruction`   | Save a global behavior rule. Auto-deduplicates. | Auto-categorizes: "always/never" → behavior, tone/format → style, tech constraints → constraint |
| `get_instructions`   | Get all active instructions                     | Call at session start to know user's behavior preferences                                       |
| `delete_instruction` | Remove an instruction by ID                     | "remove that rule" or "delete instruction #X" → permanently removes the instruction             |

### Identity (2 tools)

| Tool           | What It Does               | Smart Behavior                                                   |
| -------------- | -------------------------- | ---------------------------------------------------------------- |
| `set_identity` | Set/update identity fields | Upserts. Proactive — saves identity details mentioned in passing |
| `get_identity` | Get full identity profile  | Call FIRST at every session start                                |

### Context Log (2 tools)

| Tool                 | What It Does                          | Smart Behavior                                                                                                                                     |
| -------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `log_context`        | Leave a breadcrumb for other sessions | Auto-deduplicates within 5 minutes. `source` auto-detected from the calling MCP client.                                                            |
| `get_recent_context` | See what happened in other sessions   | "on my phone" → `claude-app`, "in browser" → `claude-ai`, "in ChatGPT" → `chatgpt`, "in Perplexity" → `perplexity`, "in terminal" → `claude-code`. |

### Import/Export (2 tools)

| Tool         | What It Does                                              | Smart Behavior                                                                     |
| ------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `export_hub` | Export ALL data as structured JSON for backup/portability | "backup my hub" or "export my data" → returns complete JSON snapshot of all tables |
| `import_hub` | Import data from a JSON export with dedup protection      | "restore from backup" → merges data, skips duplicates, reports import counts       |

### Composite (3 tools)

| Tool                  | What It Does                                                                                               | Smart Behavior                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `get_full_context`    | **Session-start powerhouse** — returns identity + instructions + projects + memories + context in one call | THE most important tool. Call FIRST before anything else                                     |
| `get_project_context` | Load everything relevant to ONE project — details, instructions, memories, decisions, context logs         | "load project X" or "catch me up on project Y" → project-focused version of get_full_context |
| `list_all_data`       | Complete inventory of everything in the hub                                                                | For "show me everything" — returns ALL data, no truncation                                   |

### Analytics (1 tool)

| Tool            | What It Does                                       | Smart Behavior                                                   |
| --------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| `get_hub_stats` | Dashboard metrics: counts, activity, storage, tags | Instructs Claude to render as a colorful inline visual dashboard |

---

## Auto-Load Context at Session Start

Add this to your global Claude Code config so context loads automatically:

**File: `~/.claude/CLAUDE.md`**

```markdown
## Context Hub

At the start of each session, call `get_full_context` from the context-hub MCP server
to load identity, instructions, and recent memories. When you learn something new about
me or make a decision, call `save_memory`. When a session ends or a significant topic
is discussed, call `log_context` to leave a breadcrumb for other sessions.
```

---

## Migrating Your Existing Memories

### Official Claude.ai Memory Export

Claude provides an official way to export your memories. Here's how to migrate them to Context Hub:

**Step 1: Export from Claude.ai**

Go to **Settings > Capabilities > Memory** and click **"View and edit your memory"** to see what Claude knows about you.

Alternatively, in any Claude.ai conversation, ask:

> "Write out your memories of me verbatim, exactly as they appear in your memory."

**Step 2: Import into Context Hub**

Open a NEW Claude.ai conversation with the Context Hub connector enabled, then paste your exported memories and say:

> "Import all of these into Context Hub. Use set_identity for personal details, save_memory for facts/preferences/learnings, save_instruction for behavior rules I've given you, save_decision for any decisions with reasoning, and save_project for projects. Categorize each one appropriately. Source should be 'import'."

**Step 3: Verify**

Ask: "Show me my Context Hub stats" — you should see all your data populated.

### Importing from Other AI Services (ChatGPT, Gemini, etc.)

Claude's official import documentation is at: https://support.claude.com/en/articles/12123587-import-and-export-your-memory-from-claude

Use this prompt in your current AI service to export memories:

```
I'm moving to another service and need to export my data. List every memory you have stored about me, as well as any context you've learned about me from past conversations. Output everything in a single code block so I can easily copy it. Format each entry as: [date saved, if available] - memory content. Make sure to cover all of the following — preserve my words verbatim where possible: Instructions I've given you about how to respond (tone, format, style, 'always do X', 'never do Y'). Personal details: name, location, job, family, interests. Projects, goals, and recurring topics. Tools, languages, and frameworks I use. Preferences and corrections I've made to your behavior. Any other stored context not covered above. Do not summarize, group, or omit any entries. After the code block, confirm whether that is the complete set or if any remain.
```

Then paste the output into a Claude.ai conversation with Context Hub enabled and ask Claude to import it using the tools.

---

## How Updates Work

Context Hub is a **live MCP server**, not an npm package. This means:

- **You deploy once, users get updates automatically.** There's nothing to reinstall or upgrade.
- **Tool definitions come from the server**, not local code. When the server updates, every connected Claude session sees the new tools on their next conversation.
- **MCP re-initializes per session.** Claude.ai/App picks up changes on the next conversation. Claude Code picks them up on the next session (or run `/mcp` to refresh immediately).

For **self-hosted users** who want to pull the latest changes:

```bash
git pull origin main
npx wrangler deploy
```

That's it — all your Claude sessions will see the updated tools immediately.

### Upgrading a project scaffolded via `npx create-context-hub`

If you originally set up your hub with `npx create-context-hub` (rather than cloning this repo), there's a dedicated one-command upgrade path in the CLI:

```bash
cd your-scaffolded-hub
npx create-context-hub@latest update
```

The `update` command:

- Detects your scaffolded project (checks `wrangler.json`, `src/index.ts`, `migrations/0001_init.sql`)
- Previews which files will change and by how many lines
- Writes `.bak` backups before overwriting (so rollback is one `mv` away)
- Preserves your `wrangler.json` (with your database ID), `package.json`, `tsconfig.json`, and any custom files
- Optionally runs `npx wrangler deploy` for you

Existing memories keep their original `source` values — there's no data migration. New memories written after the upgrade get the calling MCP client's self-reported name as their source (e.g. `claude-code`, `chatgpt`, `perplexity`, `cursor`).

### Forgot where your scaffolded hub lives?

If you scaffolded your hub months ago and can't remember the directory, the CLI can find it for you:

```bash
npx create-context-hub@latest locate
```

This scans common project directories (`~/Documents`, `~/Projects`, `~/code`, `~/dev`, `~/Developer`, `~/workspace`, `~/src`, and your `$HOME` shallow) for anything with the Context Hub fingerprint — `wrangler.json` + `src/index.ts` + `migrations/0001_init.sql` + a `CONTEXT_HUB` durable object binding. It prints each project's path, Worker name, and D1 database details.

If that turns up nothing, the Worker name in your [Cloudflare Workers dashboard](https://dash.cloudflare.com/?to=/:account/workers) is the definitive record.

## Updating Context Hub

### Adding new tools or updating existing ones

1. Edit `src/index.ts` — add/modify tools
2. Run type check: `npx tsc --noEmit`
3. Deploy: `npx wrangler deploy`
4. **That's it.** Updates propagate to all users automatically.

### Adding new database tables

1. Create a new migration file: `migrations/0002_your_change.sql`
2. Run it: `npx wrangler d1 execute context-hub-db --remote --file=./migrations/0002_your_change.sql`
3. Update tools in `src/index.ts` to use the new tables
4. Deploy: `npx wrangler deploy`

### Schema of existing tables

```sql
-- memories: things the AI learns about you
-- `source` is auto-detected from the MCP client's clientInfo.name
-- (claude-code, claude-ai, claude-app, chatgpt, perplexity, cursor, windsurf, zed, custom agents, etc.)
memories (id, content, category, tags, source, created_at, updated_at)
-- FTS5 full-text search index on memories

-- projects: workspace-level context
projects (id, name UNIQUE, description, instructions, status, created_at, updated_at)

-- instructions: global behavior directives
instructions (id, type, content, priority, active, created_at, updated_at)

-- identity: who you are
identity (id, key UNIQUE, value, created_at, updated_at)

-- context_log: cross-client breadcrumbs (source auto-detected from MCP client)
context_log (id, source, summary, project_name, created_at)
```

---

## Optional: Protect with an API Key

For security, restrict access to your hub:

```bash
npx wrangler secret put API_KEY
# Enter your chosen secret when prompted
```

Then update Claude Code connection:

```bash
claude mcp remove context-hub
claude mcp add --transport http --scope user \
  --header "Authorization: Bearer YOUR_SECRET_HERE" \
  context-hub https://claude-context-hub.YOUR_SUBDOMAIN.workers.dev/mcp
```

For Claude.ai, click **"..."** on your connector → reconfigure → **Advanced settings** → add the Authorization header.

---

## Local Development

```bash
# Run locally with D1 simulator
npm run dev

# Run migration on local DB
npm run db:migrate

# Dev server runs at http://localhost:8787
# Test health: curl http://localhost:8787/health
# Test MCP: curl -X POST http://localhost:8787/mcp \
#   -H "Content-Type: application/json" \
#   -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

---

## Tech Stack

| Component     | Technology                 | Why                                                       |
| ------------- | -------------------------- | --------------------------------------------------------- |
| Runtime       | Cloudflare Workers         | Free, always on, global edge, no cold starts              |
| Database      | Cloudflare D1 (SQLite)     | Free 5GB, built-in FTS5 search, zero config               |
| MCP Transport | Streamable HTTP (`/mcp`)   | Works with Claude.ai Custom Connectors + Claude Code      |
| Session State | Durable Objects (McpAgent) | Handles MCP protocol lifecycle automatically              |
| Search        | SQLite FTS5                | Full-text search with ranking, no external service needed |
| Auth          | Optional Bearer token      | Simple API key via Wrangler secrets                       |

The entire server is a single TypeScript file (~1700 lines). No frameworks, no ORMs, no build complexity.

---

## Deduplication

Context Hub automatically prevents duplicate data at the database level:

| Table            | Strategy                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| **identity**     | `ON CONFLICT(key) DO UPDATE` — same key always updates                                          |
| **memories**     | 3-layer check: exact match → FTS5 fuzzy match (>60% word overlap) → updates existing if similar |
| **instructions** | Exact content + type match → refreshes instead of duplicating                                   |
| **context_log**  | Same summary + source within 5 minutes → skipped                                                |
| **projects**     | `ON CONFLICT(name) DO UPDATE` — same name always updates                                        |

This means Claude can aggressively save memories without worrying about duplicates. The tools are designed to be called liberally.

---

## Roadmap

- [x] `npx create-context-hub` — one-command scaffolding for new users
- [x] Import/export to JSON for backup and portability
- [ ] Semantic search with embeddings (Cloudflare Workers AI, free tier)
- [ ] Web dashboard for browsing memories (Cloudflare Pages, free)
- [ ] Multi-user support with OAuth authentication
- [ ] Automatic context summarization for long memory lists
- [ ] Tags analytics and memory graph visualization

---

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

[MIT](LICENSE)

---

**Built for developers who hop between AI tools and are tired of repeating themselves.**
