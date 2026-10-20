// ── LLM WIKI LAYER (0.3) ───────────────────────────────────────
// Karpathy's "LLM Wiki" pattern on top of the memory store:
//   raw sources (immutable)  →  wiki pages (LLM-maintained, cited, [[linked]])
//   →  index-led query, good answers filed back as synthesis pages
//   →  lint  →  log  →  plain-markdown mirror for Obsidian.
//
// Schema: migrations/0003_llm_wiki.sql. Tools are registered from
// ContextHub.init() through registerWikiTools().

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type Severity = "low" | "medium" | "high";
type Row = Record<string, unknown>;

export interface WikiDeps {
  db: () => D1Database;
  detectSource: () => string;
  scan: (content: string) => { matched: string[]; severity: Severity | null };
  logInjection: (
    surface: string,
    content: string,
    matched: string[],
    severity: Severity,
    action: "blocked" | "flagged" | "sanitized",
  ) => Promise<void>;
}

export const PAGE_TYPES = [
  "concept",
  "entity",
  "project",
  "summary",
  "synthesis",
] as const;
export type PageType = (typeof PAGE_TYPES)[number];
const SOURCE_KINDS = [
  "article",
  "transcript",
  "document",
  "chat",
  "note",
  "url",
  "other",
] as const;
const MAX_SOURCE_CHARS = 900_000; // D1 rows are capped near 1 MB
const MAX_PAGE_CHARS = 200_000;

// ── text helpers ───────────────────────────────────────────────

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

function oneLine(s: string, max = 280): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// FTS5 treats `-`, `:`, `*`, `"`, `(` … as query syntax, so raw user text such as
// "context-hub" raises a D1 error. Quote every word token instead.
export function ftsQuery(input: string, op: "AND" | "OR" = "AND"): string {
  const tokens = (input.match(/[\p{L}\p{N}_]+/gu) ?? []).slice(0, 16);
  return tokens.map((t) => `"${t}"`).join(op === "AND" ? " " : " OR ");
}

// Run an FTS statement whose first placeholder is the MATCH expression:
// all words first (precise), then any word (recall) when nothing matched.
export async function ftsAll(
  db: D1Database,
  sql: string,
  query: string,
  params: (string | number)[],
): Promise<Row[]> {
  for (const op of ["AND", "OR"] as const) {
    const q = ftsQuery(query, op);
    if (!q) return [];
    const r = await db
      .prepare(sql)
      .bind(q, ...params)
      .all<Row>();
    if (r.results?.length) return r.results;
  }
  return [];
}

const STOPWORDS = new Set(
  "the and for that with this from have are was were will would could should about into their there which when what where while been being than then them they your you our out not but all any can has had its also just more most some such only over very".split(
    " ",
  ),
);

// Words that characterise a source: title words plus its most frequent content words.
function keyTerms(title: string, content: string, max = 12): string {
  const counts = new Map<string, number>();
  for (const w of content.toLowerCase().match(/[\p{L}\p{N}_]{4,}/gu) ?? []) {
    if (!STOPWORDS.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
  const titleWords = (
    title.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []
  ).filter((w) => !STOPWORDS.has(w));
  return [...new Set([...titleWords, ...top])].slice(0, 16).join(" ");
}

interface ParsedLinks {
  pages: string[];
  sources: number[];
  memories: number[];
}

// [[slug]], [[slug|alias]], [[slug#heading]]. [[source-12]] / [[memory-7]] are citations.
export function parseWikiLinks(body: string): ParsedLinks {
  const pages = new Set<string>();
  const sources = new Set<number>();
  const memories = new Set<number>();
  for (const m of body.matchAll(
    /\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g,
  )) {
    const target = m[1].trim();
    const src = /^source-(\d+)$/i.exec(target);
    const mem = /^memory-(\d+)$/i.exec(target);
    if (src) sources.add(Number(src[1]));
    else if (mem) memories.add(Number(mem[1]));
    else {
      const slug = slugify(target);
      if (slug) pages.add(slug);
    }
  }
  return { pages: [...pages], sources: [...sources], memories: [...memories] };
}

const citesSchema = z
  .object({
    sources: z
      .array(z.number().int())
      .default([])
      .describe("Raw source ids this page relies on"),
    memories: z
      .array(z.number().int())
      .default([])
      .describe("Memory ids this page relies on"),
    pages: z
      .array(z.string())
      .default([])
      .describe("Slugs of other pages this page relies on"),
  })
  .optional();
type Cites = { sources: number[]; memories: number[]; pages: string[] };

// ── page upsert (shared by save_page and file_answer) ─────────

interface PageInput {
  slug: string;
  title: string;
  type: PageType;
  summary: string;
  body: string;
  tags: string;
  cites?: Cites;
}

async function missingRefs(
  db: D1Database,
  cites: Cites,
  selfSlug: string,
): Promise<string[]> {
  const missing: string[] = [];
  const check = async (
    table: string,
    col: string,
    values: (string | number)[],
    label: string,
  ) => {
    if (!values.length) return;
    const placeholders = values.map(() => "?").join(",");
    const found = await db
      .prepare(
        `SELECT ${col} AS v FROM ${table} WHERE ${col} IN (${placeholders})`,
      )
      .bind(...values)
      .all<{ v: string | number }>();
    const have = new Set((found.results ?? []).map((r) => String(r.v)));
    for (const v of values)
      if (!have.has(String(v))) missing.push(`${label} ${v}`);
  };
  await check("sources", "id", cites.sources, "source");
  await check("memories", "id", cites.memories, "memory");
  await check(
    "pages",
    "slug",
    cites.pages.filter((s) => s !== selfSlug),
    "page",
  );
  return missing;
}

async function upsertPage(
  deps: WikiDeps,
  input: PageInput,
  surface: string,
  requireCitation: boolean,
): Promise<
  | { ok: true; message: string; revision: number; slug: string }
  | { ok: false; message: string }
> {
  const db = deps.db();
  const slug = slugify(input.slug);
  if (!slug)
    return {
      ok: false,
      message: "Slug is empty after normalisation. Use letters or digits.",
    };
  const summary = oneLine(input.summary);
  if (!summary)
    return {
      ok: false,
      message: "A one-line summary is required: the index shows it.",
    };
  if (input.body.length > MAX_PAGE_CHARS) {
    return {
      ok: false,
      message: `Body is ${input.body.length} chars; split it into linked pages under ${MAX_PAGE_CHARS}.`,
    };
  }

  const scan = deps.scan(`${input.title}\n${summary}\n${input.body}`);
  if (scan.severity === "high") {
    await deps.logInjection(
      surface,
      input.body,
      scan.matched,
      "high",
      "blocked",
    );
    return {
      ok: false,
      message: `⛔ Page blocked: content matched high-severity injection patterns (${scan.matched.join(", ")}). Logged for audit.`,
    };
  }
  if (scan.severity)
    await deps.logInjection(
      surface,
      input.body,
      scan.matched,
      scan.severity,
      "flagged",
    );

  const links = parseWikiLinks(input.body);
  const existing = await db
    .prepare("SELECT id, revision FROM pages WHERE slug = ?")
    .bind(slug)
    .first<{ id: number; revision: number }>();

  // Explicit cites replace the old set; omitted cites on an update keep it.
  let cites: Cites = {
    sources: [...new Set([...(input.cites?.sources ?? []), ...links.sources])],
    memories: [
      ...new Set([...(input.cites?.memories ?? []), ...links.memories]),
    ],
    pages: [
      ...new Set((input.cites?.pages ?? []).map(slugify).filter(Boolean)),
    ],
  };
  if (existing && !input.cites) {
    const old = await db
      .prepare(
        "SELECT target_type, target_ref FROM citations WHERE page_id = ?",
      )
      .bind(existing.id)
      .all<{ target_type: string; target_ref: string }>();
    for (const c of old.results ?? []) {
      if (c.target_type === "source") cites.sources.push(Number(c.target_ref));
      if (c.target_type === "memory") cites.memories.push(Number(c.target_ref));
      if (c.target_type === "page") cites.pages.push(c.target_ref);
    }
    cites = {
      sources: [...new Set(cites.sources)],
      memories: [...new Set(cites.memories)],
      pages: [...new Set(cites.pages)],
    };
  }

  const missing = await missingRefs(db, cites, slug);
  if (missing.length) {
    return {
      ok: false,
      message: `Cited items do not exist: ${missing.join(", ")}. Ingest/save them first, or drop them.`,
    };
  }
  const citeCount =
    cites.sources.length + cites.memories.length + cites.pages.length;
  if (requireCitation && citeCount === 0) {
    return {
      ok: false,
      message:
        "A filed answer must cite at least one source, memory or page it was built from.",
    };
  }

  const who = deps.detectSource();
  const pageId = "(SELECT id FROM pages WHERE slug = ?)";
  const stmts: D1PreparedStatement[] = [];
  if (existing) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO page_revisions (page_id, revision, title, type, summary, body, tags, updated_by, created_at)
           SELECT id, revision, title, type, summary, body, tags, updated_by, updated_at FROM pages WHERE slug = ?`,
        )
        .bind(slug),
      db
        .prepare(
          `UPDATE pages SET title = ?, type = ?, summary = ?, body = ?, tags = ?, revision = revision + 1,
             updated_by = ?, updated_at = datetime('now') WHERE slug = ?`,
        )
        .bind(
          input.title,
          input.type,
          summary,
          input.body,
          input.tags,
          who,
          slug,
        ),
    );
  } else {
    stmts.push(
      db
        .prepare(
          "INSERT INTO pages (slug, title, type, summary, body, tags, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          slug,
          input.title,
          input.type,
          summary,
          input.body,
          input.tags,
          who,
        ),
    );
  }
  stmts.push(
    db
      .prepare(`DELETE FROM page_links WHERE from_page_id = ${pageId}`)
      .bind(slug),
  );
  for (const to of links.pages) {
    if (to === slug) continue;
    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO page_links (from_page_id, to_slug) VALUES (${pageId}, ?)`,
        )
        .bind(slug, to),
    );
  }
  stmts.push(
    db.prepare(`DELETE FROM citations WHERE page_id = ${pageId}`).bind(slug),
  );
  const citeRows: [string, string][] = [
    ...cites.sources.map((v) => ["source", String(v)] as [string, string]),
    ...cites.memories.map((v) => ["memory", String(v)] as [string, string]),
    ...cites.pages
      .filter((p) => p !== slug)
      .map((v) => ["page", v] as [string, string]),
  ];
  for (const [t, ref] of citeRows) {
    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO citations (page_id, target_type, target_ref) VALUES (${pageId}, ?, ?)`,
        )
        .bind(slug, t, ref),
    );
  }
  const revision = existing ? existing.revision + 1 : 1;
  stmts.push(
    db
      .prepare("INSERT INTO context_log (source, summary) VALUES (?, ?)")
      .bind(
        who,
        `Wiki: ${existing ? "updated" : "created"} ${input.type} page [[${slug}]] (rev ${revision}) — ${summary}`,
      ),
  );

  try {
    await db.batch(stmts); // one transaction: page, revision copy, links, citations, log
  } catch (e) {
    return {
      ok: false,
      message: `Could not save page "${slug}" (it may have been saved concurrently). Retry. Detail: ${String(e)}`,
    };
  }

  const dangling = [];
  if (links.pages.length) {
    const placeholders = links.pages.map(() => "?").join(",");
    const found = await db
      .prepare(`SELECT slug FROM pages WHERE slug IN (${placeholders})`)
      .bind(...links.pages)
      .all<{ slug: string }>();
    const have = new Set((found.results ?? []).map((r) => r.slug));
    for (const l of links.pages)
      if (!have.has(l) && l !== slug) dangling.push(l);
  }

  return {
    ok: true,
    slug,
    revision,
    message:
      `Page [[${slug}]] ${existing ? "updated" : "created"} (rev ${revision}, ${input.type}). ` +
      `Links: ${links.pages.length}, citations: ${citeRows.length}.` +
      (dangling.length
        ? `\nNot yet written (create these pages or fix the links): ${dangling.map((d) => `[[${d}]]`).join(", ")}`
        : ""),
  };
}

// ── index + log rendering (tool, MCP resource, markdown export) ─

const TYPE_HEADINGS: Record<PageType, string> = {
  concept: "Concepts",
  entity: "Entities",
  project: "Projects (pages)",
  summary: "Source summaries",
  synthesis: "Syntheses (filed answers)",
};

export async function renderIndex(
  db: D1Database,
  type?: PageType,
): Promise<string> {
  const pages = await db
    .prepare(
      `SELECT slug, title, type, summary, revision, updated_at FROM pages ${type ? "WHERE type = ?" : ""} ORDER BY type, title COLLATE NOCASE`,
    )
    .bind(...(type ? [type] : []))
    .all<Row>();
  const projects = await db
    .prepare(
      "SELECT name, description, status FROM projects WHERE status = 'active' ORDER BY name COLLATE NOCASE",
    )
    .all<Row>();
  const counts = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM pages) AS pages,
              (SELECT COUNT(*) FROM sources) AS sources,
              (SELECT COUNT(*) FROM sources s WHERE NOT EXISTS (SELECT 1 FROM citations c WHERE c.target_type = 'source' AND c.target_ref = CAST(s.id AS TEXT))
                 AND NOT EXISTS (SELECT 1 FROM memories m WHERE m.source_id = s.id)) AS unintegrated,
              (SELECT COUNT(*) FROM memories WHERE superseded_by IS NULL) AS memories`,
    )
    .first<Row>();
  const log = await db
    .prepare(
      "SELECT source, summary, created_at FROM context_log ORDER BY id DESC LIMIT 10",
    )
    .all<Row>();

  const out: string[] = ["# Context Hub index", ""];
  out.push(
    `${counts?.pages ?? 0} pages · ${counts?.sources ?? 0} raw sources (${counts?.unintegrated ?? 0} not yet integrated) · ${counts?.memories ?? 0} active memories`,
    "",
    "Navigate: read this catalog, open pages with get_page, follow [[links]]; search_wiki only when the catalog has no fitting page.",
    "",
  );
  const byType = new Map<string, Row[]>();
  for (const p of pages.results ?? []) {
    const k = String(p.type);
    byType.set(k, [...(byType.get(k) ?? []), p]);
  }
  for (const t of PAGE_TYPES) {
    const rows = byType.get(t);
    if (!rows?.length) continue;
    out.push(`## ${TYPE_HEADINGS[t]}`, "");
    for (const p of rows)
      out.push(`- [[${p.slug}]] — ${p.summary || "(no summary)"}`);
    out.push("");
  }
  if (!pages.results?.length)
    out.push(
      "_No wiki pages yet. Start with ingest_source, then save_page._",
      "",
    );
  if (!type && projects.results?.length) {
    out.push("## Active projects (records)", "");
    for (const p of projects.results)
      out.push(
        `- **${p.name}** — ${oneLine(String(p.description || ""), 160) || "(no description)"}`,
      );
    out.push("");
  }
  if (!type && log.results?.length) {
    out.push("## Recent log", "");
    for (const l of log.results)
      out.push(
        `- ${l.created_at} · ${l.source} · ${oneLine(String(l.summary), 200)}`,
      );
    out.push("");
  }
  return out.join("\n");
}

export async function renderLog(db: D1Database, limit = 200): Promise<string> {
  const log = await db
    .prepare(
      "SELECT source, summary, project_name, created_at FROM context_log ORDER BY id DESC LIMIT ?",
    )
    .bind(limit)
    .all<Row>();
  const out = ["# Context Hub log", "", "Append-only, newest first.", ""];
  for (const l of log.results ?? []) {
    out.push(
      `- ${l.created_at} · ${l.source}${l.project_name ? ` · ${l.project_name}` : ""} · ${oneLine(String(l.summary), 400)}`,
    );
  }
  return out.join("\n");
}

// ── lint ───────────────────────────────────────────────────────

export async function lintWiki(
  db: D1Database,
): Promise<{ issues: number; report: string }> {
  const q = async (sql: string) =>
    (await db.prepare(sql).all<Row>()).results ?? [];
  const broken = await q(
    `SELECT p.slug AS from_slug, l.to_slug FROM page_links l JOIN pages p ON p.id = l.from_page_id
     LEFT JOIN pages t ON t.slug = l.to_slug WHERE t.id IS NULL ORDER BY p.slug`,
  );
  const orphans = await q(
    `SELECT p.slug, p.type FROM pages p WHERE p.type != 'synthesis'
       AND NOT EXISTS (SELECT 1 FROM page_links l JOIN pages f ON f.id = l.from_page_id WHERE l.to_slug = p.slug AND f.id != p.id)
       AND NOT EXISTS (SELECT 1 FROM citations c WHERE c.target_type = 'page' AND c.target_ref = p.slug)
     ORDER BY p.slug`,
  );
  const noSummary = await q(
    "SELECT slug FROM pages WHERE TRIM(summary) = '' ORDER BY slug",
  );
  const uncited = await q(
    `SELECT p.slug, p.type FROM pages p WHERE p.type != 'synthesis'
       AND NOT EXISTS (SELECT 1 FROM citations c WHERE c.page_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM memories m WHERE m.page_slug = p.slug)
     ORDER BY p.slug`,
  );
  const synthNoCites = await q(
    `SELECT p.slug FROM pages p WHERE p.type = 'synthesis' AND NOT EXISTS (SELECT 1 FROM citations c WHERE c.page_id = p.id)`,
  );
  const unintegrated = await q(
    `SELECT s.id, s.title FROM sources s
     WHERE NOT EXISTS (SELECT 1 FROM citations c WHERE c.target_type = 'source' AND c.target_ref = CAST(s.id AS TEXT))
       AND NOT EXISTS (SELECT 1 FROM memories m WHERE m.source_id = s.id)
     ORDER BY s.id`,
  );
  const stale = await q(
    `SELECT p.slug, c.target_ref AS memory_id, m.superseded_by FROM citations c JOIN pages p ON p.id = c.page_id
     LEFT JOIN memories m ON m.id = CAST(c.target_ref AS INTEGER)
     WHERE c.target_type = 'memory' AND (m.id IS NULL OR m.superseded_by IS NOT NULL) ORDER BY p.slug`,
  );
  const deadPageCites = await q(
    `SELECT p.slug, c.target_ref FROM citations c JOIN pages p ON p.id = c.page_id
     LEFT JOIN pages t ON t.slug = c.target_ref WHERE c.target_type = 'page' AND t.id IS NULL`,
  );
  const danglingMemories = await q(
    `SELECT m.id, m.page_slug FROM memories m LEFT JOIN pages p ON p.slug = m.page_slug
     WHERE m.page_slug IS NOT NULL AND p.id IS NULL ORDER BY m.id`,
  );

  const sections: [string, Row[], (r: Row) => string, string][] = [
    [
      "Broken links",
      broken,
      (r) => `[[${r.from_slug}]] → [[${r.to_slug}]] (page does not exist)`,
      "Create the missing page or fix the link with save_page.",
    ],
    [
      "Stale claims",
      stale,
      (r) =>
        `[[${r.slug}]] cites memory ${r.memory_id} — ${r.superseded_by ? `superseded by ${r.superseded_by}` : "deleted"}`,
      "Re-check the claim and update the page to cite the current memory.",
    ],
    [
      "Dead page citations",
      deadPageCites,
      (r) => `[[${r.slug}]] cites missing page [[${r.target_ref}]]`,
      "Write the cited page or drop the citation.",
    ],
    [
      "Sources not yet integrated",
      unintegrated,
      (r) => `source-${r.id}: ${r.title}`,
      "Run the ingest checklist: update or create pages citing it.",
    ],
    [
      "Uncited pages (claims with no evidence)",
      uncited,
      (r) => `[[${r.slug}]] (${r.type})`,
      "Cite the sources/memories the page rests on.",
    ],
    [
      "Syntheses without citations",
      synthNoCites,
      (r) => `[[${r.slug}]]`,
      "Add the pages/sources the answer was built from.",
    ],
    [
      "Orphan pages (nothing links here)",
      orphans,
      (r) => `[[${r.slug}]] (${r.type})`,
      "Link to it from a related page or a hub page.",
    ],
    [
      "Pages missing a summary",
      noSummary,
      (r) => `[[${r.slug}]]`,
      "Add a one-line summary so the index can describe it.",
    ],
    [
      "Memories pointing at missing pages",
      danglingMemories,
      (r) => `memory-${r.id} → [[${r.page_slug}]]`,
      "Create the page or update the memory's page_slug.",
    ],
  ];
  const issues = sections.reduce((n, s) => n + s[1].length, 0);
  const out = [
    `# Wiki lint — ${issues === 0 ? "clean" : `${issues} issue(s)`}`,
    "",
  ];
  for (const [title, rows, fmt, fix] of sections) {
    if (!rows.length) continue;
    out.push(
      `## ${title} (${rows.length})`,
      `Fix: ${fix}`,
      ...rows.slice(0, 50).map((r) => `- ${fmt(r)}`),
      "",
    );
  }
  if (issues === 0)
    out.push(
      "No broken links, stale claims, unintegrated sources, uncited pages or orphans.",
    );
  return { issues, report: out.join("\n") };
}

// ── markdown export (Obsidian mirror) ──────────────────────────

const yamlStr = (v: unknown) => JSON.stringify(v ?? ""); // JSON strings are valid YAML double-quoted scalars

function frontmatter(fields: Record<string, unknown>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) =>
      Array.isArray(v)
        ? `${k}: [${v.map(yamlStr).join(", ")}]`
        : `${k}: ${typeof v === "number" ? v : yamlStr(v)}`,
    );
  return `---\n${lines.join("\n")}\n---\n\n`;
}

export async function exportMarkdown(
  db: D1Database,
): Promise<{ path: string; content: string }[]> {
  const all = async (sql: string) =>
    (await db.prepare(sql).all<Row>()).results ?? [];
  const [
    pages,
    citations,
    sources,
    memories,
    links,
    projects,
    identity,
    instructions,
  ] = await Promise.all([
    all("SELECT * FROM pages ORDER BY slug"),
    all("SELECT c.*, p.slug FROM citations c JOIN pages p ON p.id = c.page_id"),
    all("SELECT * FROM sources ORDER BY id"),
    all("SELECT * FROM memories ORDER BY id"),
    all("SELECT * FROM memory_links ORDER BY id"),
    all("SELECT * FROM projects ORDER BY name"),
    all("SELECT key, value FROM identity ORDER BY key"),
    all(
      "SELECT type, content, priority FROM instructions WHERE active = 1 ORDER BY priority DESC, id",
    ),
  ]);
  const files: { path: string; content: string }[] = [];

  files.push({ path: "index.md", content: await renderIndex(db) });
  files.push({ path: "log.md", content: await renderLog(db, 2000) });

  const schema = [
    "# Schema",
    "",
    "Who the owner is and how every agent must work with this hub.",
    "",
    "## Identity",
    "",
  ];
  for (const i of identity) schema.push(`- **${i.key}:** ${i.value}`);
  schema.push("", "## Instructions", "");
  for (const i of instructions)
    schema.push(`- (${i.type}, priority ${i.priority}) ${i.content}`);
  files.push({ path: "schema.md", content: schema.join("\n") + "\n" });

  const citesBySlug = new Map<string, string[]>();
  for (const c of citations) {
    const link =
      c.target_type === "source"
        ? `[[source-${c.target_ref}]]`
        : c.target_type === "memory"
          ? `[[memory-${c.target_ref}]]`
          : `[[${c.target_ref}]]`;
    citesBySlug.set(String(c.slug), [
      ...(citesBySlug.get(String(c.slug)) ?? []),
      link,
    ]);
  }
  for (const p of pages) {
    const slug = slugify(String(p.slug));
    if (!slug) continue;
    const cites = citesBySlug.get(String(p.slug)) ?? [];
    files.push({
      path: `pages/${slugify(String(p.type)) || "concept"}/${slug}.md`,
      content:
        frontmatter({
          title: p.title,
          type: p.type,
          summary: p.summary,
          tags: String(p.tags || "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          revision: Number(p.revision),
          updated: p.updated_at,
          updated_by: p.updated_by,
        }) +
        `# ${p.title}\n\n> ${p.summary}\n\n${p.body}\n` +
        (cites.length
          ? `\n## Sources\n\n${cites.map((c) => `- ${c}`).join("\n")}\n`
          : ""),
    });
  }

  for (const s of sources) {
    files.push({
      path: `sources/source-${Number(s.id)}.md`,
      content:
        frontmatter({
          title: s.title,
          kind: s.kind,
          url: s.url,
          captured_by: s.captured_by,
          created: s.created_at,
          sha256: s.content_hash,
          immutable: "true",
        }) + `# ${s.title}\n\n${s.content}\n`,
    });
  }

  const linksFrom = new Map<number, string[]>();
  for (const l of links) {
    const from = Number(l.from_id);
    linksFrom.set(from, [
      ...(linksFrom.get(from) ?? []),
      `- ${l.relation} [[memory-${l.to_id}]]${l.note ? ` — ${l.note}` : ""}`,
    ]);
  }
  for (const m of memories) {
    const id = Number(m.id);
    const rel = linksFrom.get(id) ?? [];
    files.push({
      path: `memories/memory-${id}.md`,
      content:
        frontmatter({
          category: m.category,
          source: m.source,
          tags: String(m.tags || "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          confidence:
            m.confidence === null || m.confidence === undefined
              ? undefined
              : Number(m.confidence),
          created: m.created_at,
          updated: m.updated_at,
          superseded_by:
            m.superseded_by === null ? undefined : `memory-${m.superseded_by}`,
        }) +
        `${m.content}\n` +
        (m.page_slug ? `\nPage: [[${slugify(String(m.page_slug))}]]\n` : "") +
        (m.source_id ? `Evidence: [[source-${m.source_id}]]\n` : "") +
        (rel.length ? `\n## Links\n\n${rel.join("\n")}\n` : ""),
    });
  }

  for (const p of projects) {
    const slug = slugify(String(p.name));
    if (!slug) continue;
    files.push({
      path: `projects/project-${slug}.md`,
      content:
        frontmatter({ name: p.name, status: p.status, updated: p.updated_at }) +
        `# ${p.name}\n\n${p.description || ""}\n` +
        (p.instructions ? `\n## Instructions\n\n${p.instructions}\n` : ""),
    });
  }
  return files;
}

// ── memory ↔ wiki pointers (used by save_memory) ───────────────

export async function attachMemory(
  db: D1Database,
  memoryId: number,
  sourceId?: number,
  pageSlug?: string,
): Promise<string> {
  if (sourceId === undefined && !pageSlug) return "";
  const notes: string[] = [];
  let src: number | null = null;
  if (sourceId !== undefined) {
    const exists = await db
      .prepare("SELECT id FROM sources WHERE id = ?")
      .bind(sourceId)
      .first();
    if (exists) src = sourceId;
    else notes.push(`source ${sourceId} does not exist, not linked`);
  }
  const slug = pageSlug ? slugify(pageSlug) || null : null;
  await db
    .prepare(
      "UPDATE memories SET source_id = COALESCE(?, source_id), page_slug = COALESCE(?, page_slug) WHERE id = ?",
    )
    .bind(src, slug, memoryId)
    .run();
  if (src !== null) notes.push(`evidence: source-${src}`);
  if (slug) notes.push(`page: [[${slug}]]`);
  return ` Wiki: ${notes.join("; ")}.`;
}

// ── tools ──────────────────────────────────────────────────────

export const WIKI_INSTRUCTIONS = `Context Hub is a personal LLM Wiki (Karpathy pattern) plus a fast memory layer.
Layers: raw sources (immutable) → wiki pages you maintain (concept/entity/project/summary/synthesis, cross-linked with [[slug]]) → memories (atomic facts).
- INGEST: when the user shares an article, transcript, document or long note, call ingest_source, then follow its checklist: update every touched page with save_page (cite the source), create pages for new concepts/entities, save atomic facts with save_memory(source_id, page_slug).
- QUERY: start from get_index (or the contexthub://index resource), open pages with get_page and follow [[links]]; use search_wiki only when the index has no fitting page. Cite pages/sources in your answer.
- FILE BACK: when an answer took real synthesis, store it with file_answer citing what it used, so the wiki compounds.
- LINT: run lint_wiki after larger edits and fix what it reports.
Every write is logged (get_recent_context / contexthub://log).`;

export function registerWikiTools(server: McpServer, deps: WikiDeps): void {
  const db = () => deps.db();

  server.registerResource(
    "wiki-index",
    "contexthub://index",
    {
      title: "Context Hub index",
      description:
        "Catalog of every wiki page with one-line summaries, active projects and the recent log.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: await renderIndex(db()),
        },
      ],
    }),
  );
  server.registerResource(
    "wiki-log",
    "contexthub://log",
    {
      title: "Context Hub log",
      description:
        "Append-only log of ingests, page edits, filed answers and session breadcrumbs.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: await renderLog(db()),
        },
      ],
    }),
  );

  server.tool(
    "ingest_source",
    `Store a raw source (article, transcript, document, chat export, long note) in the immutable source layer, and get back the wiki pages and memories it touches.

WHEN TO USE: whenever the user shares material worth keeping, before summarising it. Sources are never edited; re-ingesting identical text returns the existing id.

AFTER CALLING: follow the returned checklist — update each touched page with save_page citing this source, create pages for new concepts/entities, save atomic facts with save_memory(source_id, page_slug), then lint_wiki.`,
    {
      title: z.string().min(1).describe("Short title of the source"),
      content: z
        .string()
        .min(1)
        .describe("The full raw text. Do not summarise it here."),
      kind: z
        .enum(SOURCE_KINDS)
        .default("note")
        .describe(
          "article | transcript | document | chat | note | url | other",
        ),
      url: z.string().optional().describe("Original URL, if any"),
    },
    async ({ title, content, kind, url }) => {
      if (content.length > MAX_SOURCE_CHARS) {
        return text(
          `Source is ${content.length} chars; the limit is ${MAX_SOURCE_CHARS}. Split it into parts ("${title} (1/3)", …) and ingest each.`,
        );
      }
      const scan = deps.scan(`${title}\n${content}`);
      if (scan.severity === "high") {
        await deps.logInjection(
          "ingest_source",
          content,
          scan.matched,
          "high",
          "blocked",
        );
        return text(
          `⛔ Source blocked: it matched high-severity injection patterns (${scan.matched.join(", ")}). Sources are immutable, so it was not stored. Logged for audit.`,
        );
      }
      if (scan.severity)
        await deps.logInjection(
          "ingest_source",
          content,
          scan.matched,
          scan.severity,
          "flagged",
        );

      const d = db();
      const hash = await sha256Hex(content);
      const prior = await d
        .prepare("SELECT id, title FROM sources WHERE content_hash = ?")
        .bind(hash)
        .first<{ id: number; title: string }>();
      let id: number;
      if (prior) {
        id = prior.id;
      } else {
        const who = deps.detectSource();
        const ins = await d
          .prepare(
            "INSERT INTO sources (title, kind, url, content, content_hash, captured_by) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .bind(title, kind, url ?? null, content, hash, who)
          .run();
        id = Number(ins.meta.last_row_id);
        await d
          .prepare("INSERT INTO context_log (source, summary) VALUES (?, ?)")
          .bind(who, `Ingested source-${id} (${kind}): ${oneLine(title, 160)}`)
          .run();
      }

      const terms = keyTerms(title, content);
      const pages = await ftsAll(
        d,
        `SELECT p.slug, p.type, p.summary FROM pages_fts f JOIN pages p ON p.id = f.rowid WHERE pages_fts MATCH ? ORDER BY rank LIMIT 8`,
        terms,
        [],
      ).catch(() => [] as Row[]);
      const mems = await ftsAll(
        d,
        `SELECT m.id, m.content FROM memories_fts f JOIN memories m ON m.id = f.rowid WHERE memories_fts MATCH ? AND m.superseded_by IS NULL ORDER BY rank LIMIT 8`,
        terms,
        [],
      ).catch(() => [] as Row[]);

      const out = [
        prior
          ? `Already ingested as source-${id} ("${prior.title}"); nothing new stored.`
          : `Ingested source-${id}: "${title}" (${kind}, ${content.length} chars, immutable).`,
        "",
        pages.length
          ? "Pages this source touches:"
          : "No existing page matches — this source likely needs new pages.",
        ...pages.map((p) => `- [[${p.slug}]] (${p.type}) — ${p.summary}`),
        "",
        mems.length
          ? "Related memories (check for contradictions/updates):"
          : "",
        ...mems.map(
          (m) => `- memory-${m.id}: ${oneLine(String(m.content), 160)}`,
        ),
        "",
        "Ingest checklist:",
        `1. Write a summary page: save_page(type="summary", slug="source-${id}-summary" or a better slug, cites.sources=[${id}]).`,
        `2. Update each touched page above with what this source adds or changes; cite sources=[${id}].`,
        "3. Create concept/entity pages for important new ideas or names; connect them with [[slug]] links.",
        `4. Save atomic facts with save_memory(..., source_id=${id}, page_slug=<page>); link contradictions with link_memories.`,
        "5. Run lint_wiki and fix what it reports.",
      ];
      return text(
        out.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n"),
      );
    },
  );

  server.tool(
    "get_source",
    "Read one raw source in full, with the pages and memories built from it.",
    { id: z.number().int().describe("Source id (the N in source-N)") },
    async ({ id }) => {
      const d = db();
      const s = await d
        .prepare("SELECT * FROM sources WHERE id = ?")
        .bind(id)
        .first<Row>();
      if (!s) return text(`source-${id} does not exist.`);
      const pages = await d
        .prepare(
          "SELECT p.slug, p.type, p.summary FROM citations c JOIN pages p ON p.id = c.page_id WHERE c.target_type = 'source' AND c.target_ref = ?",
        )
        .bind(String(id))
        .all<Row>();
      const mems = await d
        .prepare(
          "SELECT id, content FROM memories WHERE source_id = ? LIMIT 50",
        )
        .bind(id)
        .all<Row>();
      return text(
        [
          `# source-${id}: ${s.title}`,
          `kind: ${s.kind} · captured by ${s.captured_by} · ${s.created_at}${s.url ? ` · ${s.url}` : ""}`,
          "",
          String(s.content),
          "",
          `## Built from this source`,
          ...(pages.results ?? []).map(
            (p) => `- [[${p.slug}]] (${p.type}) — ${p.summary}`,
          ),
          ...(mems.results ?? []).map(
            (m) => `- memory-${m.id}: ${oneLine(String(m.content), 160)}`,
          ),
          pages.results?.length || mems.results?.length
            ? ""
            : "_Nothing yet — this source is not integrated._",
        ].join("\n"),
      );
    },
  );

  server.tool(
    "list_sources",
    "List raw sources (newest first) and whether each has been integrated into the wiki.",
    {
      kind: z.enum(SOURCE_KINDS).optional(),
      limit: z.number().int().min(1).max(200).default(30),
    },
    async ({ kind, limit }) => {
      const r = await db()
        .prepare(
          `SELECT s.id, s.title, s.kind, s.created_at, LENGTH(s.content) AS chars,
             (SELECT COUNT(*) FROM citations c WHERE c.target_type = 'source' AND c.target_ref = CAST(s.id AS TEXT)) AS cited_by
           FROM sources s ${kind ? "WHERE s.kind = ?" : ""} ORDER BY s.id DESC LIMIT ?`,
        )
        .bind(...(kind ? [kind, limit] : [limit]))
        .all<Row>();
      if (!r.results?.length) return text("No sources yet. Use ingest_source.");
      return text(
        r.results
          .map(
            (s) =>
              `source-${s.id} · ${s.kind} · ${s.created_at} · ${s.chars} chars · ${Number(s.cited_by) ? `cited by ${s.cited_by} page(s)` : "NOT integrated"}\n  ${s.title}`,
          )
          .join("\n"),
      );
    },
  );

  server.tool(
    "save_page",
    `Create or update a wiki page (markdown). The previous version is kept in page history.

WHEN TO USE: during ingest (summary page + every touched page), when a topic deserves a durable explanation, or to fix a lint finding.

RULES: one-line summary (shown in the index); link related pages with [[slug]]; cite what the page rests on in cites (or inline as [[source-N]] / [[memory-N]]). Omitting cites on an update keeps the existing ones.`,
    {
      slug: z
        .string()
        .min(1)
        .describe("Page id, lowercase-kebab (normalised automatically)"),
      title: z.string().min(1),
      type: z
        .enum(PAGE_TYPES)
        .default("concept")
        .describe("concept | entity | project | summary | synthesis"),
      summary: z.string().min(1).describe("One line for the index"),
      body: z
        .string()
        .default("")
        .describe("Markdown body with [[slug]] links"),
      tags: z.string().default("").describe("Comma-separated tags"),
      cites: citesSchema,
    },
    async (args) => {
      const r = await upsertPage(
        deps,
        { ...args, cites: args.cites as Cites | undefined },
        "save_page",
        args.type === "synthesis",
      );
      return text(r.message);
    },
  );

  server.tool(
    "get_page",
    "Open a wiki page: body, citations, outgoing links, backlinks and the facts (memories) filed under it.",
    { slug: z.string().min(1) },
    async ({ slug: raw }) => {
      const d = db();
      const slug = slugify(raw);
      const p = await d
        .prepare("SELECT * FROM pages WHERE slug = ?")
        .bind(slug)
        .first<Row>();
      if (!p) {
        const near = await ftsAll(
          d,
          "SELECT p.slug, p.summary FROM pages_fts f JOIN pages p ON p.id = f.rowid WHERE pages_fts MATCH ? ORDER BY rank LIMIT 5",
          raw,
          [],
        ).catch(() => [] as Row[]);
        return text(
          `No page [[${slug}]].${near.length ? `\nClosest:\n${near.map((n) => `- [[${n.slug}]] — ${n.summary}`).join("\n")}` : ""}`,
        );
      }
      const [cites, outLinks, backlinks, facts] = await Promise.all([
        d
          .prepare(
            `SELECT c.target_type, c.target_ref,
               CASE c.target_type WHEN 'source' THEN (SELECT title FROM sources WHERE id = CAST(c.target_ref AS INTEGER))
                                  WHEN 'memory' THEN (SELECT content FROM memories WHERE id = CAST(c.target_ref AS INTEGER))
                                  ELSE (SELECT summary FROM pages WHERE slug = c.target_ref) END AS label
             FROM citations c WHERE c.page_id = ?`,
          )
          .bind(p.id)
          .all<Row>(),
        d
          .prepare(
            "SELECT l.to_slug, t.summary FROM page_links l LEFT JOIN pages t ON t.slug = l.to_slug WHERE l.from_page_id = ?",
          )
          .bind(p.id)
          .all<Row>(),
        d
          .prepare(
            "SELECT f.slug, f.summary FROM page_links l JOIN pages f ON f.id = l.from_page_id WHERE l.to_slug = ? AND f.id != ?",
          )
          .bind(slug, p.id)
          .all<Row>(),
        d
          .prepare(
            "SELECT id, content, superseded_by FROM memories WHERE page_slug = ? ORDER BY id",
          )
          .bind(slug)
          .all<Row>(),
      ]);
      const cite = (c: Row) =>
        c.target_type === "source"
          ? `[[source-${c.target_ref}]] ${c.label ?? "(missing)"}`
          : c.target_type === "memory"
            ? `[[memory-${c.target_ref}]] ${oneLine(String(c.label ?? "(missing)"), 140)}`
            : `[[${c.target_ref}]] ${c.label ?? "(missing page)"}`;
      return text(
        [
          `# ${p.title}  ([[${slug}]], ${p.type}, rev ${p.revision}, updated ${p.updated_at} by ${p.updated_by})`,
          `> ${p.summary}`,
          "",
          String(p.body),
          "",
          `## Citations (${cites.results?.length ?? 0})`,
          ...(cites.results ?? []).map((c) => `- ${cite(c)}`),
          "",
          `## Links out`,
          ...(outLinks.results ?? []).map(
            (l) => `- [[${l.to_slug}]] ${l.summary ?? "— NOT WRITTEN YET"}`,
          ),
          "",
          `## Backlinks`,
          ...(backlinks.results ?? []).map(
            (b) => `- [[${b.slug}]] — ${b.summary}`,
          ),
          "",
          `## Facts filed here`,
          ...(facts.results ?? []).map(
            (m) =>
              `- memory-${m.id}${m.superseded_by ? ` (superseded by ${m.superseded_by})` : ""}: ${oneLine(String(m.content), 200)}`,
          ),
        ].join("\n"),
      );
    },
  );

  server.tool(
    "get_page_history",
    "List a page's previous revisions, or read one revision in full.",
    {
      slug: z.string().min(1),
      revision: z
        .number()
        .int()
        .optional()
        .describe("Return this revision's full text"),
    },
    async ({ slug: raw, revision }) => {
      const d = db();
      const slug = slugify(raw);
      const p = await d
        .prepare("SELECT id, revision, updated_at FROM pages WHERE slug = ?")
        .bind(slug)
        .first<Row>();
      if (!p) return text(`No page [[${slug}]].`);
      if (revision !== undefined) {
        const r = await d
          .prepare(
            "SELECT * FROM page_revisions WHERE page_id = ? AND revision = ?",
          )
          .bind(p.id, revision)
          .first<Row>();
        if (!r)
          return text(
            `[[${slug}]] has no stored revision ${revision} (current is ${p.revision}; use get_page for it).`,
          );
        return text(
          `# ${r.title} — rev ${r.revision} (${r.created_at}, by ${r.updated_by})\n> ${r.summary}\n\n${r.body}`,
        );
      }
      const r = await d
        .prepare(
          "SELECT revision, summary, updated_by, created_at FROM page_revisions WHERE page_id = ? ORDER BY revision DESC",
        )
        .bind(p.id)
        .all<Row>();
      return text(
        [
          `[[${slug}]] — current rev ${p.revision} (${p.updated_at})`,
          ...(r.results ?? []).map(
            (x) =>
              `- rev ${x.revision} · ${x.created_at} · ${x.updated_by} · ${x.summary}`,
          ),
        ].join("\n"),
      );
    },
  );

  server.tool(
    "get_index",
    `The wiki's table of contents: every page with its one-line summary, grouped by type, plus active projects, counts and the recent log.

WHEN TO USE: FIRST, before answering anything that the user's own knowledge might cover. Navigate from here with get_page instead of keyword searching.`,
    { type: z.enum(PAGE_TYPES).optional().describe("Only this page type") },
    async ({ type }) => text(await renderIndex(db(), type)),
  );

  server.tool(
    "search_wiki",
    "Full-text search across wiki pages, raw sources and memories at once. Use when get_index has no obviously fitting page. Hyphens and punctuation are safe.",
    {
      query: z.string().min(1),
      limit: z.number().int().min(1).max(25).default(8),
    },
    async ({ query, limit }) => {
      const d = db();
      const [pages, sources, mems] = await Promise.all([
        ftsAll(
          d,
          "SELECT p.slug, p.type, p.summary, snippet(pages_fts, 2, '«', '»', '…', 12) AS snip FROM pages_fts JOIN pages p ON p.id = pages_fts.rowid WHERE pages_fts MATCH ? ORDER BY rank LIMIT ?",
          query,
          [limit],
        ),
        ftsAll(
          d,
          "SELECT s.id, s.title, snippet(sources_fts, 1, '«', '»', '…', 12) AS snip FROM sources_fts JOIN sources s ON s.id = sources_fts.rowid WHERE sources_fts MATCH ? ORDER BY rank LIMIT ?",
          query,
          [limit],
        ),
        ftsAll(
          d,
          "SELECT m.id, m.content, m.page_slug FROM memories_fts JOIN memories m ON m.id = memories_fts.rowid WHERE memories_fts MATCH ? AND m.superseded_by IS NULL ORDER BY rank LIMIT ?",
          query,
          [limit],
        ),
      ]);
      if (!pages.length && !sources.length && !mems.length)
        return text(
          `Nothing matches "${query}". The topic may be missing from the wiki; ingest a source or write a page.`,
        );
      return text(
        [
          pages.length ? `## Pages (${pages.length})` : "",
          ...pages.map(
            (p) =>
              `- [[${p.slug}]] (${p.type}) — ${p.summary}\n  ${oneLine(String(p.snip), 240)}`,
          ),
          sources.length ? `\n## Raw sources (${sources.length})` : "",
          ...sources.map(
            (s) =>
              `- source-${s.id}: ${s.title}\n  ${oneLine(String(s.snip), 240)}`,
          ),
          mems.length ? `\n## Memories (${mems.length})` : "",
          ...mems.map(
            (m) =>
              `- memory-${m.id}${m.page_slug ? ` → [[${m.page_slug}]]` : ""}: ${oneLine(String(m.content), 200)}`,
          ),
        ]
          .filter(Boolean)
          .join("\n"),
      );
    },
  );

  server.tool(
    "file_answer",
    `File a good answer back into the wiki as a synthesis page, so the knowledge compounds instead of being re-derived.

WHEN TO USE: after answering a question that took real synthesis across pages, sources or memories (comparisons, decisions, explanations the user may ask again). Must cite at least one thing it was built from.`,
    {
      question: z.string().min(1).describe("The question as the user asked it"),
      answer: z
        .string()
        .min(1)
        .describe("The answer in markdown; may include [[slug]] links"),
      cites: citesSchema,
      slug: z
        .string()
        .optional()
        .describe("Defaults to a slug of the question"),
      summary: z
        .string()
        .optional()
        .describe("One line for the index; defaults to the question"),
    },
    async ({ question, answer, cites, slug, summary }) => {
      const r = await upsertPage(
        deps,
        {
          slug: slug ?? `q-${slugify(question)}`,
          title: oneLine(question, 200),
          type: "synthesis",
          summary: summary ?? oneLine(question, 200),
          body: `**Question:** ${question}\n\n${answer}`,
          tags: "filed-answer",
          cites: (cites as Cites | undefined) ?? {
            sources: [],
            memories: [],
            pages: [],
          },
        },
        "file_answer",
        true,
      );
      return text(
        r.ok
          ? `${r.message}\nFiled answer is now in the index under Syntheses.`
          : r.message,
      );
    },
  );

  server.tool(
    "lint_wiki",
    "Health-check the wiki: broken [[links]], stale claims (citing superseded/deleted memories), sources not yet integrated, uncited pages, citation-less syntheses, orphan pages, missing summaries, dangling memory→page pointers. Returns each finding with how to fix it.",
    {},
    async () => text((await lintWiki(db())).report),
  );
}
