import { CopyInstall } from "./CopyInstall";
import {
  getNpmStats,
  formatCount,
  formatDateRange,
  formatSinceLabel,
} from "./npm-stats";

type ClientIcon =
  | "claude"
  | "chatgpt"
  | "perplexity"
  | "cursor"
  | "claude-code"
  | "codex";

const heroClients: {
  name: string;
  icon: ClientIcon;
  className: string;
}[] = [
  { name: "Claude", icon: "claude", className: "client-claude" },
  { name: "ChatGPT", icon: "chatgpt", className: "client-chatgpt" },
  { name: "Perplexity", icon: "perplexity", className: "client-perplexity" },
  { name: "Cursor", icon: "cursor", className: "client-cursor" },
  { name: "Claude Code", icon: "claude-code", className: "client-claude-code" },
  { name: "Codex", icon: "codex", className: "client-codex" },
];

/**
 * Client glyphs — render official brand marks at full fidelity (no recoloring).
 * Each brand should be placed in `public/brand/<icon>.svg` (or .png/.webp).
 * Drop the official mark from each company's brand-asset page into that path
 * and it will render as-is, sized to fit the parent container.
 */
const BRAND_ASSETS: Record<ClientIcon, string> = {
  claude: "/brand/claude.svg",
  chatgpt: "/brand/chatgpt.svg",
  perplexity: "/brand/perplexity.svg",
  cursor: "/brand/cursor.svg",
  "claude-code": "/brand/claude-code.svg",
  codex: "/brand/codex.svg",
};

function ClientGlyph({ icon, label }: { icon: ClientIcon; label?: string }) {
  return (
    <img
      src={BRAND_ASSETS[icon]}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      loading="lazy"
      decoding="async"
      className="brand-img"
    />
  );
}

const heroFeatures = [
  ["Signal Console", "Inspect, filter, and shape your context."],
  ["Context Layer", "Store preferences, memories, and rules."],
  ["Cross-Client Sync", "Real-time sync across all your tools."],
  ["Cloudflare Ready", "Workers runtime. Global. Fast. Secure."],
];

function buildStats(npm: {
  weekly: number | null;
  total: number | null;
  weeklyStart: string | null;
  weeklyEnd: string | null;
  firstPublished: string | null;
}) {
  return [
    ["Edge Runtime", "Global regions"],
    ["Low Latency", "Sub-50ms signals"],
    ["Your Data", "Encrypted. Yours."],
    ["Built for Builders", "Open. Extensible."],
    [
      `${formatCount(npm.weekly)} weekly`,
      formatDateRange(npm.weeklyStart, npm.weeklyEnd),
    ],
    [`${formatCount(npm.total)} total`, formatSinceLabel(npm.firstPublished)],
  ] as const;
}

const features = [
  {
    label: "One command setup",
    title: "From empty folder to live MCP server",
    body: "Scaffold files, install dependencies, create Cloudflare D1, migrate, deploy, and print connector instructions without hand-copying boilerplate.",
  },
  {
    label: "Cross-client memory",
    title: "Your context follows every AI client",
    body: "Claude.ai, Claude Code, ChatGPT, Perplexity, Cursor, Windsurf, Zed, and custom MCP clients can read and write the same source of truth.",
  },
  {
    label: "Source-aware entries",
    title: "Know where every memory came from",
    body: "Context Hub tags memories and logs from the MCP initialize handshake, so entries can show whether they came from chatgpt, claude-code, or another client.",
  },
  {
    label: "Free cloud runtime",
    title: "Cloudflare Workers and D1, not local daemons",
    body: "The generated hub runs globally on Cloudflare's free tier with SQLite-backed storage, full-text search, and no Docker stack to babysit.",
  },
];

const useCases = [
  {
    title: "Sync Claude.ai memories into Claude Code",
    kicker: "Workflow",
    href: "#use-cases",
    body: "Save a product decision in the browser, then ask your terminal agent to use that same context while editing code.",
  },
  {
    title: "Build a personal MCP memory server for $0/month",
    kicker: "Infrastructure",
    href: "#use-cases",
    body: "Deploy a durable AI context layer on Cloudflare Workers and D1 without paying for a hosted memory product.",
  },
  {
    title: "Share context between ChatGPT, Perplexity, and Cursor",
    kicker: "Multi-client",
    href: "#use-cases",
    body: "Use Context Hub as the bridge when research, planning, and implementation happen in different AI tools.",
  },
];

export default async function Home() {
  const npm = await getNpmStats();
  const stats = buildStats(npm);

  return (
    <main className="min-h-screen bg-[#060a0c] text-[var(--paper)]">
      <section className="hero-frame">
        <div className="hero-card">
          <div className="hero-noise" />
          <nav className="hero-nav">
            <a href="#" className="brand-mark" aria-label="Context Hub home">
              <span className="brand-prompt">&gt;_</span>
              <span>Context Hub</span>
            </a>
            <div className="nav-links">
              <a href="#features">Docs</a>
              <a href="#use-cases">Guide</a>
              <a href="#use-cases">Templates</a>
              <a href="https://github.com/JaipuriaAI/context-hub">GitHub ↗</a>
              <a
                className="get-started"
                href="https://www.npmjs.com/package/create-context-hub"
              >
                Get Started
              </a>
            </div>
          </nav>

          <div className="hero-main">
            <div className="hero-copy">
              <h1>
                Your AI context.
                <br />
                Connected <span>everywhere.</span>
              </h1>
              <p>
                Context Hub is your personal context layer and signal console.
                Sync across clients. Control your memory. Deploy to the edge.
              </p>
              <CopyInstall command="npx create-context-hub" variant="hero" />
              <div className="hero-trust">
                <span className="trust-pulse" aria-hidden="true" />
                <span>Free · Open source · MIT licensed</span>
                <span className="trust-divider" aria-hidden="true">
                  ·
                </span>
                <a
                  href="https://github.com/JaipuriaAI/context-hub"
                  className="trust-link"
                >
                  ★ Star on GitHub
                </a>
              </div>
              <div className="hero-feature-row">
                {heroFeatures.map(([title, body], index) => {
                  const paths = [
                    "M3 12h3l3-7 4 14 3-7h5",
                    "M4 6h16v12H4z M4 10h16",
                    "M4 12a8 8 0 0 1 14-5 M20 12a8 8 0 0 1-14 5 M18 4v3h-3 M6 20v-3h3",
                    "M7 18a4 4 0 0 1 0-8 5.5 5.5 0 0 1 11 0 4 4 0 0 1 0 8z",
                  ];
                  return (
                    <div className="hero-mini-feature" key={title}>
                      <span className={`mini-icon mini-${index}`}>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d={paths[index]} />
                        </svg>
                      </span>
                      <strong>{title}</strong>
                      <p>{body}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              className="context-map"
              aria-label="Connected AI context graph"
            >
              <div className="map-rings" />
              <svg
                className="map-lines"
                viewBox="0 0 760 410"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="lineL" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#55d8e7" stopOpacity="0.15" />
                    <stop offset="0.4" stopColor="#55d8e7" stopOpacity="0.85" />
                    <stop offset="1" stopColor="#55d8e7" stopOpacity="0.95" />
                  </linearGradient>
                  <linearGradient id="lineR" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#55d8e7" stopOpacity="0.95" />
                    <stop offset="0.6" stopColor="#55d8e7" stopOpacity="0.85" />
                    <stop offset="1" stopColor="#55d8e7" stopOpacity="0.15" />
                  </linearGradient>
                </defs>
                <path
                  d="M170 95 C240 95 290 165 340 165"
                  stroke="url(#lineL)"
                />
                <path
                  d="M170 205 C240 205 290 205 340 205"
                  stroke="url(#lineL)"
                />
                <path
                  d="M170 315 C240 315 290 245 340 245"
                  stroke="url(#lineL)"
                />
                <path
                  d="M420 165 C470 165 520 95 590 95"
                  stroke="url(#lineR)"
                />
                <path
                  d="M420 205 C470 205 520 205 590 205"
                  stroke="url(#lineR)"
                />
                <path
                  d="M420 245 C470 245 520 315 590 315"
                  stroke="url(#lineR)"
                />
                <circle cx="170" cy="95" r="5" />
                <circle cx="170" cy="205" r="5" />
                <circle cx="170" cy="315" r="5" />
                <circle cx="590" cy="95" r="5" />
                <circle cx="590" cy="205" r="5" />
                <circle cx="590" cy="315" r="5" />
                <circle cx="340" cy="165" r="3.2" className="dot-faint" />
                <circle cx="340" cy="205" r="3.2" className="dot-faint" />
                <circle cx="340" cy="245" r="3.2" className="dot-faint" />
                <circle cx="420" cy="165" r="3.2" className="dot-faint" />
                <circle cx="420" cy="205" r="3.2" className="dot-faint" />
                <circle cx="420" cy="245" r="3.2" className="dot-faint" />
              </svg>

              {heroClients.map((client) => (
                <div
                  className={`map-node ${client.className}`}
                  key={client.name}
                >
                  <span className="map-glyph">
                    <ClientGlyph icon={client.icon} />
                  </span>
                  <strong>{client.name}</strong>
                </div>
              ))}

              <div className="hub-console">
                <div className="console-prompt">&gt;_</div>
                <h2>Context Hub</h2>
                <p>Your context layer</p>
                {[
                  { label: "Memories", icon: "M5 7h14M5 12h14M5 17h9" },
                  { label: "Preferences", icon: "M4 6h16M4 12h10M4 18h16" },
                  { label: "Rules", icon: "M5 5h14v14H5z M9 9h6 M9 13h6" },
                  { label: "Signals", icon: "M3 12h3l3-7 4 14 3-7h5" },
                ].map((row) => (
                  <div className="console-row" key={row.label}>
                    <svg
                      className="console-row-icon"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d={row.icon} />
                    </svg>
                    <span>{row.label}</span>
                    <i />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="hero-stat-row">
            {stats.map(([title, body], index) => {
              const statPaths = [
                "M12 3a9 9 0 1 0 9 9 M12 3v9h9",
                "M13 2 4 14h7l-1 8 9-12h-7z",
                "M5 11V7a7 7 0 0 1 14 0v4 M4 11h16v10H4z",
                "M4 20h16 M4 16h6 M4 12h10 M4 8h14 M4 4h16",
                "M12 4v12 M7 11l5 5 5-5 M5 20h14",
                "M5 18a4 4 0 0 1 .5-7.96 6 6 0 0 1 11.78-1.4A4.5 4.5 0 0 1 18 18 M12 11v6 M9 14l3 3 3-3",
              ];
              return (
                <div className="hero-stat" key={title}>
                  <span>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d={statPaths[index]} />
                    </svg>
                  </span>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
              );
            })}
          </div>

          <div className="hero-tagline">
            <span className="hero-tagline-problem">
              <span aria-hidden="true">!</span>
              <span>Tired of re-explaining context to every AI client?</span>
            </span>
            <span className="hero-tagline-arrow" aria-hidden="true">
              →
            </span>
            <span className="hero-tagline-solution">
              <span aria-hidden="true">&gt;_</span>
              <span>One MCP context layer. Synced. Yours. Forever.</span>
            </span>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Compatible AI clients">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-5 px-5 py-9 sm:flex-row sm:justify-between sm:px-8 lg:px-10">
          <p className="trust-strip-label">
            <span aria-hidden="true">&gt;_</span>
            <span>Trusted with context across</span>
          </p>
          <ul className="trust-strip-clients">
            {heroClients.map((client) => (
              <li key={client.name} className={client.className}>
                <span className="trust-strip-glyph">
                  <ClientGlyph icon={client.icon} />
                </span>
                <span>{client.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="features" className="section-band">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10">
          <div className="section-kicker">
            <span aria-hidden="true">&gt;_</span>
            <span>Features</span>
          </div>
          <div className="mt-6 grid gap-8 lg:grid-cols-[0.86fr_1.14fr] lg:items-end">
            <h2 className="section-title">
              Built for people whose AI work happens everywhere.
            </h2>
            <p className="section-lede">
              The shortest path from repeated prompting to durable, searchable
              context shared by every AI client you already use.
            </p>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {features.map((feature, index) => (
              <article className="feature-card" key={feature.title}>
                <div className="card-top">
                  <span className="card-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="card-kicker">{feature.label}</span>
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="use-cases" className="section-band use-case-band">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10">
          <div className="section-kicker">
            <span aria-hidden="true">&gt;_</span>
            <span>Use cases</span>
          </div>
          <div className="mt-6 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <h2 className="section-title max-w-3xl">
              Real workflows where shared context replaces re-prompting.
            </h2>
            <p className="section-lede max-w-xl">
              Pick a workflow, deploy in minutes, and let your AI clients reach
              the same source of truth.
            </p>
          </div>
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {useCases.map((useCase, index) => (
              <a
                className="use-case-card"
                href={useCase.href}
                key={useCase.title}
              >
                <div className="card-top">
                  <span className="card-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="card-kicker">{useCase.kicker}</span>
                </div>
                <h3>{useCase.title}</h3>
                <p>{useCase.body}</p>
                <strong className="card-link">Read more →</strong>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section id="cta" className="cta-band">
        <div className="cta-noise" aria-hidden="true" />
        <div className="cta-inner">
          <div className="cta-kicker">
            <span aria-hidden="true">&gt;_</span>
            <span>Ship in one command</span>
          </div>
          <h2>
            Stop re-explaining yourself
            <br />
            to every AI client.
          </h2>
          <p>
            One npm command stands up a Cloudflare-backed MCP context layer that
            every AI client you use can read and write.
          </p>
          <CopyInstall command="npx create-context-hub" variant="cta" />
          <div className="cta-actions">
            <a
              className="cta-primary"
              href="https://www.npmjs.com/package/create-context-hub"
            >
              Get Started
            </a>
            <a
              className="cta-secondary"
              href="https://github.com/JaipuriaAI/context-hub"
            >
              View on GitHub →
            </a>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-12 sm:px-8 lg:flex-row lg:items-start lg:justify-between lg:px-10">
          <div className="footer-brand-block">
            <div className="footer-brand">
              <span className="brand-prompt">&gt;_</span>
              <span>Context Hub</span>
            </div>
            <p className="footer-tagline">
              A personal MCP context layer for every AI client you use.
            </p>
          </div>
          <div className="footer-links">
            <div className="footer-col">
              <strong>Product</strong>
              <a href="#features">Features</a>
              <a href="#use-cases">Use cases</a>
              <a href="#cta">Get started</a>
            </div>
            <div className="footer-col">
              <strong>Open source</strong>
              <a href="https://github.com/JaipuriaAI/context-hub">GitHub</a>
              <a href="https://www.npmjs.com/package/create-context-hub">npm</a>
            </div>
          </div>
          <div className="footer-meta">
            <span>MIT licensed</span>
            <span aria-hidden="true">·</span>
            <span>Built on Cloudflare</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
