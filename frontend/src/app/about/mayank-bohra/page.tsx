import type { Metadata } from "next";
import Link from "next/link";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://contexthub.tryrehearsal.ai";
const AUTHOR_NAME = "Mayank Bohra";
const AUTHOR_URL = "https://mayankbohra.com";
const AUTHOR_DESCRIPTION =
  "Mayank Bohra is the creator of Context Hub. He builds Rehearsal AI (an AI interview-practice platform serving 5,000+ candidates across IIMs, FAANG prep, and campus placements) and Highlyt. His work focuses on AI infrastructure, voice AI, and developer tools.";

export const metadata: Metadata = {
  title: "Mayank Bohra — Creator of Context Hub",
  description:
    "Mayank Bohra builds AI products at the edges of voice, memory, and dev tooling. He created Context Hub while shipping Rehearsal AI and Highlyt.",
  alternates: { canonical: "/about/mayank-bohra" },
  authors: [{ name: AUTHOR_NAME, url: AUTHOR_URL }],
  openGraph: {
    type: "profile",
    url: `${SITE_URL}/about/mayank-bohra`,
    siteName: "Context Hub",
    title: "Mayank Bohra — Creator of Context Hub",
    description: AUTHOR_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: "Mayank Bohra — Creator of Context Hub",
    description: AUTHOR_DESCRIPTION,
    creator: "@mayankbohradev",
  },
};

export default function AuthorPage() {
  /*
   * ProfilePage + Person + Organization JSON-LD.
   * Why: AI systems and Google verify author identity via `sameAs` links
   * to social profiles. Documented E-E-A-T signal — author's verifiable
   * presence improves citation eligibility.
   *
   * SAFETY: All values below are hardcoded TypeScript constants in this
   * file (AUTHOR_NAME, AUTHOR_URL, AUTHOR_DESCRIPTION, SITE_URL). No user
   * input ever reaches the JSON-LD payload. JSON.stringify safely escapes
   * any quote/script characters in the values. Zero XSS surface — same
   * pattern Next.js docs recommend for inline structured data.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${SITE_URL}/about/mayank-bohra#profilepage`,
        url: `${SITE_URL}/about/mayank-bohra`,
        name: `${AUTHOR_NAME} — Creator of Context Hub`,
        description: AUTHOR_DESCRIPTION,
        mainEntity: { "@id": `${AUTHOR_URL}#person` },
        inLanguage: "en",
        isPartOf: { "@id": `${SITE_URL}#website` },
      },
      {
        "@type": "Person",
        "@id": `${AUTHOR_URL}#person`,
        name: AUTHOR_NAME,
        url: AUTHOR_URL,
        description: AUTHOR_DESCRIPTION,
        jobTitle: "Founder, AI Product Engineer",
        worksFor: [
          {
            "@type": "Organization",
            name: "Rehearsal AI",
            url: "https://tryrehearsal.ai",
          },
          {
            "@type": "Organization",
            name: "Highlyt",
            url: "https://highlyt.app",
          },
        ],
        sameAs: [
          "https://mayankbohra.com",
          "https://github.com/mayankbohradev",
          "https://twitter.com/mayankbohradev",
          "https://www.linkedin.com/in/mayankbohradev",
          "https://tryrehearsal.ai",
          "https://highlyt.app",
        ],
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Context Hub",
            item: SITE_URL,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "About",
            item: `${SITE_URL}/about/mayank-bohra`,
          },
        ],
      },
    ],
  };

  // Pre-stringify so the script tag stays a simple string assignment.
  const ldJson = JSON.stringify(jsonLd);

  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson }}
      />

      <article className="use-case-page">
        <nav className="use-case-nav" aria-label="Site navigation">
          <Link href="/" className="brand-mark" aria-label="Context Hub home">
            <span className="brand-prompt">&gt;_</span>
            <span className="brand-wordmark">
              <span className="brand-wordmark-strong">Context</span>
              <span className="brand-wordmark-light">Hub</span>
            </span>
          </Link>
          <Link href="/" className="use-case-back-link">
            ← Home
          </Link>
        </nav>

        <header className="use-case-hero">
          <nav aria-label="Breadcrumb" className="use-case-breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">About</span>
          </nav>
          <p className="use-case-kicker">
            <span aria-hidden="true">&gt;_</span>
            <span>About the author</span>
          </p>
          <h1 className="use-case-title">Mayank Bohra</h1>
          <p className="use-case-hook">
            I build AI products at the edges of voice, memory, and developer
            tooling.
          </p>
        </header>

        <section className="use-case-body prose">
          <p className="lede">
            I&apos;m the creator of Context Hub. I built it while shipping{" "}
            <a
              href="https://tryrehearsal.ai"
              target="_blank"
              rel="noopener noreferrer"
            >
              Rehearsal AI
            </a>{" "}
            — a voice-powered AI interview-practice platform that&apos;s served
            5,000+ candidates across IIMs, FAANG prep, and campus placements —
            and{" "}
            <a
              href="https://highlyt.app"
              target="_blank"
              rel="noopener noreferrer"
            >
              Highlyt
            </a>
            , a tool I&apos;m building in stealth.
          </p>

          <p>
            Most of my work lives at the intersection of AI infrastructure and
            real product engineering. The demo is always 10% of the work; the
            other 90% is the boring stuff that makes things actually usable —
            handling edge cases, building feedback loops, designing systems that
            degrade gracefully when models hallucinate.
          </p>

          <p>
            Context Hub came out of frustration. I&apos;d spend twenty minutes
            making a decision in Claude.ai, then switch to Claude Code in my
            terminal and have to re-explain the entire context. Multiply by ten
            decisions a week and you&apos;re paying an hour-a-day tax just to
            keep your AI tools on the same page. So I built the thing that
            stores the decisions once and lets every AI client read them.
          </p>

          <h2>What I&apos;m building</h2>

          <h3>Rehearsal AI</h3>
          <p>
            Voice-powered interview practice. Candidates run mock interviews
            with an adaptive AI that probes deeper when answers go thin —
            modeling how real interviewers behave. Cross-session memory tracks
            improvement patterns. Currently serves IIMs, MBA candidates, and
            tech-role applicants.{" "}
            <a
              href="https://tryrehearsal.ai"
              target="_blank"
              rel="noopener noreferrer"
            >
              tryrehearsal.ai
            </a>
          </p>

          <h3>Context Hub</h3>
          <p>
            Open-source MCP context layer that Claude, ChatGPT, Cursor,
            Perplexity, and Claude Code all read from. One npm command stands up
            a Cloudflare Workers + D1 backed memory server. Free at personal
            scale.{" "}
            <a
              href="https://github.com/JaipuriaAI/context-hub"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/JaipuriaAI/context-hub
            </a>
          </p>

          <h3>Highlyt</h3>
          <p>
            In-progress.{" "}
            <a
              href="https://highlyt.app"
              target="_blank"
              rel="noopener noreferrer"
            >
              highlyt.app
            </a>
          </p>

          <h2>Where to find me</h2>

          <ul>
            <li>
              <a
                href="https://mayankbohra.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                mayankbohra.com
              </a>{" "}
              — portfolio + writing
            </li>
            <li>
              <a
                href="https://github.com/mayankbohradev"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/mayankbohradev
              </a>{" "}
              — open source
            </li>
            <li>
              <a
                href="https://twitter.com/mayankbohradev"
                target="_blank"
                rel="noopener noreferrer"
              >
                @mayankbohradev
              </a>{" "}
              — short-form thoughts
            </li>
            <li>
              <a
                href="https://www.linkedin.com/in/mayankbohradev"
                target="_blank"
                rel="noopener noreferrer"
              >
                linkedin.com/in/mayankbohradev
              </a>{" "}
              — professional updates
            </li>
          </ul>

          <h2>Get in touch</h2>

          <p>
            Best way to reach me about Context Hub: open an issue on{" "}
            <a
              href="https://github.com/JaipuriaAI/context-hub/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            . For everything else, the channels above.
          </p>
        </section>
      </article>

      <footer className="use-case-footer">
        <p>
          Built by{" "}
          <a
            href="https://mayankbohra.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Mayank Bohra
          </a>{" "}
          while building{" "}
          <a
            href="https://tryrehearsal.ai"
            target="_blank"
            rel="noopener noreferrer"
          >
            Rehearsal AI
          </a>{" "}
          and{" "}
          <a
            href="https://highlyt.app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Highlyt
          </a>
        </p>
      </footer>
    </main>
  );
}
