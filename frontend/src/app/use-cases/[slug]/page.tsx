import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useCases, useCaseSlugs } from "./content";
import { CopyInstall } from "../../CopyInstall";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://contexthub.tryrehearsal.ai";
const SITE_NAME = "Context Hub";
const AUTHOR_NAME = "Mayank Bohra";
const AUTHOR_URL = "https://mayankbohra.com";

/**
 * Static generation — all 3 use-case pages prerender at build time.
 * Crawlers (Google, Bing, AI bots) get full HTML on first request.
 */
export function generateStaticParams() {
  return useCaseSlugs.map((slug) => ({ slug }));
}

/**
 * Per-page metadata. Each use-case gets its own canonical URL, OG image,
 * and description. The canonical is what AI crawlers + Google use as the
 * authoritative URL for citation.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const useCase = useCases[slug];
  if (!useCase) return {};

  const url = `${SITE_URL}/use-cases/${slug}`;
  const title = `${useCase.title} · ${SITE_NAME}`;

  return {
    title: useCase.title,
    description: useCase.description,
    keywords: useCase.keywords,
    authors: [{ name: AUTHOR_NAME, url: AUTHOR_URL }],
    alternates: {
      canonical: `/use-cases/${slug}`,
    },
    openGraph: {
      type: "article",
      url,
      siteName: SITE_NAME,
      title,
      description: useCase.description,
      publishedTime: useCase.publishedAt,
      authors: [AUTHOR_URL],
      // OG image inherits from the root /opengraph-image — every use case
      // shares the brand card. We could derive a per-slug card later via
      // a /use-cases/[slug]/opengraph-image.tsx file, but the unified
      // brand card reads better at WhatsApp thumbnail size for a launch.
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: useCase.description,
      creator: "@mayankbohradev",
    },
  };
}

export default async function UseCasePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const useCase = useCases[slug];
  if (!useCase) notFound();

  const url = `${SITE_URL}/use-cases/${slug}`;

  /*
   * Article + BreadcrumbList + FAQPage JSON-LD bundled as @graph.
   *
   * 2026 schema strategy notes:
   *   - Article carries `speakable` (SpeakableSpecification) pointing at
   *     #use-case-hook + each #faq-answer-N — Speakable no longer fires a
   *     SERP rich result (Google 2024 change) but is still used as a pure
   *     AI-citation signal by AI Overviews and AI Mode for which passages
   *     to extract verbatim.
   *   - FAQPage stays even though Google's Aug-2023 narrowing limits its
   *     SERP rich result to govt/health authorities. Google explicitly
   *     says non-qualifying sites are NOT penalized for emitting it; AI
   *     crawlers (Perplexity, ChatGPT, Claude) still parse FAQPage during
   *     retrieval. Net upside, zero downside.
   *   - HowTo intentionally omitted — Google removed HowTo rich results
   *     entirely in Sep 2023; no AI-Overview impact in May 2026.
   *
   * SAFETY: jsonLd content is fully constructed from typed UseCase struct
   * fields (title, description, FAQ Q&A pairs, slugs). All values are
   * derived from local source code, never user input. JSON.stringify
   * neutralizes any quote/script chars in payload values. Zero XSS surface.
   */
  const speakableSelectors = [
    "#use-case-hook",
    ...useCase.faqs.map((_, i) => `#faq-answer-${i + 1}`),
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: useCase.title,
        description: useCase.description,
        url,
        datePublished: useCase.publishedAt,
        dateModified: useCase.publishedAt,
        author: {
          "@type": "Person",
          "@id": `${AUTHOR_URL}#person`,
          name: AUTHOR_NAME,
          url: AUTHOR_URL,
          sameAs: [
            "https://github.com/mayankbohradev",
            "https://twitter.com/mayankbohradev",
            "https://www.linkedin.com/in/mayankbohradev",
          ],
        },
        publisher: {
          "@type": "Organization",
          "@id": `${SITE_URL}#org`,
          name: SITE_NAME,
          url: SITE_URL,
          logo: `${SITE_URL}/icon.svg`,
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": url,
        },
        inLanguage: "en",
        keywords: useCase.keywords.join(", "),
        // Speakable: tells AI systems which DOM nodes are the
        // canonical citable passages for this article.
        speakable: {
          "@type": "SpeakableSpecification",
          cssSelector: speakableSelectors,
        },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
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
          {
            "@type": "ListItem",
            position: 3,
            name: useCase.title,
            item: url,
          },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: useCase.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.a,
          },
        })),
      },
    ],
  };

  const related = useCase.related
    .map((s) => useCases[s])
    .filter((u): u is NonNullable<typeof u> => Boolean(u));

  return (
    <main className="min-h-screen">
      {/* Inline JSON-LD — content fully derived from typed struct via
          JSON.stringify, no user input anywhere. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="use-case-page">
        {/* Top bar with brand + back link */}
        <nav className="use-case-nav" aria-label="Site navigation">
          <Link href="/" className="brand-mark" aria-label="Context Hub home">
            <span className="brand-prompt">&gt;_</span>
            <span className="brand-wordmark">
              <span className="brand-wordmark-strong">Context</span>
              <span className="brand-wordmark-light">Hub</span>
            </span>
          </Link>
          <Link href="/use-cases" className="use-case-back-link">
            ← All use cases
          </Link>
        </nav>

        {/* Hero */}
        <header className="use-case-hero">
          <nav aria-label="Breadcrumb" className="use-case-breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link href="/use-cases">Use cases</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{useCase.kicker}</span>
          </nav>
          <p className="use-case-kicker">
            <span aria-hidden="true">&gt;_</span>
            <span>{useCase.kicker}</span>
          </p>
          <h1 className="use-case-title">{useCase.title}</h1>
          <p id="use-case-hook" className="use-case-hook">
            {useCase.hook}
          </p>
          <div className="use-case-meta">
            <span>{useCase.readingMinutes} min read</span>
            <span aria-hidden="true">·</span>
            <span>
              By{" "}
              <a
                href={AUTHOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="byline-link"
              >
                {AUTHOR_NAME}
              </a>
            </span>
            <span aria-hidden="true">·</span>
            <time dateTime={useCase.publishedAt}>
              {new Date(useCase.publishedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          </div>
        </header>

        {/* Body */}
        <section className="use-case-body prose">{useCase.body}</section>

        {/* FAQ section — visible on page + powers FAQPage JSON-LD */}
        <section className="use-case-faq" aria-labelledby="faq-heading">
          <h2 id="faq-heading">Frequently asked questions</h2>
          <dl>
            {useCase.faqs.map((faq, i) => (
              <div className="faq-item" key={faq.q}>
                <dt id={`faq-question-${i + 1}`}>{faq.q}</dt>
                <dd id={`faq-answer-${i + 1}`}>{faq.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* CTA — same shape as homepage CTA band */}
        <section className="use-case-cta" aria-labelledby="cta-heading">
          <p className="use-case-kicker">
            <span aria-hidden="true">&gt;_</span>
            <span>Ship in one command</span>
          </p>
          <h2 id="cta-heading">Try Context Hub yourself.</h2>
          <p>One command. Every AI tool you use, finally on the same page.</p>
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
        </section>

        {/* Related use cases */}
        {related.length > 0 && (
          <section
            className="use-case-related"
            aria-labelledby="related-heading"
          >
            <h2 id="related-heading">Related workflows</h2>
            <div className="related-grid">
              {related.map((rel, index) => (
                <Link
                  href={`/use-cases/${rel.slug}`}
                  key={rel.slug}
                  className="use-case-card"
                >
                  <div className="card-top">
                    <span className="card-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="card-kicker">{rel.kicker}</span>
                  </div>
                  <h3>{rel.title}</h3>
                  <p>{rel.description}</p>
                  <strong className="card-link">Read more →</strong>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>

      {/* Footer (compact — full footer is on home page) */}
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
