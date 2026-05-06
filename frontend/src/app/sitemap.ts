import { execFileSync } from "node:child_process";
import path from "node:path";
import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://contexthub.tryrehearsal.ai";

/**
 * Resolve a route's `lastmod` from git commit time of the source file.
 *
 * Why: Google explicitly uses sitemap `lastmod` to schedule recrawls.
 * Setting it to `new Date()` on every build pollutes that signal — Google
 * learns to trust the value less over time. Using the file's last commit
 * time gives Google an honest freshness hint.
 *
 * Safety: uses execFileSync with an args array (no shell interpolation,
 * not vulnerable to command injection). The file paths passed in are
 * hard-coded constants below; nothing is user-controlled.
 *
 * Fallback to current time if git is unavailable (e.g. some CI sandboxes).
 */
function lastmodFromGit(relPath: string): Date {
  try {
    const repoRoot = path.resolve(__dirname, "../../..");
    const iso = execFileSync(
      "git",
      ["log", "-1", "--format=%aI", "--", relPath],
      {
        cwd: repoRoot,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    if (iso) return new Date(iso);
  } catch {
    // git not available (e.g. detached build env) → fall through
  }
  return new Date();
}

const useCases = [
  {
    slug: "sync-claude-to-claude-code",
    sourcePath: "frontend/src/app/use-cases/[slug]/content.tsx",
  },
  {
    slug: "personal-mcp-memory-server",
    sourcePath: "frontend/src/app/use-cases/[slug]/content.tsx",
  },
  {
    slug: "share-context-multi-client",
    sourcePath: "frontend/src/app/use-cases/[slug]/content.tsx",
  },
  {
    slug: "own-your-ai-memory",
    sourcePath: "frontend/src/app/use-cases/[slug]/content.tsx",
  },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const homeLastmod = lastmodFromGit("frontend/src/app/page.tsx");
  const indexLastmod = lastmodFromGit("frontend/src/app/use-cases/page.tsx");

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: homeLastmod,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/use-cases`,
      lastModified: indexLastmod,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/about/mayank-bohra`,
      lastModified: lastmodFromGit(
        "frontend/src/app/about/mayank-bohra/page.tsx",
      ),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...useCases.map((uc) => ({
      url: `${SITE_URL}/use-cases/${uc.slug}`,
      lastModified: lastmodFromGit(uc.sourcePath),
      changeFrequency: "monthly" as const,
      priority: 0.85,
    })),
  ];
}
