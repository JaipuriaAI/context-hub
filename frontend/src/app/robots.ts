import type { MetadataRoute } from "next";

// Production canonical domain — kept in sync with metadataBase in layout.tsx.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://contexthub.tryrehearsal.ai";

/**
 * robots.txt — granular AI crawler allow-list, current to Q2 2026.
 *
 * Strategy: allow all major AI bots (training + retrieval + search) so
 * Context Hub's docs and use-cases get cited natively when users ask
 * Claude, ChatGPT, Perplexity, Gemini, or Copilot questions about MCP
 * context layers, shared AI memory, etc. For an OSS dev tool whose entire
 * job is to live inside AI clients, training-time ingestion is feature.
 *
 * Bots covered (12 user agents across 6 orgs):
 *   - OpenAI:    GPTBot (training), OAI-SearchBot (search index),
 *                ChatGPT-User (user-initiated retrieval)
 *   - Anthropic: ClaudeBot (training), Claude-User, Claude-SearchBot
 *   - Perplexity: PerplexityBot (index), Perplexity-User (real-time)
 *   - Google:    Google-Extended (Gemini/AI training opt-in)
 *   - Apple:     Applebot-Extended (Apple Intelligence training)
 *   - Common Crawl: CCBot (foundation-model training pool)
 *
 * Each gets its own User-agent block so we can revoke individually later
 * if any specific bot starts misbehaving. The default `*` rule still
 * blocks API routes + Next internals.
 */
export default function robots(): MetadataRoute.Robots {
  /*
   * Expanded May 2026 list — covers 19 AI bots across all major orgs
   * known to fetch content for search/training. Stated policy: allow all
   * for an OSS dev tool whose entire job is to live inside AI clients.
   *
   * Three groups (allowed equally; comments document the why per bot):
   *   Search/retrieval (live citation): OAI-SearchBot, ChatGPT-User,
   *     Claude-User, Claude-SearchBot, PerplexityBot, Perplexity-User
   *   Training crawlers (model ingestion): GPTBot, ClaudeBot,
   *     anthropic-ai, Google-Extended, Applebot-Extended, CCBot,
   *     cohere-ai, Diffbot, AI2Bot, Bytespider
   *   Social/preview/index: Bingbot, Amazonbot, meta-externalagent,
   *     LinkedInBot, DuckAssistBot
   */
  const aiBots = [
    // OpenAI
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ChatGPT-User/2.0",
    // Anthropic
    "ClaudeBot",
    "Claude-User",
    "Claude-SearchBot",
    "anthropic-ai",
    "claude-web",
    // Perplexity
    "PerplexityBot",
    "Perplexity-User",
    // Google (Gemini training opt-in is Google-Extended; search is Googlebot)
    "Google-Extended",
    // Apple
    "Applebot-Extended",
    "Applebot",
    // Common Crawl + research training pools
    "CCBot",
    "cohere-ai",
    "Diffbot",
    "AI2Bot",
    // Microsoft Bing + Copilot
    "Bingbot",
    // Social/commerce link previews + shopping context
    "Amazonbot",
    "meta-externalagent",
    "FacebookBot",
    "LinkedInBot",
    // ByteDance / TikTok
    "Bytespider",
    // DuckDuckGo
    "DuckAssistBot",
  ];

  return {
    rules: [
      // Default rule — allow general crawlers, block infra paths.
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/_next/"],
      },
      // Explicit AI bot rules. Each gets its own block so the policy is
      // legible to crawler logs and so we can adjust per-bot later.
      ...aiBots.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: ["/api/", "/_next/"],
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
