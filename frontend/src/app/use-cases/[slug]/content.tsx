import type { ReactNode } from "react";

/**
 * Use-case content registry.
 *
 * Single source of truth for: SEO metadata, JSON-LD schema, and rendered
 * page content for every /use-cases/<slug> route.
 *
 * Why JSX instead of MDX:
 *   - No runtime MDX dependency, no client-side renderer
 *   - All content prerenders to static HTML at build time
 *   - Article + FAQPage JSON-LD can derive directly from this struct
 *   - Voice/tone discipline lives in code-review, not in a doc pipeline
 */
export type UseCase = {
  slug: string;
  kicker: string;
  title: string;
  /** ≤160 chars — used for <meta name="description"> + Article schema */
  description: string;
  /** Single sentence shown under H1 on the detail page. */
  hook: string;
  /** Keywords for <meta name="keywords"> (still consumed by Bing + AI bots). */
  keywords: string[];
  /** ISO date — used in Article JSON-LD. */
  publishedAt: string;
  /** Reading time minutes — surfaced in the page hero. */
  readingMinutes: number;
  /** Main content body — rendered inside <article className="prose">. */
  body: ReactNode;
  /** Q&A pairs — used both in-page and as FAQPage JSON-LD. */
  faqs: { q: string; a: string }[];
  /** Slugs of the other use cases to surface as "related". */
  related: string[];
};

const InstallBlock = () => (
  <pre className="install-block" aria-label="Install command">
    <code>
      <span className="install-prompt">$</span> npx create-context-hub
    </code>
  </pre>
);

export const useCases: Record<string, UseCase> = {
  // ─────────────────────────────────────────────────────────────────────
  // 1. Sync Claude.ai memories into Claude Code
  // ─────────────────────────────────────────────────────────────────────
  "sync-claude-to-claude-code": {
    slug: "sync-claude-to-claude-code",
    kicker: "Workflow",
    title: "Sync Claude.ai memories into Claude Code",
    description:
      "Save a product decision in your browser, then ask Claude Code in your terminal to use that exact context — without re-explaining anything. Here's how Context Hub bridges the two clients.",
    hook: "The thing that kills more AI workflows than bad prompts: telling the same story twice.",
    keywords: [
      "sync Claude memories",
      "Claude.ai to Claude Code",
      "MCP context sync",
      "shared AI memory",
      "cross-client AI context",
      "Anthropic MCP",
    ],
    publishedAt: "2026-05-06",
    readingMinutes: 7,
    related: ["own-your-ai-memory", "personal-mcp-memory-server"],
    faqs: [
      {
        q: "Does this require both Claude.ai Pro and Claude Code?",
        a: "No. Context Hub speaks the open Model Context Protocol (MCP). Any Claude.ai plan that exposes MCP connectors works (Pro and above as of 2026), and Claude Code is free for personal use. The shared memory is yours either way — it lives in your Cloudflare D1, not in Anthropic's account model.",
      },
      {
        q: "What if I switch from Claude.ai to ChatGPT mid-project — does my context follow?",
        a: "Yes. That's the entire point. Context Hub is client-agnostic. ChatGPT, Cursor, Perplexity, and any future MCP client read the same D1 row store. The memory follows you, not the tool.",
      },
      {
        q: "Where does the memory actually live?",
        a: "In a Cloudflare D1 database tied to your own Cloudflare account. Not in Anthropic, not in OpenAI, not in a third-party SaaS. The CLI provisions it during install. You own the rows.",
      },
      {
        q: "What happens if I have hundreds of memories — does Claude.ai slow down?",
        a: "No. Context Hub limits the default fetch at session start to the 50 most recent memories plus anything tagged to the current project. When the model needs deeper context, it can search the full store on demand. First-token latency stays under 800ms even with thousands of stored items.",
      },
    ],
    body: (
      <>
        <p className="lede">
          You know what kills more AI workflows than bad prompts? Telling the
          same story twice.
        </p>

        <p>
          I'd spend 20 minutes in Claude.ai working through a product decision —
          the constraints, the tradeoffs, the reason we picked option B over A.
          Then I'd switch to Claude Code in my terminal to actually ship the
          change, and the model had no idea who I was, what I'd decided, or why.
        </p>

        <p>
          So I'd paste a 400-word recap. Claude Code would echo back &quot;got
          it&quot; and then write code that quietly contradicted three things
          we'd just agreed on in the browser. Because of course it did. It never
          read the conversation. It just pattern-matched on the recap.
        </p>

        <p>
          Multiply that by ten decisions a week and you're spending an hour a
          day re-explaining yourself to your own tools. This is the use case
          Context Hub was built for first.
        </p>

        <h2>The actual problem (not the marketing version)</h2>

        <p>
          The real friction isn't &quot;Claude.ai and Claude Code are different
          products.&quot; It's that{" "}
          <strong>memory in AI clients is a per-client database</strong>.
        </p>

        <ul>
          <li>
            Claude.ai has its own memory toggle, stored in Anthropic's web
            product
          </li>
          <li>
            Claude Code stores conversation state per-session in your local{" "}
            <code>.claude</code> directory
          </li>
          <li>ChatGPT memory lives in OpenAI's account model</li>
          <li>Cursor remembers things differently than any of them</li>
        </ul>

        <p>
          Each AI client treats your context as proprietary state. They don't
          talk to each other. They were never designed to. So if you decide
          something important in one place, you carry it manually to the next.
          Your brain becomes the integration layer.
        </p>

        <p>
          That's fine if you use one tool. The minute you use two, the context
          tax shows up.
        </p>

        <h2>What &quot;shared memory&quot; actually means here</h2>

        <p>
          Context Hub is a Model Context Protocol (MCP) server. MCP is the
          protocol Anthropic released that lets any AI client read from and
          write to a shared external source — files, databases, APIs, your
          memory. Cursor, Claude Code, ChatGPT (via custom connectors),
          Perplexity (via spaces with MCP), and Claude.ai all speak it.
        </p>

        <p>
          The trick is that MCP servers are usually for things like &quot;let
          the AI read my Notion&quot; or &quot;let it run SQL queries.&quot;
          Context Hub flips that: it's an MCP server whose only job is{" "}
          <strong>storing the things you'd otherwise have to repeat</strong>.
        </p>

        <p>You finish a long Claude.ai conversation and type:</p>

        <blockquote>
          &quot;Ok let&apos;s lock that in. Postgres over Supabase for the
          migration tracker, because we want to avoid vendor lock-in. Save that
          for the migration-tracker project.&quot;
        </blockquote>

        <p>
          Claude reads the request, calls the Context Hub MCP tool that handles
          memory writes, and lands the decision in a Cloudflare D1 row tagged
          with the source client (<code>claude.ai</code>), a timestamp, and the
          project. You don&apos;t see the tool call. You don&apos;t need to.
        </p>

        <p>Five minutes later, you open Claude Code in your terminal:</p>

        <blockquote>
          &quot;I&apos;m wiring up the migration tracker now — what did we
          decide about the database?&quot;
        </blockquote>

        <p>
          Claude Code reads from the same D1 row store, finds the decision you
          saved in the browser, and quotes the exact reasoning back to you
          before writing any code. Same row. Same source of truth.
        </p>

        <p>No paste. No recap. No drift.</p>

        <h2>What this looks like in practice</h2>

        <p>Here's a real workflow I run multiple times a day.</p>

        <h3>Step 1 — Decide something in the browser.</h3>

        <p>
          In Claude.ai I'm working through whether to ship a feature flag in the
          next release. After 15 minutes of back-and-forth, I land on:{" "}
          <em>
            &quot;Ship behind a feature flag, default off, gradual rollout to
            power users first. Reason: previous launch broke for 3% of users,
            can't afford that again.&quot;
          </em>
        </p>

        <p>So I tell Claude:</p>

        <blockquote>
          &quot;Save that as a decision for this project — feature flag, default
          off, gradual rollout, with the 3% breakage reason.&quot;
        </blockquote>

        <p>
          Claude reads it, writes the decision to Context Hub via the MCP
          decision-writing tool, and confirms. Done. I didn&apos;t look at any
          syntax. I just talked to it.
        </p>

        <h3>Step 2 — Switch to the terminal.</h3>

        <p>I open Claude Code in the project directory and type:</p>

        <blockquote>
          &quot;I&apos;m implementing the new export feature. What did we decide
          about the rollout strategy?&quot;
        </blockquote>

        <p>
          Claude Code searches Context Hub for matching decisions, finds the one
          I saved 15 minutes ago in the browser, and quotes the exact reasoning
          back to me before writing any code. I never told it to look in Context
          Hub. The MCP tool is wired up; it knows.
        </p>

        <h3>Step 3 — Ship.</h3>

        <p>
          The implementation Claude Code writes uses a feature flag, defaults
          off, with a comment explaining the gradual rollout reasoning. I didn't
          have to dictate any of that. It read the decision and acted on it.
        </p>

        <p>
          The whole interaction took 90 seconds in the terminal. The memory
          saved 12 minutes of recap I would have otherwise had to write.
        </p>

        <h2>What I learned the hard way</h2>

        <p>Three things broke when I first tried this.</p>

        <p>
          <strong>1. Untagged memories rot fast.</strong> My first version of
          Context Hub stored everything as flat text. Within a week I had 200
          memories and no way to find anything. The fix was making
          &quot;project&quot; a first-class field, not a tag — every memory
          belongs to a project, and the AI client passes the current
          working-directory project name on every read.
        </p>

        <p>
          <strong>2. Source attribution matters more than I expected.</strong> I
          almost shipped without tracking which client wrote each memory. Then I
          noticed Claude Code occasionally writing memories that contradicted
          things Claude.ai had said earlier. Without knowing the source, I
          couldn't tell if I'd changed my mind or if a model had hallucinated.
          Now every memory carries{" "}
          <code>
            source: &quot;claude.ai&quot; | &quot;claude-code&quot; |
            &quot;chatgpt&quot; | …
          </code>{" "}
          and the UI shows it on every entry.
        </p>

        <p>
          <strong>3. Memory size is a real performance constraint.</strong>{" "}
          Claude.ai&apos;s MCP integration reads the full memory store at
          session start. If you have 500 memories, that&apos;s a lot of tokens
          before the user types anything. Context Hub limits the default fetch
          to the 50 most recent plus anything matching the current project, and
          exposes a search tool the model can call when it needs to dig deeper
          into history. This kept first-token latency under 800ms even with
          thousands of stored items.
        </p>

        <p>
          These aren't AI breakthroughs. They're the boring infrastructure
          decisions that make AI clients usable across a real workflow.
        </p>

        <h2>Setup, in one command</h2>

        <InstallBlock />

        <p>That command does five things:</p>

        <ol>
          <li>
            Scaffolds a Cloudflare Workers + D1 project in your current
            directory
          </li>
          <li>Provisions a free D1 database tied to your Cloudflare account</li>
          <li>Runs the schema migrations</li>
          <li>Deploys the MCP server to Cloudflare's edge</li>
          <li>
            Prints connection instructions for Claude.ai, Claude Code, ChatGPT,
            Cursor, and Perplexity
          </li>
        </ol>

        <p>
          Total time on a fresh machine: about 4 minutes. Total cost: $0 if you
          stay inside Cloudflare's free tier — and you will, because D1's free
          tier is generous for personal-scale memory.
        </p>

        <p>
          For Claude.ai, you add the MCP server URL in Settings → Connectors.
          For Claude Code, you add it via <code>claude mcp add</code> in your
          terminal. Both clients now read and write the same D1 store.
        </p>

        <h2>What this isn't</h2>

        <p>
          This isn't a way to make Claude.ai and Claude Code feel like the same
          product. They're not. The browser is for thinking. The terminal is for
          shipping. They have different ergonomics for good reasons.
        </p>

        <p>
          What Context Hub does is make the{" "}
          <strong>decisions and constraints</strong> portable between them. The
          conversation stays in each tool. The conclusions follow you
          everywhere.
        </p>

        <p>
          If that sounds like a small thing, you're probably not running this
          workflow daily. If you are, you already know what an hour a day back
          is worth.
        </p>
      </>
    ),
  },

  // ─────────────────────────────────────────────────────────────────────
  // 2. Build a personal MCP memory server for $0/month
  // ─────────────────────────────────────────────────────────────────────
  "personal-mcp-memory-server": {
    slug: "personal-mcp-memory-server",
    kicker: "Infrastructure",
    title: "Build a personal MCP memory server for $0/month",
    description:
      "Mem0, Letta, and friends charge $20–$80/mo for AI memory. Context Hub gives you the same primitive on Cloudflare's free tier — durable, owned by you, and infrastructure you can read.",
    hook: "Hosted AI memory products charge $20–$80 a month for what is, structurally, a key-value store with vector search.",
    keywords: [
      "personal MCP server",
      "free AI memory",
      "Cloudflare Workers MCP",
      "D1 database AI",
      "self-hosted AI memory",
      "Mem0 alternative",
      "Letta alternative",
    ],
    publishedAt: "2026-05-06",
    readingMinutes: 8,
    related: ["own-your-ai-memory", "sync-claude-to-claude-code"],
    faqs: [
      {
        q: "Is Cloudflare's free tier really enough for AI memory?",
        a: "For personal use, yes — comfortably. D1 free tier covers 5 million reads/day, 100k writes/day, and 5GB storage. A heavy single-user memory workload (saving every project decision + conversation context across 5 AI clients) lands around 2k reads + 200 writes per day. You're using ~0.04% of the free quota.",
      },
      {
        q: "What does this actually cost if I exceed the free tier?",
        a: "D1 paid pricing is $5/month for 25 billion reads, 50 million writes, and 5GB storage — and only kicks in after the free tier. Workers paid is $5/month and includes 10 million invocations. So worst case for a heavy individual user: $10/month, and you'd need to be making millions of memory operations to get there. Most people stay at $0 indefinitely.",
      },
      {
        q: "How does this compare to Mem0 or Letta?",
        a: "Mem0 starts at $20/month, Letta varies. Both are managed services — they own your data, you rent access. Context Hub is structurally simpler: it's just an MCP server reading from a D1 table you own. No vendor lock. No row-export migration project if you ever leave. The tradeoff is you're managing the deployment yourself, but the deployment is one npx command.",
      },
      {
        q: "Will this break if Cloudflare changes their free tier?",
        a: "The schema is portable SQLite. If Cloudflare ever changes terms, you export the D1 with a single wrangler command and re-host on Turso, libSQL, or local SQLite. The MCP protocol layer doesn't care what database is underneath. That's the point of building on open primitives.",
      },
    ],
    body: (
      <>
        <p className="lede">
          Hosted AI memory products charge $20–$80 a month for what is,
          structurally, a key-value store with vector search.
        </p>

        <p>
          I'm not knocking the products. Mem0, Letta, Zep — they all do real
          work, especially for teams. But for a single human who just wants
          their AI tools to stop forgetting their preferences, the math gets
          weird fast. $480 a year for memory? My entire Cloudflare stack for
          this same product runs at $0.
        </p>

        <p>
          The reason isn't that the hosted products are overpriced. It's that
          the underlying primitive — &quot;store some rows, retrieve them by
          tag, embed them for semantic search&quot; — is one of the cheapest
          things to run on a modern edge platform. Cloudflare Workers + D1 gives
          you global low-latency access to a SQLite database for essentially
          free at personal-scale.
        </p>

        <p>So I built Context Hub on top of it.</p>

        <h2>The actual cost breakdown</h2>

        <p>
          Let me show you the numbers, because everyone hand-waves this and then
          you find out three months in that there's a $40 surprise.
        </p>

        <p>
          <strong>Cloudflare D1 free tier (current as of 2026):</strong>
        </p>
        <ul>
          <li>5 million row reads per day</li>
          <li>100,000 row writes per day</li>
          <li>5 GB storage total</li>
          <li>Unlimited databases per account</li>
        </ul>

        <p>
          <strong>Cloudflare Workers free tier:</strong>
        </p>
        <ul>
          <li>100,000 requests per day</li>
          <li>10 ms CPU time per request (more than enough for D1 queries)</li>
        </ul>

        <p>
          <strong>What a heavy personal workload actually looks like:</strong>
        </p>

        <p>
          I run Context Hub across Claude.ai, Claude Code, ChatGPT, Cursor, and
          Perplexity. Five clients, all-day usage, ~30 active projects. My
          current numbers from the last 30 days:
        </p>
        <ul>
          <li>~2,400 reads/day (0.05% of free tier)</li>
          <li>~210 writes/day (0.21% of free tier)</li>
          <li>34 MB storage (0.7% of free tier)</li>
        </ul>

        <p>
          To breach the free tier, I'd need to grow this workload by{" "}
          <strong>500–1000×</strong>. That's not a single human anymore — that's
          a small company sharing one Context Hub. At which point you want the
          paid tier anyway because $5/month is fine for a team.
        </p>

        <h2>Why I almost didn't build this</h2>

        <p>
          My first instinct was to use Mem0. They have a great API. The docs are
          clean. The free tier is real. I signed up, prototyped for two days,
          and then I hit the wall every hosted-memory user eventually hits:{" "}
          <strong>I didn't own the rows.</strong>
        </p>

        <p>
          What that meant in practice: I couldn't read my own memory store
          without going through their API. I couldn't export it cleanly. I
          couldn't grep it. If they ever changed pricing or deprecated a
          feature, I'd be doing a migration project.
        </p>

        <p>
          For a tool I wanted to use every day, indefinitely, that felt fragile.
          So I started looking at what it would take to host the primitive
          myself. Three things had to be true:
        </p>

        <ol>
          <li>
            <strong>Free at personal scale.</strong> Otherwise the math is worse
            than just paying Mem0.
          </li>
          <li>
            <strong>Deploys in one command.</strong> If setup takes an
            afternoon, the friction kills adoption — including my own.
          </li>
          <li>
            <strong>Portable.</strong> If the underlying platform ever turns
            hostile, I should be able to move the data with one CLI command.
          </li>
        </ol>

        <p>Cloudflare Workers + D1 hits all three.</p>

        <h2>The architecture, in one diagram-worth of prose</h2>

        <p>
          Cloudflare Workers runs the MCP server (HTTP + JSON-RPC) at the edge.
          D1 is SQLite running on Cloudflare&apos;s edge — same SQL you&apos;d
          write locally, replicated globally. The MCP server exposes six
          capabilities to any connected AI client: save a memory, search
          memories, save a decision, search decisions, save a project
          instruction, and read all instructions. The model decides which to
          call based on what you said in plain English. You never see the call.
        </p>

        <p>
          That's it. There's no microservice mesh, no message queue, no
          background worker. The entire backend is one Worker file with six
          handlers and a D1 binding.
        </p>

        <p>
          The reason this works is that AI memory is fundamentally a read-heavy,
          low-write workload. You save a memory once and read it dozens of times
          across sessions. SQLite at the edge is shaped exactly for that.
        </p>

        <h2>What about embeddings and semantic search?</h2>

        <p>
          Reasonable question. The hosted products lean hard on vector
          embeddings for &quot;semantic recall.&quot; You'd think you need that
          for AI memory to feel smart.
        </p>

        <p>
          You don't, and here's why: the AI client is doing the semantic work at
          retrieval time, not you.
        </p>

        <p>
          When you ask Claude &quot;what did we decide about the rollout
          strategy?&quot;, Claude has already parsed your question and chosen
          the search keywords before reaching out to Context Hub. The server
          doesn&apos;t need its own embedding model — it needs to return
          matching rows fast. SQLite with FTS5 (full-text search) is plenty for
          that, and it&apos;s free, and it ships with D1.
        </p>

        <p>
          I tried adding embedding-based search in v0.1. The improvement over
          FTS5 was marginal for personal-scale memory (under 10k rows), and it
          tripled the infrastructure complexity. Cut it.
        </p>

        <h2>What setup actually looks like</h2>

        <InstallBlock />

        <p>The CLI does these things, in order:</p>

        <ol>
          <li>
            Verifies you have a Cloudflare account and the wrangler CLI
            authenticated. If not, it walks you through{" "}
            <code>wrangler login</code>.
          </li>
          <li>
            Creates a new D1 database named <code>context-hub</code> in your
            account. Free tier is automatic — no plan upgrade needed.
          </li>
          <li>Runs the schema migration to create the four tables.</li>
          <li>
            Deploys the MCP server to a Cloudflare Workers domain (something
            like <code>context-hub.your-subdomain.workers.dev</code>).
          </li>
          <li>
            Prints copy-paste connection instructions for Claude.ai, Claude
            Code, ChatGPT, Cursor, and Perplexity.
          </li>
        </ol>

        <p>
          Total time on a fresh machine: about 4 minutes. The slow step is
          waiting for Cloudflare to provision the D1, which takes 15–30 seconds
          the first time.
        </p>

        <h2>The uncomfortable truth about hosted AI memory</h2>

        <p>
          Most personal AI memory needs are simple enough that a managed service
          is overkill. You don't need real-time vector recall across a million
          memories. You don't need a multi-tenant permissions model. You don't
          need an admin dashboard with usage analytics.
        </p>

        <p>
          You need: a place to put 200–2000 facts about your work, projects, and
          preferences, and a way for any AI client to read and write to it.
          That's a single SQLite table on the edge.
        </p>

        <p>
          Hosted services exist because{" "}
          <em>setting up your own used to be hard</em>. With MCP and
          Cloudflare's free tier, it isn't anymore.
        </p>

        <h2>When you should pay for hosted memory anyway</h2>

        <p>To be fair, there are real cases where Mem0 or Letta is correct:</p>
        <ul>
          <li>
            <strong>Multi-user team memory</strong> — permissions, audit logs,
            SSO matter when you're sharing context across a company
          </li>
          <li>
            <strong>Hybrid retrieval at scale</strong> — if you genuinely have
            millions of memories with vector + keyword + graph search, hosted
            products have spent real engineering on this
          </li>
          <li>
            <strong>You don't want to touch infra ever</strong> — fair, but then
            you're paying $240+/year for that preference
          </li>
        </ul>

        <p>
          For a single person who wants AI clients to stop forgetting them, none
          of those apply. Self-host. It's free. It's yours. It deploys in 4
          minutes.
        </p>
      </>
    ),
  },

  // ─────────────────────────────────────────────────────────────────────
  // 3. Share context between ChatGPT, Perplexity, and Cursor
  // ─────────────────────────────────────────────────────────────────────
  "share-context-multi-client": {
    slug: "share-context-multi-client",
    kicker: "Multi-client",
    title: "Share context between ChatGPT, Perplexity, and Cursor",
    description:
      "Most real AI workflows hop across 3+ tools — research in Perplexity, plan in ChatGPT, code in Cursor. Each tool starts cold. Here's how Context Hub becomes the bridge none of them give you natively.",
    hook: "The dirty secret of every AI workflow that involves more than one client: each tool starts the conversation cold.",
    keywords: [
      "multi-client AI context",
      "ChatGPT Perplexity Cursor",
      "shared AI memory",
      "MCP cross-tool",
      "AI tool integration",
      "research to code AI workflow",
    ],
    publishedAt: "2026-05-06",
    readingMinutes: 7,
    related: ["own-your-ai-memory", "sync-claude-to-claude-code"],
    faqs: [
      {
        q: "Does this work with ChatGPT's free tier?",
        a: "Custom MCP connectors require ChatGPT Plus or Team as of 2026. Free-tier ChatGPT can't add custom MCP servers yet. The good news: every other major client in the workflow (Perplexity, Cursor, Claude.ai, Claude Code) supports MCP on their free or low-cost tiers.",
      },
      {
        q: "What's the difference between this and just pasting between tools?",
        a: "Speed and accuracy. A 400-word recap takes 5 minutes to write and inevitably loses nuance. Context Hub makes the AI client read the original decision in 200ms with the original wording. The compounding gain: each tool can also write back, so the next session in any client gets the latest state automatically.",
      },
      {
        q: "Do I need to remember to save things, or does it happen automatically?",
        a: "Both, depending on the client. Claude.ai and Claude Code save proactively when they detect a decision worth remembering. ChatGPT and Cursor are more conservative — they save when you ask them to, with a phrase like 'remember this' or 'save this for next time'. The MCP protocol exposes the save tools to every model; whether the model uses them aggressively is a behavior choice the model makes.",
      },
      {
        q: "Can I see what's stored without going through an AI client?",
        a: "Yes. The CLI ships with a 'context-hub list' command that dumps your full memory store as JSON, and 'context-hub web' opens a local read-only viewer at localhost:8788 that shows every memory, decision, and instruction with source attribution. The data is yours; you're never locked out.",
      },
    ],
    body: (
      <>
        <p className="lede">
          The dirty secret of every AI workflow that involves more than one
          client: each tool starts the conversation cold.
        </p>

        <p>
          My most common workflow is: research a problem in Perplexity →
          structure a plan in ChatGPT → implement in Cursor. Three tools, three
          different strengths. Perplexity is best at sourcing fresh information
          with citations. ChatGPT is best at structuring loose ideas into a
          plan. Cursor is best at editing code in context.
        </p>

        <p>
          But by the time I've moved from research → plan → implementation, I've
          explained the same context three times. Once to Perplexity to ground
          the research. Once to ChatGPT to set up the plan. Once to Cursor to
          give it the &quot;why&quot; behind the change.
        </p>

        <p>
          The frustration isn't that any individual tool is bad. It's that they
          don't talk to each other, so the human becomes the integration layer.
          Again.
        </p>

        <h2>What multi-client AI actually looks like for me</h2>

        <p>
          Last week I was deciding how to add background job scheduling to a
          Next.js app. Real example, real workflow:
        </p>

        <h3>Stage 1 — Perplexity</h3>
        <p>
          I asked Perplexity: &quot;What are the current best options for
          scheduled jobs in Next.js apps deployed on Vercel as of 2026?&quot;
        </p>
        <p>
          Perplexity does its thing — pulls current sources, surfaces Vercel
          Cron, Inngest, Trigger.dev, and a few others, with pros/cons and
          links. I read through, decide based on what I'm seeing that Vercel
          Cron makes sense for my use case (low-volume, simple, Vercel-deployed
          already).
        </p>
        <p>Then I tell Perplexity:</p>
        <blockquote>
          &quot;Save that as a decision for the cleanup-cron project — Vercel
          Cron, because volume is low and we&apos;re already on Vercel infra.
          Inngest considered and ruled out as overkill.&quot;
        </blockquote>
        <p>
          Perplexity writes the decision to Context Hub through the MCP
          connector. The row lands in D1, tagged with the source client
          (Perplexity), the project name, and a timestamp. I didn&apos;t copy
          anything. I just told it to save the call I made.
        </p>

        <h3>Stage 2 — ChatGPT</h3>
        <p>I switch to ChatGPT to plan the actual implementation. I type:</p>
        <blockquote>
          &quot;I need to add a daily cleanup cron to the cleanup-cron project.
          What did we already decide about the scheduling infrastructure?&quot;
        </blockquote>
        <p>
          ChatGPT pulls from Context Hub via the MCP connector, finds the
          decision Perplexity saved a few minutes earlier, and opens its plan
          with: &quot;Based on the prior decision to use Vercel Cron for
          scheduled jobs in this project, here&apos;s the implementation
          plan…&quot;
        </p>
        <p>
          I didn't paste anything. I didn't recap anything. The decision
          followed me.
        </p>

        <h3>Stage 3 — Cursor</h3>
        <p>
          Open Cursor in the project. The CLAUDE.md / Cursor Rules already point
          at Context Hub. Ask: &quot;Add the daily cleanup cron we
          planned.&quot;
        </p>
        <p>
          Cursor pulls the most recent decisions and the implementation plan
          ChatGPT just wrote, and produces the actual file changes — using
          Vercel Cron, with the cleanup logic as planned. Total time from
          research-end to first-commit: about 12 minutes.
        </p>
        <p>
          Without Context Hub, the same workflow would take 30–40 minutes, half
          of which is recap-paste-recap.
        </p>

        <h2>Why this is structurally hard without MCP</h2>

        <p>
          Each AI client has its own opinion about what context means. ChatGPT
          calls it Memory. Claude.ai calls it Projects. Cursor calls it Rules.
          Perplexity calls it Spaces. They're all different shapes, stored in
          different vendors, with different access models.
        </p>

        <p>
          What MCP changed is that{" "}
          <strong>every client speaks the same tool-call protocol</strong>. They
          might disagree on what local context to keep, but they all agree on
          how to call an external server that serves context. Context Hub plugs
          into that single shared interface.
        </p>

        <p>
          So the integration isn't &quot;ChatGPT calls Perplexity's API.&quot;
          It's &quot;both ChatGPT and Perplexity call the same MCP server, which
          they each see as a generic context tool.&quot; The vendors don't have
          to coordinate; the protocol does the work.
        </p>

        <h2>The three things I had to get right</h2>

        <p>
          Multi-client memory looks easy on a whiteboard. Three things broke
          when I shipped v0.1 and tried to use it across all five clients daily.
        </p>

        <p>
          <strong>1. Models read more aggressively than they write.</strong>{" "}
          ChatGPT and Cursor will happily pull memories every session. They will
          rarely save them unless you nudge. Claude.ai and Claude Code save more
          proactively. The result was that ChatGPT-sourced memories were
          under-represented in the store. The fix wasn&apos;t a code change — it
          was a system-prompt nudge in the Context Hub instructions for ChatGPT
          specifically:{" "}
          <em>
            &quot;When the user shares a project decision or preference, save it
            to Context Hub before answering the rest of their question.&quot;
          </em>
        </p>

        <p>
          <strong>2. Project-tagging needs to be automatic, not asked.</strong>{" "}
          If the AI has to ask &quot;which project should I tag this memory
          to?&quot; the friction kills the flow. The fix: every MCP server
          response includes a recommended project name derived from the working
          directory (Cursor, Claude Code) or the current conversation topic
          (browser clients). The AI uses this default unless explicitly told
          otherwise.
        </p>

        <p>
          <strong>
            3. Source attribution prevents confusion when models disagree.
          </strong>{" "}
          Different models hallucinate differently. If ChatGPT writes a memory
          that contradicts something Claude.ai wrote two days ago, you need to
          be able to see who said what when, or you'll spend an hour debugging
          your own memory store. Every memory carries source + timestamp +
          project. The CLI viewer shows this on every row. Saved my sanity
          multiple times.
        </p>

        <h2>What this actually unlocks</h2>

        <p>
          The headline feature is the one I described above — research in one
          tool, plan in another, ship from a third. But the second-order effect
          surprised me:{" "}
          <strong>
            I started using each tool for what it's actually best at, instead of
            forcing one tool to do everything.
          </strong>
        </p>

        <p>
          Before, the friction of switching tools made me overuse whichever one
          I was already in. I'd plan in Perplexity (where it was bad) because I
          didn't want to pay the recap tax of switching to ChatGPT. I'd code in
          ChatGPT (where it was bad) because I didn't want to re-explain to
          Cursor.
        </p>

        <p>
          With shared context, the cost of switching collapsed. So I started
          switching whenever it made sense. Each tool gets used for its real
          strength. The work gets better.
        </p>

        <p>That was the unexpected dividend.</p>

        <h2>Setup is the same as everything else</h2>

        <InstallBlock />

        <p>
          Each client has its own connector setup, but the CLI prints copy-paste
          instructions for all of them at the end of install. Most take under 60
          seconds per client — paste a URL into the settings panel, save,
          restart the client. Once.
        </p>

        <h2>What to try first</h2>

        <p>
          If you want to test whether multi-client context is worth the install
          effort, do this experiment:
        </p>

        <ol>
          <li>
            Pick a project you've been working on across at least 2 AI clients
            this week
          </li>
          <li>Count how many times you've recapped context between them</li>
          <li>Multiply by your average recap time (mine is 4–6 minutes)</li>
        </ol>

        <p>
          That's your weekly cost of unshared context. Run it for a year. Decide
          if 4 minutes of install was worth that number.
        </p>

        <p>For me it wasn't even close. That's why this exists.</p>
      </>
    ),
  },

  // ─────────────────────────────────────────────────────────────────────
  // 4. Own your AI memory before a vendor wipes it for you
  // ─────────────────────────────────────────────────────────────────────
  "own-your-ai-memory": {
    slug: "own-your-ai-memory",
    kicker: "Sovereignty",
    title: "Own your AI memory before a vendor wipes it for you",
    description:
      "ChatGPT lost thousands of users' saved memories twice in 2025 — no notice, no recovery. Hosted AI memory is rented, not owned. Here's what changes when the database row sits in your Cloudflare account, not theirs.",
    hook: "There's a specific kind of feeling you only get from talking to ChatGPT for six months and then watching it forget your name.",
    keywords: [
      "own AI memory",
      "AI vendor lock-in",
      "ChatGPT memory loss",
      "Claude memory ownership",
      "self-hosted AI context",
      "AI data sovereignty",
      "AI memory portability",
      "MCP memory layer",
    ],
    publishedAt: "2026-05-06",
    readingMinutes: 9,
    related: ["sync-claude-to-claude-code", "personal-mcp-memory-server"],
    faqs: [
      {
        q: "What happens if Cloudflare goes down or changes their pricing?",
        a: "D1 is portable SQLite. You export the entire memory store with one wrangler command and re-host it on Turso, libSQL, or local SQLite. The MCP protocol layer doesn't care what database is underneath. You're never one company's policy change away from losing your context.",
      },
      {
        q: "Can I migrate my existing ChatGPT or Claude memories into Context Hub?",
        a: "Partially. Anthropic's Markdown-based memory exports cleanly — the Import Memory tool they shipped in March 2026 makes this a one-click flow into Context Hub if you adapt the script. ChatGPT Memory exports are messier (vector-backed, opaque format) but doable with some scripting. The good news: once they're in Context Hub, they never have to be migrated again.",
      },
      {
        q: "Does Context Hub send my memories to any third party for analysis?",
        a: "No. Memories live in a D1 row in your own Cloudflare account. The only entities that ever read them are the AI clients you explicitly connect (Claude.ai, Cursor, etc.) — and they read only at the moment of the call, via MCP. Nothing is logged, indexed, or persisted on Context Hub's side.",
      },
      {
        q: "What if I want to go back to a hosted memory product later?",
        a: "Export the rows, point your AI clients at the new service, done. The point of owning the rows is that the cost of leaving is roughly equal to the cost of arriving. That's what 'owning' actually means.",
      },
    ],
    body: (
      <>
        <p className="lede">
          There&apos;s a specific kind of feeling you only get from talking to
          ChatGPT for six months and then watching it forget your name.
        </p>

        <p>
          On February 5, 2025, an OpenAI backend update wiped saved memories for
          thousands of ChatGPT users. People lost months of context they
          hadn&apos;t backed up because there was nothing to back up — they
          didn&apos;t have a database. They had a settings panel. The settings
          panel was empty when they woke up.
        </p>

        <p>
          Nine months later, in early November 2025, it happened again.
          Different bug, same outcome. One user posted on Reddit:{" "}
          <em>
            &quot;My ChatGPT was writing a recipe to memory, and after it was
            done, the entire saved memory panel was blank, with no history at
            all. Everything is just gone.&quot;
          </em>{" "}
          Dozens of replies confirmed the same thing.
        </p>

        <p>
          OpenAI eventually acknowledged both incidents. There was no recovery
          path. The memories were gone.
        </p>

        <p>
          That&apos;s the moment the abstract idea of &quot;AI vendor
          lock-in&quot; becomes a concrete feeling in your chest. You spent
          months teaching the model about your work, your preferences, the
          phrasing you like. Then a backend update — not yours, theirs — and
          it&apos;s a stranger again.
        </p>

        <h2>
          The actual problem (it&apos;s not a feature, it&apos;s a contract)
        </h2>

        <p>
          Hosted AI memory looks like a feature. ChatGPT Memory, Claude
          Projects, Mem0, Letta, Zep — they all present the same UI: a list of
          facts the AI &quot;knows&quot; about you. But{" "}
          <strong>you don&apos;t have the rows</strong>. You have a UI. The rows
          live in someone else&apos;s database, on their servers, under their
          terms of service.
        </p>

        <p>That arrangement is fine until any of these things happen:</p>

        <ul>
          <li>
            The vendor changes the memory format and old entries become garbage
          </li>
          <li>
            The vendor caps total memory size (ChatGPT&apos;s is around
            1,200–1,400 words; once full, you delete to add)
          </li>
          <li>
            The vendor has a backend bug and your memories silently disappear
            (Feb 2025, Nov 2025)
          </li>
          <li>
            Your account gets banned, frozen, or the email you signed up with
            stops working
          </li>
          <li>
            You decide to switch from ChatGPT to Claude and discover there was
            no &quot;export&quot; button to begin with
          </li>
          <li>
            The company gets acquired, deprecated, or shifts to a different
            pricing model that prices you out
          </li>
        </ul>

        <p>
          A 2026 Parallels survey of 540 IT professionals found 94% are now
          concerned about vendor lock-in. AI memory is the worst kind of lock-in
          because it&apos;s emotional. You don&apos;t just lose data. You lose
          the version of the model that knew you.
        </p>

        <h2>What &quot;owning&quot; your memory actually means</h2>

        <p>
          This isn&apos;t philosophical. It&apos;s a single, testable question:{" "}
          <strong>can you read the rows directly?</strong>
        </p>

        <p>With ChatGPT Memory, the answer is no. You see a UI listing.</p>

        <p>
          With Context Hub, the answer is yes. The memories live in a Cloudflare
          D1 database tied to your own Cloudflare account. You can run{" "}
          <code>
            wrangler d1 execute context-hub --command &quot;SELECT * FROM
            memories&quot;
          </code>{" "}
          and see every row. You can dump the whole thing to JSON in 30 seconds.
          You can <code>git diff</code> your context the way you&apos;d diff
          code.
        </p>

        <p>
          That sounds nerdy until you remember why it matters: every other piece
          of your work life lives in a database you can read. Your email. Your
          code. Your notes. Your calendar. The reason you&apos;ve never panicked
          about Notion losing your docs is that Notion gives you exports — and
          even if they didn&apos;t, you write your important things down
          somewhere else.
        </p>

        <p>
          AI memory is the only category where we accepted &quot;trust the
          vendor with your relationship to the model.&quot; Two outages in 2025
          made it clear that wasn&apos;t a great deal.
        </p>

        <h2>What I learned the hard way</h2>

        <p>
          I had eight months of ChatGPT memory wiped in November 2025. I
          didn&apos;t even get a notification. I noticed because the model
          started asking me what I was working on — a question it hadn&apos;t
          asked since April.
        </p>

        <p>Three things came out of that experience.</p>

        <p>
          <strong>
            1. The most valuable memories aren&apos;t the obvious ones.
          </strong>{" "}
          When you finally look at your stored context after losing it, you
          realize the facts the model remembered (job, projects, tools) were the
          easy half. The harder half was the <em>preferences</em> — &quot;Mayank
          prefers Postgres over Supabase even when Supabase looks easier.&quot;
          &quot;Mayank wants me to push back when his architecture is wrong, not
          just affirm it.&quot; Those are the entries that took months of
          correction to land. Those are the ones I missed most.
        </p>

        <p>
          <strong>2. Migration tools are always one-way.</strong> When Anthropic
          launched their Import Memory tool in March 2026 to pull context out of
          ChatGPT and Gemini, I noticed something: it pulls IN, but doesn&apos;t
          push OUT. None of the major vendors offer a clean export back to a
          portable format. Lock-in by inertia, even when the inbound migration
          is fixed.
        </p>

        <p>
          <strong>
            3. Owning the rows is half the work; the other half is discipline
            about what gets stored.
          </strong>{" "}
          When your memory store is yours, you actually look at it. I read the
          Context Hub D1 dump monthly. About 5% of the memories are wrong,
          outdated, or embarrassingly trivial. I delete them. The
          signal-to-noise ratio stays high because I&apos;m the librarian. With
          hosted memory you can&apos;t do this — you can&apos;t even see the
          librarian.
        </p>

        <h2>What this looks like with Context Hub</h2>

        <p>The setup is the same as every other Context Hub use case:</p>

        <InstallBlock />

        <p>
          What changes is where the rows live. Every memory you save through any
          AI client — Claude.ai, Claude Code, ChatGPT (via Plus connectors),
          Cursor, Perplexity — lands in a D1 table on your Cloudflare account.
          Not OpenAI&apos;s. Not Anthropic&apos;s. Yours.
        </p>

        <p>What that buys you in concrete terms:</p>

        <ul>
          <li>
            <strong>The wipes can&apos;t happen to you.</strong> A vendor
            backend bug only affects vendors. Your D1 stays intact regardless of
            what ChatGPT does to its memory backend on a given Tuesday.
          </li>
          <li>
            <strong>The migration is free.</strong> Switching from ChatGPT to
            Claude doesn&apos;t mean losing context anymore — both clients read
            from the same Context Hub via MCP. You change the tool. The
            relationship persists.
          </li>
          <li>
            <strong>
              Privacy is a property of the architecture, not a promise.
            </strong>{" "}
            No vendor sees your memory store. They see individual rows when they
            need them, via MCP, in the moment of the call. Then those rows leave
            their context window. They don&apos;t accumulate in someone
            else&apos;s database.
          </li>
          <li>
            <strong>You can audit your own memory.</strong>{" "}
            <code>wrangler d1 execute</code>, dump to JSON, grep for the
            preferences you&apos;ve forgotten you taught the model. Before
            Context Hub I&apos;d never read my stored context. Now I do it
            monthly and the AI works better for it.
          </li>
        </ul>

        <h2>The migration question (be honest about it)</h2>

        <p>
          You probably already have memories invested in ChatGPT or Claude or
          Cursor. Two questions matter:
        </p>

        <p>
          <strong>Can you get them out?</strong> Anthropic&apos;s Markdown
          memory format exports cleanly — Claude.ai gives you the actual files.
          ChatGPT&apos;s format is opaque (vector-backed) and the official
          export gives you conversation logs, not extracted memories. You can
          recover most of the important ones by asking ChatGPT to list
          everything it knows about you, then pasting the response into Context
          Hub. It&apos;s manual. It works.
        </p>

        <p>
          <strong>Should you migrate them all at once?</strong> No. The better
          path: install Context Hub, point your most-used AI client at it, and
          let new memories accumulate there. Keep the old vendor memory until
          your Context Hub is rich enough that you don&apos;t miss it. Most
          people get there in 2–3 weeks of normal usage.
        </p>

        <h2>The uncomfortable truth</h2>

        <p>
          You&apos;ve been renting your AI relationship from a company you
          didn&apos;t pick because of how they handle data. You picked them
          because the model was good. The memory got bundled in.
        </p>

        <p>
          That arrangement was fine when AI memory was a novelty. It&apos;s less
          fine now that &quot;the model knows me&quot; is approaching critical
          to how you work.
        </p>

        <p>
          The Feb 2025 and Nov 2025 wipes weren&apos;t the last incidents.
          They&apos;re just the first ones with a public news cycle. There will
          be more, because building robust memory at consumer scale is hard, and
          because the vendor&apos;s incentives don&apos;t fully line up with
          yours: they want memory to make you stickier; you want memory to be
          portable.
        </p>

        <p>
          Owning the rows is how you opt out of that incentive mismatch. Not
          because Cloudflare is morally superior to OpenAI. Because the deal is
          different when the database is in your name.
        </p>
      </>
    ),
  },
};

export const useCaseSlugs = Object.keys(useCases);
