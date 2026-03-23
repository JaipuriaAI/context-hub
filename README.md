# Claude Context Hub

**Your personal AI context layer — bridging Claude.ai, Claude Code, and the Claude App.**

Stop repeating yourself across Claude interfaces. Context Hub is a shared MCP server that gives all your Claude sessions access to the same memories, projects, instructions, and identity. Brainstorm on your phone during your commute, pick up right where you left off in Claude Code on your laptop.

**Built on Cloudflare Workers (free tier). Costs $0/month. Always on. No cold starts.**

---

## The Problem

Claude.ai, Claude Code, and the Claude App each maintain **separate context**:

- Memories saved in Claude.ai aren't available in Claude Code
- Project instructions set up in Claude.ai don't transfer to your terminal
- You end up re-explaining who you are, what you're working on, and how you prefer responses — every time you switch interfaces
- There's no official API to sync this data between interfaces

## The Solution

Context Hub is a single MCP server that **both Claude.ai and Claude Code connect to simultaneously**. It becomes your shared source of truth:

| What's Stored | Example |
|---|---|
| **Memories** | "Mayank prefers FastAPI over Django for new projects" |
| **Projects** | Name, description, and custom instructions per project |
| **Instructions** | "Always use TypeScript. Never suggest ORMs." |
| **Identity** | Name, role, expertise, location, tools, education |
| **Context Log** | Breadcrumb trail: "Discussed OAuth2 on phone at 3pm" |

## Architecture

```
Claude App (Phone)  ──────┐
                          │  Custom Connector (HTTPS)
Claude.ai (Browser) ──────┤
                          ▼
                 ┌──────────────────┐
                 │  Context Hub     │    Cloudflare Workers
                 │  MCP Server      │    Free tier ($0/month)
                 │                  │    Always on, global edge
                 │  24 MCP tools    │    No cold starts
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │  Cloudflare D1   │    Free SQLite database
                 │  (5GB free)      │    5M reads/day
                 │                  │    100K writes/day
                 └──────────────────┘
                          ▲
                          │  HTTP transport
                 ┌────────┴─────────┐
                 │  Claude Code     │
                 │  (your laptop)   │
                 └──────────────────┘
```

## Cost: $0/month Forever

Runs entirely on Cloudflare's free tier with massive headroom:

| Resource | Free Limit | Typical Usage | Headroom |
|----------|-----------|---------------|----------|
| Worker Requests | 100,000/day | ~250/day | 400x |
| D1 Storage | 5 GB | ~10 MB (10K memories) | 500x |
| D1 Reads | 5M/day | ~500/day | 10,000x |
| D1 Writes | 100K/day | ~50/day | 2,000x |

---

## Quick Start (5 Steps, ~10 minutes)

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)

### Step 1: Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/claude-context-hub.git
cd claude-context-hub
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

### Step 5: Connect to Claude

#### Claude.ai + Claude App (phone)

1. Go to [claude.ai/settings/connectors](https://claude.ai/settings/connectors)
2. Scroll to the bottom and click **"Add custom connector"**
3. Enter your Worker URL with `/mcp` appended:
   ```
   https://claude-context-hub.YOUR_SUBDOMAIN.workers.dev/mcp
   ```
4. Click **Add**, then click **Connect**

That's it! The connector works across Claude.ai on browser AND the Claude App on your phone — same account, same connector.

#### Claude Code (terminal)

```bash
claude mcp add --transport http --scope user context-hub \
  https://claude-context-hub.YOUR_SUBDOMAIN.workers.dev/mcp
```

This adds Context Hub globally — available in every Claude Code session, every project.

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

### Test cross-interface sync

1. **On your phone** (Claude App): "I'm thinking about adding OAuth2 to the auth system. Save this thought."
2. **On your laptop** (Claude Code): "What was I thinking about on my phone? Check recent context."

Claude Code will show your phone brainstorm instantly.

---

## Example Prompts

Here are real prompts you can use with Context Hub. These work in Claude.ai, Claude App, and Claude Code:

### Setting up your identity

> "Save my identity in Context Hub: I'm Sarah Chen, a senior backend engineer at Acme Corp, based in Singapore. I specialize in Go, PostgreSQL, and distributed systems. I use VS Code, Claude Code, and Docker daily."

### Saving preferences as instructions

> "Save these as instructions in Context Hub: Always use TypeScript for new projects. Prefer functional programming patterns. Keep responses concise. Use dark mode examples in code snippets."

### Creating a project

> "Create a project in Context Hub called 'payments-v2' — it's a Stripe integration rewrite using PaymentIntents API. Key constraint: must support both one-time and subscription payments. We decided to use webhooks over polling."

### Brainstorming on your phone, continuing on laptop

**Phone (Claude App):**
> "Log this context: I've been thinking about migrating from REST to tRPC for the internal dashboard. Main reasons are type safety and reduced boilerplate. Need to evaluate bundle size impact."

**Laptop (Claude Code):**
> "What context was logged recently? I was thinking about something on my commute."

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

| Tool | What It Does | Smart Behavior |
|------|-------------|----------------|
| `save_memory` | Save a memory with category, tags, source. Auto-deduplicates. | Detects category from context: "I prefer X" → preference, "decided to use X" → decision |
| `update_memory` | Update an existing memory by ID. Only changes the fields you provide. | "change memory #X" or "fix that memory" → pass only the fields to change, rest preserved |
| `search_memories` | Full-text search across all memories | Uses natural language keywords, tries synonyms if no results |
| `list_recent_memories` | List recent memories with smart limits | "show all" → 500 results, "show recent" → 15, default 100 |
| `delete_memory` | Remove a memory by ID | — |

### Decisions (2 tools)

| Tool | What It Does | Smart Behavior |
|------|-------------|----------------|
| `save_decision` | Save a decision with reasoning and rejected alternatives. Stored as structured memory. | "let's go with X because Y" → extract decision, reasoning, alternatives. Always capture the WHY |
| `search_decisions` | Search only decisions with full reasoning context | "why did we decide X?" → searches decision memories, optionally filtered by project |

### Projects (4 tools)

| Tool | What It Does | Smart Behavior |
|------|-------------|----------------|
| `save_project` | Create/update a project with description and instructions | Upserts — safe to call repeatedly with updated info |
| `get_project` | Get project details + custom instructions | Use before working on a project to load its context |
| `list_projects` | List all projects | Default: active only. User says "all" → includes archived |
| `archive_project` | Soft-delete a project (data preserved, hidden from active lists) | "I'm done with project X" → archives it. Reactivate by calling save_project again |

### Instructions (3 tools)

| Tool | What It Does | Smart Behavior |
|------|-------------|----------------|
| `save_instruction` | Save a global behavior rule. Auto-deduplicates. | Auto-categorizes: "always/never" → behavior, tone/format → style, tech constraints → constraint |
| `get_instructions` | Get all active instructions | Call at session start to know user's behavior preferences |
| `delete_instruction` | Remove an instruction by ID | "remove that rule" or "delete instruction #X" → permanently removes the instruction |

### Identity (2 tools)

| Tool | What It Does | Smart Behavior |
|------|-------------|----------------|
| `set_identity` | Set/update identity fields | Upserts. Proactive — saves identity details mentioned in passing |
| `get_identity` | Get full identity profile | Call FIRST at every session start |

### Context Log (2 tools)

| Tool | What It Does | Smart Behavior |
|------|-------------|----------------|
| `log_context` | Leave a breadcrumb for other sessions | Auto-deduplicates within 5 minutes. Set source to match current interface |
| `get_recent_context` | See what happened in other sessions | "on my phone" → filters by claude-app, "in browser" → claude-ai |

### Import/Export (2 tools)

| Tool | What It Does | Smart Behavior |
|------|-------------|----------------|
| `export_hub` | Export ALL data as structured JSON for backup/portability | "backup my hub" or "export my data" → returns complete JSON snapshot of all tables |
| `import_hub` | Import data from a JSON export with dedup protection | "restore from backup" → merges data, skips duplicates, reports import counts |

### Composite (3 tools)

| Tool | What It Does | Smart Behavior |
|------|-------------|----------------|
| `get_full_context` | **Session-start powerhouse** — returns identity + instructions + projects + memories + context in one call | THE most important tool. Call FIRST before anything else |
| `get_project_context` | Load everything relevant to ONE project — details, instructions, memories, decisions, context logs | "load project X" or "catch me up on project Y" → project-focused version of get_full_context |
| `list_all_data` | Complete inventory of everything in the hub | For "show me everything" — returns ALL data, no truncation |

### Analytics (1 tool)

| Tool | What It Does | Smart Behavior |
|------|-------------|----------------|
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
-- memories: things Claude learns about you
memories (id, content, category, tags, source, created_at, updated_at)
-- FTS5 full-text search index on memories

-- projects: workspace-level context
projects (id, name UNIQUE, description, instructions, status, created_at, updated_at)

-- instructions: global behavior directives
instructions (id, type, content, priority, active, created_at, updated_at)

-- identity: who you are
identity (id, key UNIQUE, value, created_at, updated_at)

-- context_log: cross-interface breadcrumbs
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

| Component | Technology | Why |
|---|---|---|
| Runtime | Cloudflare Workers | Free, always on, global edge, no cold starts |
| Database | Cloudflare D1 (SQLite) | Free 5GB, built-in FTS5 search, zero config |
| MCP Transport | Streamable HTTP (`/mcp`) | Works with Claude.ai Custom Connectors + Claude Code |
| Session State | Durable Objects (McpAgent) | Handles MCP protocol lifecycle automatically |
| Search | SQLite FTS5 | Full-text search with ranking, no external service needed |
| Auth | Optional Bearer token | Simple API key via Wrangler secrets |

The entire server is a single TypeScript file (~1700 lines). No frameworks, no ORMs, no build complexity.

---

## Deduplication

Context Hub automatically prevents duplicate data at the database level:

| Table | Strategy |
|---|---|
| **identity** | `ON CONFLICT(key) DO UPDATE` — same key always updates |
| **memories** | 3-layer check: exact match → FTS5 fuzzy match (>60% word overlap) → updates existing if similar |
| **instructions** | Exact content + type match → refreshes instead of duplicating |
| **context_log** | Same summary + source within 5 minutes → skipped |
| **projects** | `ON CONFLICT(name) DO UPDATE` — same name always updates |

This means Claude can aggressively save memories without worrying about duplicates. The tools are designed to be called liberally.

---

## Roadmap

- [ ] `npx create-context-hub` — one-command scaffolding for new users
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

**Built for developers who use Claude everywhere and are tired of repeating themselves.**
