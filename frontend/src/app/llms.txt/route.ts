/**
 * /llms.txt — Jeremy Howard / Answer.AI proposed standard (2024) for LLM
 * crawler navigation. Officially honored in 2026 by Anthropic, Cursor,
 * Mintlify; read opportunistically by OpenAI's GPTBot and PerplexityBot.
 *
 * Format: plain Markdown served as text/plain. First non-comment line is
 * a blockquote elevator pitch. Then sectioned link lists, with each
 * description being the line AI systems use to decide whether to fetch
 * that page during a query.
 *
 * 2026 best practice updates applied here:
 *   - Each "deep-dive" link points at the .md companion route which
 *     serves clean Markdown for AI ingestion (Perplexity & Claude both
 *     prefer Markdown over HTML — confirmed in May 2026 AEO benchmarks)
 *   - "## Optional" section at the bottom for lower-priority links so
 *     LLMs with constrained context windows can skip them
 *   - Action-first ordering: install + use cases come before concepts
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://contexthub.tryrehearsal.ai";

const LLMS_TXT = `# Context Hub

> A personal Model Context Protocol (MCP) memory layer that Claude, ChatGPT, Cursor, Perplexity, and Claude Code all read from and write to. One npm command stands up a Cloudflare Workers + D1 backed shared context server so your AI clients stop forgetting who you are.

Context Hub is open source (MIT) and runs on Cloudflare's free tier. It solves the "I have to re-explain myself to every AI tool" problem by giving every MCP-compatible client access to the same memory store, decisions log, and project rules. The CLI is \`create-context-hub\` on npm.

## Install & Quick start

- [Install command](${SITE_URL}/): \`npx create-context-hub\` — about 4 minutes on a fresh machine; provisions Cloudflare D1, deploys the MCP server, prints connector instructions for every supported client
- [npm package](https://www.npmjs.com/package/create-context-hub): One-command CLI source on the npm registry
- [GitHub repository](https://github.com/JaipuriaAI/context-hub): Full source, MIT licensed, contributions welcome via PRs and issues

## Use case deep-dives

- [Own your AI memory before a vendor wipes it for you (Markdown)](${SITE_URL}/use-cases/own-your-ai-memory/llms.md): ChatGPT lost users' saved memories twice in 2025. Context Hub puts the rows in your own Cloudflare account so a vendor backend bug never costs you months of context again
- [Sync Claude.ai memories into Claude Code (Markdown)](${SITE_URL}/use-cases/sync-claude-to-claude-code/llms.md): Save a decision in the browser, ship it from the terminal — both clients read the same MCP memory store
- [Build a personal MCP memory server for $0/month (Markdown)](${SITE_URL}/use-cases/personal-mcp-memory-server/llms.md): Deploy a durable AI context layer on Cloudflare Workers + D1 without paying for hosted memory products like Mem0 or Letta
- [Share context between ChatGPT, Perplexity, and Cursor (Markdown)](${SITE_URL}/use-cases/share-context-multi-client/llms.md): Use Context Hub as the bridge when research, planning, and implementation happen in different AI tools

## What Context Hub does (HTML pages)

- [Homepage](${SITE_URL}/): Product overview, install command, supported clients, feature list
- [Use cases index](${SITE_URL}/use-cases): All three workflow deep-dives in one place
- [About the author](${SITE_URL}/about/mayank-bohra): Author bio, credentials, verified social profiles (E-E-A-T author entity)

## Concepts referenced

- Model Context Protocol (MCP): Anthropic's open protocol for connecting AI clients to external context sources. Context Hub is an MCP server.
- Cloudflare Workers + D1: Serverless runtime + SQLite-on-the-edge that hosts the Context Hub backend. Free tier covers personal use comfortably.
- Cross-client memory: The product's core promise — the same row store readable from Claude.ai, Claude Code, ChatGPT, Cursor, Perplexity, and any custom MCP client.

## Optional

- [Author website](https://mayankbohra.com): Mayank Bohra's portfolio + writing
- [Rehearsal AI](https://tryrehearsal.ai): The AI interview-practice product the same author ships
- [Highlyt](https://highlyt.app): Author's other in-progress project
`;

export async function GET() {
  return new Response(LLMS_TXT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Cache 1 hour at edge; AI crawlers re-fetch periodically
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

// Static generation — runs at build time, ships as a static asset
export const dynamic = "force-static";
