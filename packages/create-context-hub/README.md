# create-context-hub

[![npm version](https://img.shields.io/npm/v/create-context-hub)](https://www.npmjs.com/package/create-context-hub)
[![npm downloads](https://img.shields.io/npm/dm/create-context-hub)](https://npm-stat.com/charts.html?package=create-context-hub)
[![license](https://img.shields.io/npm/l/create-context-hub)](https://github.com/JaipuriaAI/context-hub/blob/main/LICENSE)

Set up a [Context Hub](https://github.com/JaipuriaAI/context-hub) in one command. No cloning, no manual config, no guesswork.

```bash
npx create-context-hub
```

> **What's new in 0.2.0:** Context Hub now works with **any MCP client** — Claude.ai, Claude Code, Claude App, ChatGPT connectors, Perplexity, Cursor, Windsurf, Zed, and custom agents. The `source` tag on every memory and log entry is auto-detected from the MCP client's self-reported name during the `initialize` handshake, so you always know which tool wrote each entry.

## The Problem

Every AI tool maintains its own separate context. A memory saved in Claude.ai isn't available in Claude Code, ChatGPT, or Perplexity. You re-explain yourself every time you switch tools. There's no cross-vendor API to bridge them.

## What This Creates

A shared MCP server on Cloudflare Workers that every MCP-speaking AI client connects to simultaneously. It stores:

- **Memories** — preferences, facts, learnings
- **Decisions** — what you chose and why
- **Projects** — descriptions and custom instructions per project
- **Instructions** — global behavior rules ("always use TypeScript")
- **Identity** — name, role, expertise, location
- **Context Log** — breadcrumbs across sessions ("discussed auth on phone at 3pm")

24 MCP tools. Full-text search (FTS5). 3-layer deduplication. Runs on Cloudflare's free tier — $0/month.

## How It Works

```
npx create-context-hub
        │
        ├── 1. Prompts for project name
        ├── 2. Scaffolds project files (MCP server, migration SQL, configs)
        ├── 3. Runs npm install
        ├── 4. Authenticates with Cloudflare (opens browser)
        ├── 5. Creates a D1 database on your Cloudflare account
        ├── 6. Patches wrangler.json with the database ID
        ├── 7. Runs database migration (creates 5 tables + FTS indexes)
        ├── 8. Deploys to Cloudflare Workers → gives you a live URL
        ├── 9. (Optional) Generates an API key + sets it as a Wrangler secret
        ├── 10. (Optional) Runs `claude mcp add` to connect Claude Code
        └── 11. Prints connector instructions for every MCP client
                (Claude.ai/App, ChatGPT, Perplexity, Cursor, etc.) + summary
```

If any step fails, the CLI prints the exact command to run manually. The scaffolded project is always valid — worst case, you finish 2-3 steps yourself.

## What Gets Deployed

```
Claude App (Phone) ─────┐
Claude.ai (Browser) ────┤
ChatGPT (Connector) ────┤   MCP / Custom Connector (HTTPS)
Perplexity ─────────────┤
Cursor / Windsurf ──────┤
Any MCP client ─────────┤
                        ▼
               ┌──────────────────┐
               │  Your MCP Server │    Cloudflare Workers
               │  (24 tools)      │    Free tier ($0/month)
               │                  │    Always on, global edge
               │  Auto-detects    │    source = MCP client name
               │  the caller      │    (claude-code, chatgpt, …)
               └────────┬─────────┘
                        │
                        ▼
               ┌──────────────────┐
               │  Cloudflare D1   │    SQLite database
               │  (5GB free)      │    5M reads/day
               └──────────────────┘
                        ▲
                        │  HTTP transport (MCP)
               ┌────────┴─────────┐
               │  Claude Code /   │
               │  any terminal    │
               │  MCP client      │
               └──────────────────┘
```

## Requirements

- **Node.js** 18+
- A free **[Cloudflare account](https://dash.cloudflare.com/sign-up)**
- **Claude Code** (optional, for auto-configuration)

## Usage

```bash
# Interactive — prompts for project name
npx create-context-hub

# Pass project name directly
npx create-context-hub my-hub

# Scaffold only (skip Cloudflare setup)
# Answer "No" when prompted for Cloudflare setup
npx create-context-hub my-hub

# Update an existing hub to the latest template (run from the project directory)
cd my-hub
npx create-context-hub@latest update

# Forgot where your hub lives? Scan common directories:
npx create-context-hub@latest locate

# Help
npx create-context-hub --help
```

## What Gets Scaffolded

```
my-hub/
├── src/
│   └── index.ts            # MCP server (24 tools, ~1700 lines)
├── migrations/
│   └── 0001_init.sql       # Database schema (5 tables + FTS5 indexes)
├── wrangler.json            # Cloudflare Workers config (auto-patched with DB ID)
├── package.json             # Dependencies: @modelcontextprotocol/sdk, agents
├── tsconfig.json
└── .gitignore
```

## After Setup

Once deployed, verify it works from every MCP client you connect:

**In Claude.ai or Claude App:**

> "Who am I? Check your Context Hub."

**In Claude Code:**

> "What do you know about me? Check context hub."

**In ChatGPT / Perplexity / Cursor / any other MCP client:**

> "List my recent memories from context hub."

**Cross-client sync:**

1. On your phone (Claude App): "Save this thought: consider migrating to tRPC for the dashboard"
2. In ChatGPT (browser): "What was I thinking about on my phone?"
3. In Claude Code (terminal): "Show me everything discussed in ChatGPT today."

Each entry is tagged with the `source` of the client that wrote it (`claude-app`, `chatgpt`, `claude-code`, …) — auto-detected from the MCP client's self-reported name.

## Finding your hub

Forgot where you scaffolded your hub? The CLI scans common project directories (`~/Documents`, `~/Projects`, `~/code`, `~/dev`, `~/Developer`, `~/workspace`, `~/src`, cwd, and `~` shallow) for anything with the Context Hub fingerprint (`wrangler.json` + `src/index.ts` + `migrations/0001_init.sql` + `CONTEXT_HUB` durable object binding):

```bash
npx create-context-hub@latest locate
```

Example output:

```
┌   create-context-hub locate
◇  Found 1 Context Hub project.
│
│    [1] /Users/you/Projects/my-hub
│        Worker:   my-hub
│        D1 Name:  my-hub-db (0123abcd-...)
│
●  Next steps:
│    cd /Users/you/Projects/my-hub
│    npx create-context-hub@latest update
│    npx wrangler deploy
│
└  Done.
```

If it finds nothing, try the manual fallback:

```bash
# Search anywhere under your home directory
find ~ -name "wrangler.json" -not -path "*/node_modules/*" -exec grep -l "CONTEXT_HUB" {} \; 2>/dev/null
```

Or open your [Cloudflare Workers dashboard](https://dash.cloudflare.com/?to=/:account/workers) — the Worker will be listed there under whatever name you scaffolded with.

## Updating

Your Context Hub is a live MCP server. The CLI has a built-in `update` command that pulls the latest `src/index.ts` and `migrations/` from the current template, preserving your `wrangler.json` (with your database ID), `package.json`, and any customizations.

```bash
cd my-hub
npx create-context-hub@latest update
```

The update flow:

1. Detects that you're in a scaffolded Context Hub project (by checking for `wrangler.json`, `src/index.ts`, `migrations/0001_init.sql`)
2. Shows you exactly which files will change and the line-count delta
3. Writes `.bak` copies of files before overwriting (easy rollback)
4. Optionally runs `npx wrangler deploy` for you

All connected MCP clients pick up the new tool schemas on their next conversation. In Claude Code, run `/mcp` to refresh immediately.

### Manual alternative

If you prefer not to use the `update` command, you can pull the latest `src/index.ts` and `migrations/0001_init.sql` from the repo manually and run `npx wrangler deploy` yourself.

## Related

- [context-hub](https://github.com/JaipuriaAI/context-hub) — the full project with documentation, tool reference, and comparison with alternatives

## License

MIT
