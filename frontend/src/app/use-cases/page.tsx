import type { Metadata } from "next";
import Link from "next/link";
import { useCases, useCaseSlugs } from "./[slug]/content";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://contexthub.tryrehearsal.ai";
const SITE_NAME = "Context Hub";

export const metadata: Metadata = {
  title:
    "Use cases — Real workflows where shared AI context replaces re-prompting",
  description:
    "Three workflows where Context Hub eliminates the recap tax across Claude.ai, ChatGPT, Cursor, Perplexity, and Claude Code. Pick one and ship in minutes.",
  alternates: {
    canonical: "/use-cases",
  },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/use-cases`,
    siteName: SITE_NAME,
    title: "Use cases · Context Hub",
    description:
      "Three workflows where Context Hub eliminates the recap tax across every AI client you use.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Use cases · Context Hub",
    description:
      "Three workflows where Context Hub eliminates the recap tax across every AI client you use.",
    creator: "@mayankbohradev",
  },
};

export default function UseCasesIndexPage() {
  const items = useCaseSlugs.map((slug) => useCases[slug]);

  /*
   * CollectionPage + ItemList + BreadcrumbList JSON-LD for index
   * discoverability. Content fully derived from typed struct via
   * JSON.stringify — values come from local source code, never user
   * input. Same safety profile as the detail page.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/use-cases#collection`,
        url: `${SITE_URL}/use-cases`,
        name: "Use cases",
        description:
          "Real workflows where shared AI context replaces re-prompting.",
        isPartOf: { "@id": `${SITE_URL}#website` },
        inLanguage: "en",
      },
      {
        "@type": "ItemList",
        "@id": `${SITE_URL}/use-cases#list`,
        itemListElement: items.map((item, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: item.title,
          url: `${SITE_URL}/use-cases/${item.slug}`,
          description: item.description,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: SITE_NAME,
            item: SITE_URL,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Use cases",
            item: `${SITE_URL}/use-cases`,
          },
        ],
      },
    ],
  };

  // Pre-stringify so the inline-script line stays a simple string assignment.
  const ldJsonString = JSON.stringify(jsonLd);

  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJsonString }}
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
            <span aria-current="page">Use cases</span>
          </nav>
          <p className="use-case-kicker">
            <span aria-hidden="true">&gt;_</span>
            <span>Use cases</span>
          </p>
          <h1 className="use-case-title">
            Real workflows where shared context replaces re-prompting.
          </h1>
          <p className="use-case-hook">
            Pick a workflow, deploy in minutes, and let your AI clients reach
            the same source of truth.
          </p>
        </header>

        <section className="use-case-body">
          <div className="related-grid use-case-index-grid">
            {items.map((item, index) => (
              <Link
                href={`/use-cases/${item.slug}`}
                key={item.slug}
                className="use-case-card"
              >
                <div className="card-top">
                  <span className="card-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="card-kicker">{item.kicker}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <strong className="card-link">Read more →</strong>
              </Link>
            ))}
          </div>
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
