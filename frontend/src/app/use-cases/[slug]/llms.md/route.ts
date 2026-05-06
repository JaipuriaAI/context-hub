import { useCases, useCaseSlugs } from "../content";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://contexthub.tryrehearsal.ai";
const AUTHOR_NAME = "Mayank Bohra";
const AUTHOR_URL = "https://mayankbohra.com";

/**
 * Markdown-formatted summary of each use-case page, served at
 * /use-cases/<slug>/llms.md. Linked from the root /llms.txt as the
 * preferred Markdown alternative for AI crawlers.
 *
 * Why: Perplexity, Claude, and ChatGPT extract content faster and cite
 * more reliably from clean Markdown than from rendered HTML — confirmed
 * in the May 2026 AEO benchmarks. The HTML page remains canonical for
 * humans + Google; this Markdown route is the AI-citable mirror.
 *
 * Content choice: emit the structured citable parts of the use-case
 * (title, hook, description, FAQs, related links). The long-form prose
 * lives in the React JSX body of the HTML page and is not easily
 * serialized to Markdown without a renderer; the structured parts are
 * what AI systems most often quote anyway.
 */
export const dynamic = "force-static";

export async function generateStaticParams() {
  return useCaseSlugs.map((slug) => ({ slug }));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const useCase = useCases[slug];

  if (!useCase) {
    return new Response("Not found", { status: 404 });
  }

  const url = `${SITE_URL}/use-cases/${slug}`;

  const md = [
    `# ${useCase.title}`,
    "",
    `> ${useCase.description}`,
    "",
    `**Kicker:** ${useCase.kicker}  `,
    `**Reading time:** ${useCase.readingMinutes} minutes  `,
    `**Author:** [${AUTHOR_NAME}](${AUTHOR_URL})  `,
    `**Published:** ${useCase.publishedAt}  `,
    `**Canonical URL:** ${url}`,
    "",
    "## Hook",
    "",
    useCase.hook,
    "",
    "## Frequently asked questions",
    "",
    ...useCase.faqs.flatMap((faq) => [`### ${faq.q}`, "", faq.a, ""]),
    "## Related use cases",
    "",
    ...useCase.related.map((relatedSlug) => {
      const rel = useCases[relatedSlug];
      return rel
        ? `- [${rel.title}](${SITE_URL}/use-cases/${rel.slug}/llms.md): ${rel.description}`
        : "";
    }),
    "",
    "## Install",
    "",
    "```bash",
    "npx create-context-hub",
    "```",
    "",
    "One command. Every AI tool you use, finally on the same page.",
    "",
    "## Source",
    "",
    `- Repository: https://github.com/JaipuriaAI/context-hub`,
    `- npm: https://www.npmjs.com/package/create-context-hub`,
    `- License: MIT`,
    "",
  ].join("\n");

  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
