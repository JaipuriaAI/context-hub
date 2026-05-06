---
slug: sync-claude-to-claude-code
title: "Sync Claude.ai memories into Claude Code"
description: "Save a product decision in your browser, then ask Claude Code in your terminal to use that exact context — without re-explaining anything. Here's how."
kicker: "Workflow"
order: 1
publishedAt: "2026-05-06"
keywords:
  - sync Claude memories
  - Claude.ai to Claude Code
  - MCP context sync
  - shared AI memory
  - cross-client AI context
ogImagePrompt: "Two glowing windows connected by a rainbow cable — Claude.ai browser on the left, Claude Code terminal on the right, sharing a context layer between them"
---

You know what kills more AI workflows than bad prompts? Telling the same story twice.

I'd spend 20 minutes in Claude.ai working through a product decision — the constraints, the tradeoffs, the reason we picked option B over A. Then I'd switch to Claude Code in my terminal to actually ship the change, and the model had no idea who I was, what I'd decided, or why.

So I'd paste a 400-word recap. Claude Code would echo back "got it" and then write code that quietly contradicted three things we'd just agreed on in the browser. Because of course it did. It never read the conversation. It just pattern-matched on the recap.

Multiply that by ten decisions a week and you're spending an hour a day re-explaining yourself to your own tools.

This is the use case Context Hub was built for first.

---

## The actual problem (not the marketing version)

The real friction isn't "Claude.ai and Claude Code are different products." It's that **memory in AI clients is a per-client database**.

- Claude.ai has its own memory toggle, stored in Anthropic's web product
- Claude Code stores conversation state per-session in your local `.claude` directory
- ChatGPT memory lives in OpenAI's account model
- Cursor remembers things differently than any of them

Each AI client treats your context as proprietary state. They don't talk to each other. They were never designed to.

So if you decide something important in one place, you carry it manually to the next. Your brain becomes the integration layer.

That's fine if you use one tool. The minute you use two, the context tax shows up.

---

## What "shared memory" actually means here

Context Hub is a Model Context Protocol (MCP) server. MCP is the protocol Anthropic released that lets any AI client read from and write to a shared external source — files, databases, APIs, your memory. Cursor, Claude Code, ChatGPT (via custom connectors), Perplexity (via spaces with MCP), and Claude.ai all speak it.

The trick is that MCP servers are usually for things like "let the AI read my Notion" or "let it run SQL queries." Context Hub flips that: it's an MCP server whose only job is **storing the things you'd otherwise have to repeat**.

You write `claude.save_memory("we decided to use Postgres over Supabase for the migration tracker because of vendor-lock concerns")` in Claude.ai. The memory lands in a Cloudflare D1 row tagged with the source client (`claude.ai`), a timestamp, and a project tag. Five minutes later, you open Claude Code in your terminal, ask it about the migration tracker, and it pulls the same memory before answering. Same row. Same source of truth.

No paste. No recap. No drift.

---

## What this looks like in practice

Here's a real workflow I run multiple times a day.

**Step 1 — Decide something in the browser.**

In Claude.ai I'm working through whether to ship a feature flag in the next release. After 15 minutes of back-and-forth, I land on: _"Ship behind a feature flag, default off, gradual rollout to power users first. Reason: previous launch broke for 3% of users, can't afford that again."_

I tell Claude to save that as a project decision. It calls the `save_decision` tool on Context Hub. Done.

**Step 2 — Switch to the terminal.**

I open Claude Code in the project directory. Type:

> "I'm implementing the new export feature. What did we decide about the rollout strategy?"

Claude Code calls `search_decisions("export feature rollout")`. It finds the decision I saved 15 minutes ago in the browser. It quotes the exact reasoning back to me before writing any code.

**Step 3 — Ship.**

The implementation Claude Code writes uses a feature flag, defaults off, with a comment explaining the gradual rollout reasoning. I didn't have to dictate any of that. It read the decision and acted on it.

The whole interaction took 90 seconds in the terminal. The memory saved 12 minutes of recap I would have otherwise had to write.

---

## What I learned the hard way

Three things broke when I first tried this.

**1. Untagged memories rot fast.** My first version of Context Hub stored everything as flat text. Within a week I had 200 memories and no way to find anything. The fix was making "project" a first-class field, not a tag — every memory belongs to a project, and the AI client passes the current working-directory project name on every read.

**2. Source attribution matters more than I expected.** I almost shipped without tracking which client wrote each memory. Then I noticed Claude Code occasionally writing memories that contradicted things Claude.ai had said earlier. Without knowing the source, I couldn't tell if I'd changed my mind or if a model had hallucinated. Now every memory carries `source: "claude.ai" | "claude-code" | "chatgpt" | ...` and the UI shows it on every entry.

**3. Memory size is a real performance constraint.** Claude.ai's MCP integration reads the full memory store at session start. If you have 500 memories, that's a lot of tokens before the user types anything. Context Hub limits the default fetch to the 50 most recent + any matching the current project, with explicit `search_memory` for digging deeper. This kept first-token latency under 800ms even with thousands of stored items.

These aren't AI breakthroughs. They're the boring infrastructure decisions that make AI clients usable across a real workflow.

---

## Setup, in one command

```bash
npx create-context-hub
```

That command does five things:

1. Scaffolds a Cloudflare Workers + D1 project in your current directory
2. Provisions a free D1 database tied to your Cloudflare account
3. Runs the schema migrations
4. Deploys the MCP server to Cloudflare's edge
5. Prints connection instructions for Claude.ai, Claude Code, ChatGPT, Cursor, and Perplexity

Total time on a fresh machine: about 4 minutes. Total cost: $0 if you stay inside Cloudflare's free tier (and you will — D1's free tier is generous for personal-scale memory).

For Claude.ai, you add the MCP server URL in Settings → Connectors. For Claude Code, you add it via `claude mcp add` in your terminal. Both clients now read and write to the same D1 row store.

---

## What this isn't

This isn't a way to make Claude.ai and Claude Code feel like the same product. They're not. The browser is for thinking. The terminal is for shipping. They have different ergonomics for good reasons.

What Context Hub does is make the **decisions and constraints** portable between them. The conversation stays in each tool. The conclusions follow you everywhere.

If that sounds like a small thing, you're probably not running this workflow daily. If you are, you already know what an hour a day back is worth.

---

## Related workflows

- [Build a personal MCP memory server for $0/month](/use-cases/personal-mcp-memory-server)
- [Share context between ChatGPT, Perplexity, and Cursor](/use-cases/share-context-multi-client)

---

_Context Hub is open source. The CLI is `create-context-hub` on npm. The repo lives at [github.com/JaipuriaAI/context-hub](https://github.com/JaipuriaAI/context-hub)._
