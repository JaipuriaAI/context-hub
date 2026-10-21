import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface Env {
  DB: D1Database;
  CONTEXT_HUB: DurableObjectNamespace;
  API_KEY?: string; // Optional: protect your hub with a shared secret
}

// ── INJECTION SCANNER ──────────────────────────────────────────
// Hermes-style prompt-injection detection on every write surface.
// Returns matched rule IDs + severity. Tool decides whether to block or flag.
const INJECTION_PATTERNS: Array<{
  id: string;
  pattern: RegExp;
  severity: "low" | "medium" | "high";
}> = [
  {
    id: "ignore_previous",
    pattern: /ignore (all|any|previous|prior)\s+(instructions|rules|prompts)/i,
    severity: "high",
  },
  {
    id: "system_override",
    pattern: /you are (now|actually|really)\s+(a|an)\s+/i,
    severity: "medium",
  },
  {
    id: "exfil_curl",
    pattern: /\b(curl|wget|fetch)\s+(https?:\/\/|-X\s+POST)/i,
    severity: "high",
  },
  {
    id: "ssh_backdoor",
    pattern: /ssh-(rsa|ed25519|dss)\s+[A-Za-z0-9+/=]{50,}/i,
    severity: "high",
  },
  {
    id: "shell_pipe",
    pattern: /\$\(.*\)|`[^`]{20,}`|;\s*(rm|curl|wget|nc)\s+/i,
    severity: "medium",
  },
  {
    id: "tool_jailbreak",
    pattern: /\b(developer mode|dan mode|jailbreak|sudo override)\b/i,
    severity: "medium",
  },
  {
    id: "memory_overwrite",
    pattern: /delete (all|every) (memory|memories|instruction)/i,
    severity: "high",
  },
  {
    id: "system_prompt_leak",
    pattern:
      /(print|show|reveal|repeat)\s+(your|the)\s+(system|initial)\s+(prompt|instructions)/i,
    severity: "medium",
  },
];

function scanForInjection(content: string): {
  matched: string[];
  severity: "low" | "medium" | "high" | null;
} {
  const matched: string[] = [];
  let maxSev: "low" | "medium" | "high" | null = null;
  const rank = { low: 1, medium: 2, high: 3 };
  for (const rule of INJECTION_PATTERNS) {
    if (rule.pattern.test(content)) {
      matched.push(rule.id);
      if (!maxSev || rank[rule.severity] > rank[maxSev]) maxSev = rule.severity;
    }
  }
  return { matched, severity: maxSev };
}

// Append-only suggestion appended to tool responses to nudge users toward
// better hygiene without breaking existing tool contracts. Format is intentionally
// human + LLM readable so any client surfaces it naturally.
type Suggestion = { kind: string; message: string; action?: string };
function formatSuggestions(suggestions: Suggestion[]): string {
  if (!suggestions.length) return "";
  const lines = suggestions.map(
    (s) => `• [${s.kind}] ${s.message}${s.action ? `\n  → ${s.action}` : ""}`,
  );
  return `\n\n💡 hub_suggestion:\n${lines.join("\n")}`;
}

export class ContextHub extends McpAgent<Env> {
  server = new McpServer({
    name: "Context Hub",
    version: "0.2.0",
  });

  // Return the MCP client's self-reported name, slugified for safe DB/URL use.
  // Every MCP client sends clientInfo.name during the initialize handshake
  // (e.g. "claude-code", "ChatGPT", "Perplexity", "cursor-vscode", or any custom
  // agent system's own name). We do not map or translate — the client's own name
  // is the source of truth. Falls back to "unknown" only if clientInfo is absent.
  private detectSource(): string {
    const name = this.server.server.getClientVersion()?.name;
    if (!name) return "unknown";

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
    return slug || "unknown";
  }

  // Log an injection scan hit. Doesn't block — surfaces in the response.
  private async logInjection(
    surface: string,
    content: string,
    matched: string[],
    severity: "low" | "medium" | "high",
    action: "blocked" | "flagged" | "sanitized",
  ): Promise<void> {
    try {
      await this.env.DB.prepare(
        "INSERT INTO injection_log (source, surface, content_preview, patterns_matched, severity, action_taken) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(
          this.detectSource(),
          surface,
          content.slice(0, 200),
          matched.join(","),
          severity,
          action,
        )
        .run();
    } catch {
      // injection_log table may not exist on older deploys — fail silent
    }
  }

  // Record a reflection (contradiction, skill candidate, etc.). Pending until acted on.
  private async recordReflection(
    trigger: string,
    observation: string,
    proposedChange: string = "",
    relatedIds: string = "",
  ): Promise<number | null> {
    try {
      const r = await this.env.DB.prepare(
        "INSERT INTO reflections (trigger, observation, proposed_change, related_ids) VALUES (?, ?, ?, ?)",
      )
        .bind(trigger, observation, proposedChange, relatedIds)
        .run();
      return (r.meta?.last_row_id as number) ?? null;
    } catch {
      return null;
    }
  }

  // Bump access_count + last_accessed_at and auto-promote to hot tier if
  // a memory is hit often. Cheap fire-and-forget — failures don't break reads.
  private async bumpAccess(ids: number[]): Promise<void> {
    if (!ids.length) return;
    try {
      const placeholders = ids.map(() => "?").join(",");
      await this.env.DB.prepare(
        `UPDATE memories
         SET access_count = access_count + 1,
             last_accessed_at = datetime('now'),
             tier = CASE WHEN access_count + 1 >= 5 AND tier = 'warm' THEN 'hot' ELSE tier END
         WHERE id IN (${placeholders})`,
      )
        .bind(...ids)
        .run();
    } catch {
      // Tier columns may not exist on older deploys
    }
  }

  // Build the suggestion block for a save-style response. Looks at recent
  // pending reflections + global hub state and surfaces what the user should do.
  private async buildSuggestions(): Promise<Suggestion[]> {
    const out: Suggestion[] = [];
    try {
      const pending = await this.env.DB.prepare(
        "SELECT id, trigger, observation FROM reflections WHERE status = 'pending' ORDER BY created_at DESC LIMIT 3",
      ).all();
      for (const r of pending.results || []) {
        const row = r as Record<string, unknown>;
        out.push({
          kind: row.trigger as string,
          message: row.observation as string,
          action: `Call resolve_reflection with id=${row.id} after acting.`,
        });
      }
    } catch {
      // reflections table may not exist
    }
    return out;
  }

  async init() {
    // ── MEMORIES ──────────────────────────────────────────────

    this.server.tool(
      "save_memory",
      `Save a memory about the user. Auto-deduplicates — if a similar memory exists, it updates instead of creating a duplicate.

WHEN TO USE: Whenever the user shares a preference, makes a decision, reveals a fact about themselves, or you learn something worth remembering across sessions. Be proactive — save without being asked.

SMART BEHAVIOR:
- If user says something like "I prefer X" → category: "preference"
- If user makes a decision like "let's go with X" → category: "decision"
- If user teaches you something → category: "learning"
- If it's about a specific project → category: "project"
- Source is auto-detected from the MCP client — do NOT pass source unless the user explicitly asks to override it (e.g. tagging a manual/import entry).
- Add relevant tags for searchability (comma-separated, lowercase)`,
      {
        content: z.string().describe("The memory content to save"),
        category: z
          .enum(["general", "preference", "decision", "learning", "project"])
          .default("general")
          .describe("Category of memory"),
        tags: z
          .string()
          .default("")
          .describe(
            "Comma-separated tags for filtering (e.g. 'python,auth,backend')",
          ),
        source: z
          .string()
          .optional()
          .describe(
            "Where this memory was captured. Auto-detected from the MCP client name if omitted (e.g. claude-code, chatgpt, perplexity, cursor). Only pass explicitly for 'manual' or 'import' seeding.",
          ),
      },
      async ({ content, category, tags, source }) => {
        const db = this.env.DB;
        const resolvedSource = source ?? this.detectSource();

        // 0.2 — Injection scan. We flag (not block) so the user can review.
        const scan = scanForInjection(content);
        if (scan.severity === "high") {
          await this.logInjection(
            "save_memory",
            content,
            scan.matched,
            scan.severity,
            "blocked",
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `⛔ Memory blocked. Content matched high-severity injection patterns: ${scan.matched.join(", ")}.\n\nIf this is legitimate, rephrase or use save_memory with a safer wording. Logged to injection_log for audit.`,
              },
            ],
          };
        }
        if (scan.severity) {
          await this.logInjection(
            "save_memory",
            content,
            scan.matched,
            scan.severity,
            "flagged",
          );
        }

        // Dedup check: look for existing memories with similar content
        // First try exact match
        const exact = await db
          .prepare("SELECT id, content FROM memories WHERE content = ? LIMIT 1")
          .bind(content)
          .first();

        if (exact) {
          // Exact duplicate — update timestamp and tags instead of inserting
          await db
            .prepare(
              "UPDATE memories SET tags = ?, updated_at = datetime('now') WHERE id = ?",
            )
            .bind(tags || (exact as Record<string, unknown>).tags, exact.id)
            .run();
          return {
            content: [
              {
                type: "text" as const,
                text: `Memory already exists (id: ${exact.id}), refreshed timestamp. No duplicate created.`,
              },
            ],
          };
        }

        // Fuzzy dedup: use FTS5 to find semantically similar memories in same category
        // Extract key words (3+ chars) for matching
        const keywords = content
          .toLowerCase()
          .replace(/[^\w\s]/g, "")
          .split(/\s+/)
          .filter((w) => w.length >= 3)
          .slice(0, 8)
          .join(" OR ");

        if (keywords) {
          const similar = await db
            .prepare(
              `SELECT m.id, m.content FROM memories_fts fts
               JOIN memories m ON fts.rowid = m.id
               WHERE fts.content MATCH ? AND m.category = ?
               ORDER BY rank LIMIT 3`,
            )
            .bind(keywords, category)
            .all();

          // Check if any result is very similar (shares >60% of significant words)
          if (similar.results?.length) {
            const contentWords = new Set(
              content
                .toLowerCase()
                .replace(/[^\w\s]/g, "")
                .split(/\s+/)
                .filter((w) => w.length >= 3),
            );
            for (const row of similar.results) {
              const existingWords = new Set(
                (row.content as string)
                  .toLowerCase()
                  .replace(/[^\w\s]/g, "")
                  .split(/\s+/)
                  .filter((w: string) => w.length >= 3),
              );
              const overlap = [...contentWords].filter((w) =>
                existingWords.has(w),
              ).length;
              const similarity =
                overlap / Math.max(contentWords.size, existingWords.size);

              if (similarity > 0.6) {
                // Very similar — update existing instead of creating duplicate
                await db
                  .prepare(
                    "UPDATE memories SET content = ?, tags = ?, source = ?, updated_at = datetime('now'), verified_at = datetime('now'), confidence = MIN(1.0, confidence + 0.1) WHERE id = ?",
                  )
                  .bind(content, tags, resolvedSource, row.id)
                  .run();
                return {
                  content: [
                    {
                      type: "text" as const,
                      text:
                        `Similar memory found (id: ${row.id}), updated with new content. confidence bumped, verified_at refreshed.` +
                        formatSuggestions(await this.buildSuggestions()),
                    },
                  ],
                };
              }
              // 0.2 — Contradiction detection: similarity 0.3-0.6 with opposing
              // signal words ("prefer/hate", "use/avoid", "always/never") suggests
              // the new memory may contradict the old. Record a reflection.
              if (similarity >= 0.3 && similarity <= 0.6) {
                const oppositePairs = [
                  ["prefer", "hate"],
                  ["love", "hate"],
                  ["use", "avoid"],
                  ["always", "never"],
                  ["enable", "disable"],
                  ["like", "dislike"],
                ];
                const newC = content.toLowerCase();
                const oldC = (row.content as string).toLowerCase();
                const contradicts = oppositePairs.some(
                  ([a, b]) =>
                    (newC.includes(a) && oldC.includes(b)) ||
                    (newC.includes(b) && oldC.includes(a)),
                );
                if (contradicts) {
                  await this.recordReflection(
                    "contradiction",
                    `New memory may contradict memory #${row.id}. Old: "${(row.content as string).slice(0, 120)}" — New: "${content.slice(0, 120)}"`,
                    JSON.stringify({
                      action: "review_contradiction",
                      target_id: row.id,
                    }),
                    String(row.id),
                  );
                }
              }
            }
          }
        }

        // No duplicate found — insert new (with 0.2 provenance fields)
        const result = await db
          .prepare(
            "INSERT INTO memories (content, category, tags, source, verified_at, confidence) VALUES (?, ?, ?, ?, datetime('now'), 0.8)",
          )
          .bind(content, category, tags, resolvedSource)
          .run();

        const newId = result.meta.last_row_id as number;

        // 0.2 — Skill-candidate detection. If content describes a procedure
        // (categories: decision/learning; signal words: "first", "then",
        // "step", "always when"), record a skill candidate for the user to promote.
        const procedural =
          /\b(first|then|next|step\s*\d|finally|always when|whenever|process is)\b/i;
        if (
          (category === "learning" || category === "decision") &&
          procedural.test(content) &&
          content.length >= 80
        ) {
          await this.recordReflection(
            "skill_candidate",
            `Memory #${newId} reads like a procedure. Promote it to a reusable skill so the next similar task auto-loads it.`,
            JSON.stringify({ action: "promote_to_skill", target_id: newId }),
            String(newId),
          );
        }

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Memory saved (id: ${newId}). Category: ${category}, Source: ${resolvedSource}, Confidence: 0.8` +
                formatSuggestions(await this.buildSuggestions()),
            },
          ],
        };
      },
    );

    this.server.tool(
      "search_memories",
      `Search through saved memories using full-text search.

WHEN TO USE: Before asking the user to repeat something, when you need to recall a past decision, preference, or fact. If the user says "didn't I tell you about X?" or "remember when we discussed Y?" — search first, don't guess.

SMART BEHAVIOR: Use natural keywords from the user's question as the query. If no results, try broader terms or synonyms.`,
      {
        query: z.string().describe("Search query — natural language works"),
        category: z
          .string()
          .optional()
          .describe(
            "Filter by category (general, preference, decision, learning, project)",
          ),
        limit: z.number().default(10).describe("Max results to return"),
      },
      async ({ query, category, limit }) => {
        const db = this.env.DB;
        let sql: string;
        const params: (string | number)[] = [];

        if (category) {
          sql = `SELECT m.id, m.content, m.category, m.tags, m.source, m.created_at
                 FROM memories_fts fts
                 JOIN memories m ON fts.rowid = m.id
                 WHERE fts.content MATCH ? AND m.category = ?
                 ORDER BY rank
                 LIMIT ?`;
          params.push(query, category, limit);
        } else {
          sql = `SELECT m.id, m.content, m.category, m.tags, m.source, m.created_at
                 FROM memories_fts fts
                 JOIN memories m ON fts.rowid = m.id
                 WHERE fts.content MATCH ?
                 ORDER BY rank
                 LIMIT ?`;
          params.push(query, limit);
        }

        const results = await db
          .prepare(sql)
          .bind(...params)
          .all();

        if (!results.results || results.results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No memories found matching your query.",
              },
            ],
          };
        }

        // 0.2 — bump access_count + last_accessed_at for tier promotion
        const hitIds = results.results
          .map((r: Record<string, unknown>) => r.id as number)
          .filter((id) => typeof id === "number");
        await this.bumpAccess(hitIds);

        const formatted = results.results
          .map(
            (r: Record<string, unknown>) =>
              `[${r.id}] (${r.category}/${r.source}) ${r.content}\n    Tags: ${r.tags || "none"} | Created: ${r.created_at}`,
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Found ${results.results.length} memories:\n\n${formatted}` +
                formatSuggestions(await this.buildSuggestions()),
            },
          ],
        };
      },
    );

    this.server.tool(
      "list_recent_memories",
      `List recent memories from the hub.

WHEN TO USE: At session start for context, or when user asks to see their memories.

SMART BEHAVIOR FOR LIMITS:
- User says "show recent" or "catch me up" → limit: 15
- User says "show all" or "list everything" or "what's in my hub" → limit: 500 (returns ALL)
- User asks about a specific source ("what did I save from ChatGPT / Perplexity / Cursor / my terminal / my phone") → pass that client's source slug as the filter (e.g. "chatgpt", "perplexity", "cursor", "claude-code", "claude-app")
- User asks "what was imported" → set source to "import"
- Default to 100 if user intent is unclear
- NEVER cap at 20 when user says "all" — use 500`,
      {
        limit: z
          .number()
          .default(100)
          .describe(
            "How many memories to return. Use 500 when user says 'all' or 'everything'. Use 15-20 for 'recent'. Default 100 for general requests.",
          ),
        source: z
          .string()
          .optional()
          .describe(
            "Filter by source slug (any MCP client name — e.g. claude-code, claude-ai, chatgpt, perplexity, cursor, or any custom agent system's own name). Also accepts 'manual' or 'import' for seeded data.",
          ),
      },
      async ({ limit, source }) => {
        const db = this.env.DB;
        let sql: string;
        const params: (string | number)[] = [];

        if (source) {
          sql = `SELECT id, content, category, tags, source, created_at
                 FROM memories WHERE source = ? ORDER BY created_at DESC LIMIT ?`;
          params.push(source, limit);
        } else {
          sql = `SELECT id, content, category, tags, source, created_at
                 FROM memories ORDER BY created_at DESC LIMIT ?`;
          params.push(limit);
        }

        const results = await db
          .prepare(sql)
          .bind(...params)
          .all();
        const formatted = (results.results || [])
          .map(
            (r: Record<string, unknown>) =>
              `[${r.id}] (${r.category}/${r.source}) ${r.content}\n    Tags: ${r.tags || "none"} | ${r.created_at}`,
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text: results.results?.length
                ? `Recent memories:\n\n${formatted}`
                : "No memories saved yet.",
            },
          ],
        };
      },
    );

    this.server.tool(
      "delete_memory",
      "Delete a memory by ID.",
      {
        id: z.number().describe("Memory ID to delete"),
      },
      async ({ id }) => {
        const db = this.env.DB;
        await db.prepare("DELETE FROM memories WHERE id = ?").bind(id).run();
        return {
          content: [{ type: "text" as const, text: `Memory ${id} deleted.` }],
        };
      },
    );

    // ── PROJECTS ──────────────────────────────────────────────

    this.server.tool(
      "save_project",
      `Create or update a project. Projects organize context by workspace — like Claude.ai's Projects feature but shared across all interfaces.

WHEN TO USE: When the user starts talking about a specific project, app, or initiative. Auto-creates on first mention.
SMART BEHAVIOR: Use the project name as a short, recognizable identifier (e.g. "context-hub", "portfolio", "auth-service"). Upserts — safe to call repeatedly with updated info.`,
      {
        name: z.string().describe("Project name (unique identifier)"),
        description: z
          .string()
          .default("")
          .describe("What this project is about"),
        instructions: z
          .string()
          .default("")
          .describe(
            "Custom instructions for Claude when working on this project",
          ),
      },
      async ({ name, description, instructions }) => {
        const db = this.env.DB;
        await db
          .prepare(
            `INSERT INTO projects (name, description, instructions)
             VALUES (?, ?, ?)
             ON CONFLICT(name) DO UPDATE SET
               description = excluded.description,
               instructions = excluded.instructions,
               updated_at = datetime('now')`,
          )
          .bind(name, description, instructions)
          .run();

        return {
          content: [
            { type: "text" as const, text: `Project "${name}" saved.` },
          ],
        };
      },
    );

    this.server.tool(
      "get_project",
      "Get a project's full details including description and custom instructions. Use when the user is about to work on a specific project — load its instructions first so you can follow them.",
      {
        name: z.string().describe("Project name"),
      },
      async ({ name }) => {
        const db = this.env.DB;
        const project = await db
          .prepare("SELECT * FROM projects WHERE name = ?")
          .bind(name)
          .first();

        if (!project) {
          return {
            content: [
              { type: "text" as const, text: `Project "${name}" not found.` },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Project: ${project.name}\nStatus: ${project.status}\nDescription: ${project.description}\n\nInstructions:\n${project.instructions || "(none)"}`,
            },
          ],
        };
      },
    );

    this.server.tool(
      "list_projects",
      "List all projects in the hub. Use when the user asks 'what am I working on?' or 'show my projects'. Default shows active projects only — use status 'all' if user wants everything including archived.",
      {
        status: z
          .enum(["active", "archived", "all"])
          .default("active")
          .describe("Filter by project status"),
      },
      async ({ status }) => {
        const db = this.env.DB;
        const sql =
          status === "all"
            ? "SELECT name, description, status, updated_at FROM projects ORDER BY updated_at DESC"
            : "SELECT name, description, status, updated_at FROM projects WHERE status = ? ORDER BY updated_at DESC";

        const results =
          status === "all"
            ? await db.prepare(sql).all()
            : await db.prepare(sql).bind(status).all();

        const formatted = (results.results || [])
          .map(
            (p: Record<string, unknown>) =>
              `- ${p.name} (${p.status}): ${p.description || "(no description)"}`,
          )
          .join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: results.results?.length
                ? `Projects:\n${formatted}`
                : "No projects found.",
            },
          ],
        };
      },
    );

    // ── INSTRUCTIONS ──────────────────────────────────────────

    this.server.tool(
      "save_instruction",
      `Save a global custom instruction. Auto-deduplicates — if the same instruction exists, it refreshes instead of duplicating.

WHEN TO USE: When the user says "always do X", "never do Y", "I prefer Z format", or gives you a behavior rule. These persist across ALL sessions and interfaces.

SMART CATEGORIZATION:
- "always/never" rules about behavior → type: "behavior"
- Tone/format/length preferences → type: "style"
- Technical constraints ("use TypeScript", "no ORMs") → type: "constraint"
- System-level directives → type: "system"`,
      {
        type: z
          .enum(["system", "style", "behavior", "constraint"])
          .describe("Type of instruction"),
        content: z.string().describe("The instruction content"),
        priority: z
          .number()
          .default(0)
          .describe("Priority (higher = more important)"),
      },
      async ({ type, content, priority }) => {
        const db = this.env.DB;

        // Dedup: check for exact or near-exact instruction match
        const existing = await db
          .prepare(
            "SELECT id, content FROM instructions WHERE content = ? AND type = ? LIMIT 1",
          )
          .bind(content, type)
          .first();

        if (existing) {
          // Update priority if different, otherwise just refresh
          await db
            .prepare(
              "UPDATE instructions SET priority = ?, updated_at = datetime('now') WHERE id = ?",
            )
            .bind(priority, existing.id)
            .run();
          return {
            content: [
              {
                type: "text" as const,
                text: `Instruction already exists (id: ${existing.id}), refreshed. No duplicate created.`,
              },
            ],
          };
        }

        const result = await db
          .prepare(
            "INSERT INTO instructions (type, content, priority) VALUES (?, ?, ?)",
          )
          .bind(type, content, priority)
          .run();

        return {
          content: [
            {
              type: "text" as const,
              text: `Instruction saved (id: ${result.meta.last_row_id}). Type: ${type}`,
            },
          ],
        };
      },
    );

    this.server.tool(
      "get_instructions",
      "Get all active custom instructions. Call this at session start alongside get_identity to know how the user wants you to behave — tone, format, constraints, and behavior rules. These are the user's explicit preferences, always follow them.",
      {},
      async () => {
        const db = this.env.DB;
        const results = await db
          .prepare(
            "SELECT id, type, content, priority FROM instructions WHERE active = 1 ORDER BY priority DESC",
          )
          .all();

        const formatted = (results.results || [])
          .map(
            (i: Record<string, unknown>) =>
              `[${i.id}] (${i.type}, priority: ${i.priority}) ${i.content}`,
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text: results.results?.length
                ? `Active instructions:\n\n${formatted}`
                : "No custom instructions set.",
            },
          ],
        };
      },
    );

    // ── IDENTITY ──────────────────────────────────────────────

    this.server.tool(
      "set_identity",
      `Set or update an identity field. Upserts — safe to call repeatedly, always updates existing key.

WHEN TO USE: When the user shares personal/professional details: name, role, company, expertise, location, tools, education, etc. Be proactive — if they mention "I'm a backend engineer" in passing, save it.

SMART KEY NAMING: Use consistent lowercase keys like: name, role, company, expertise, location, tools, education, email, languages, interests. Keep values concise but complete.`,
      {
        key: z
          .string()
          .describe(
            "Identity field (e.g. 'name', 'role', 'expertise', 'location')",
          ),
        value: z.string().describe("Value for this field"),
      },
      async ({ key, value }) => {
        const db = this.env.DB;
        await db
          .prepare(
            `INSERT INTO identity (key, value)
             VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
          )
          .bind(key, value)
          .run();

        return {
          content: [
            { type: "text" as const, text: `Identity: ${key} = "${value}"` },
          ],
        };
      },
    );

    this.server.tool(
      "get_identity",
      "Get the user's full identity profile. ALWAYS call this at the start of every new session — it tells you who the user is, their role, expertise, and how to tailor your responses. Combine with get_instructions for the full picture.",
      {},
      async () => {
        const db = this.env.DB;
        const results = await db
          .prepare("SELECT key, value, updated_at FROM identity ORDER BY key")
          .all();

        if (!results.results || results.results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No identity information set yet.",
              },
            ],
          };
        }

        const formatted = (results.results || [])
          .map((i: Record<string, unknown>) => `${i.key}: ${i.value}`)
          .join("\n");

        return {
          content: [
            { type: "text" as const, text: `User Identity:\n${formatted}` },
          ],
        };
      },
    );

    // ── CONTEXT LOG ───────────────────────────────────────────

    this.server.tool(
      "log_context",
      `Log what was discussed — creates a breadcrumb trail across interfaces so the user's other sessions (any MCP client) know what happened here.

WHEN TO USE: At natural breakpoints — when a topic concludes, a decision is made, or a significant piece of work is done. Also call this when a session is ending.
SMART BEHAVIOR: Source is auto-detected from the MCP client name — do NOT pass source unless the user explicitly asks to override it. Keep summaries concise (1-2 sentences) but capture the key decision or topic.`,
      {
        summary: z
          .string()
          .describe("Brief summary of what was discussed or decided"),
        source: z
          .string()
          .optional()
          .describe(
            "Which interface this is from. Auto-detected from the MCP client name if omitted (e.g. claude-code, chatgpt, perplexity, cursor, or any agent system's own name).",
          ),
        project_name: z
          .string()
          .optional()
          .describe("Associate with a project (optional)"),
      },
      async ({ summary, source, project_name }) => {
        const db = this.env.DB;
        const resolvedSource = source ?? this.detectSource();

        // Dedup: skip if same summary logged from same source in last 5 minutes
        const recent = await db
          .prepare(
            `SELECT id FROM context_log
             WHERE summary = ? AND source = ?
             AND created_at > datetime('now', '-5 minutes')
             LIMIT 1`,
          )
          .bind(summary, resolvedSource)
          .first();

        if (recent) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Context already logged recently. Skipped duplicate.`,
              },
            ],
          };
        }

        await db
          .prepare(
            "INSERT INTO context_log (summary, source, project_name) VALUES (?, ?, ?)",
          )
          .bind(summary, resolvedSource, project_name || null)
          .run();

        return {
          content: [
            {
              type: "text" as const,
              text: `Context logged from ${resolvedSource}.`,
            },
          ],
        };
      },
    );

    this.server.tool(
      "get_recent_context",
      `Get recent context breadcrumbs from all interfaces. Shows what the user discussed in OTHER sessions across any MCP client (phone, browser, terminal, ChatGPT, Perplexity, Cursor, custom agents, etc.).

WHEN TO USE: When the user says things like "what was I working on?", "continue where I left off", "what did I discuss on my phone?", "what did I do in ChatGPT yesterday?". Also useful at session start to catch up.
SMART FILTERING: If the user mentions a specific interface, pass that client's source slug — e.g. "on my phone" → "claude-app", "in the browser" → "claude-ai", "in the terminal" → "claude-code", "in ChatGPT" → "chatgpt", "in Perplexity" → "perplexity", "in Cursor" → "cursor". Slugs are whatever name the MCP client self-reported, lowercased with non-alphanumerics replaced by dashes.`,
      {
        limit: z.number().default(10).describe("Number of recent entries"),
        source: z
          .string()
          .optional()
          .describe(
            "Filter by source slug (any MCP client's self-reported name — e.g. claude-code, claude-ai, chatgpt, perplexity, cursor, or a custom agent system's own name).",
          ),
      },
      async ({ limit, source }) => {
        const db = this.env.DB;
        let sql: string;
        const params: (string | number)[] = [];

        if (source) {
          sql = `SELECT id, summary, source, project_name, created_at
                 FROM context_log WHERE source = ? ORDER BY created_at DESC LIMIT ?`;
          params.push(source, limit);
        } else {
          sql = `SELECT id, summary, source, project_name, created_at
                 FROM context_log ORDER BY created_at DESC LIMIT ?`;
          params.push(limit);
        }

        const results = await db
          .prepare(sql)
          .bind(...params)
          .all();
        const formatted = (results.results || [])
          .map(
            (c: Record<string, unknown>) =>
              `[${c.created_at}] (${c.source}${c.project_name ? ` / ${c.project_name}` : ""}) ${c.summary}`,
          )
          .join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: results.results?.length
                ? `Recent context:\n${formatted}`
                : "No context logged yet.",
            },
          ],
        };
      },
    );

    // ── UPDATE MEMORY ──────────────────────────────────────────

    this.server.tool(
      "update_memory",
      `Update an existing memory. Only modifies the fields you provide — everything else stays the same.

WHEN TO USE: When the user says "actually, update that memory", "change memory #X to say Y", "fix that memory", or wants to correct/refine a previously saved memory.

SMART BEHAVIOR:
- Only pass the fields that need changing — omitted fields are preserved
- Automatically sets updated_at to now
- Returns the updated memory so the user can confirm the change`,
      {
        id: z.number().describe("Memory ID to update"),
        content: z
          .string()
          .optional()
          .describe("New content (leave empty to keep existing)"),
        category: z
          .enum(["general", "preference", "decision", "learning", "project"])
          .optional()
          .describe("New category (leave empty to keep existing)"),
        tags: z
          .string()
          .optional()
          .describe("New tags (leave empty to keep existing)"),
      },
      async ({ id, content, category, tags }) => {
        const db = this.env.DB;

        // Check if memory exists
        const existing = await db
          .prepare(
            "SELECT id, content, category, tags FROM memories WHERE id = ?",
          )
          .bind(id)
          .first();

        if (!existing) {
          return {
            content: [
              { type: "text" as const, text: `Memory ${id} not found.` },
            ],
          };
        }

        const ex = existing as Record<string, unknown>;
        const newContent = content ?? ex.content;
        const newCategory = category ?? ex.category;
        const newTags = tags ?? ex.tags;

        await db
          .prepare(
            "UPDATE memories SET content = ?, category = ?, tags = ?, updated_at = datetime('now') WHERE id = ?",
          )
          .bind(newContent, newCategory, newTags, id)
          .run();

        return {
          content: [
            {
              type: "text" as const,
              text: `Memory ${id} updated. Content: ${newContent} | Category: ${newCategory} | Tags: ${newTags || "none"}`,
            },
          ],
        };
      },
    );

    // ── DECISIONS ──────────────────────────────────────────────

    this.server.tool(
      "save_decision",
      `Save a decision with its reasoning. Decisions are different from memories — they capture the WHY behind choices, including alternatives that were considered and rejected.

WHEN TO USE: When the user says "let's go with X", "I've decided to use Y", "we chose Z because...", or makes any significant technical, design, or business decision.

SMART BEHAVIOR:
- Extract the decision, reasoning, and rejected alternatives from the user's message
- Always include reasoning — if not stated, ask "what's the reasoning?"
- Link to a project if the decision is project-specific
- Add relevant tags for searchability`,
      {
        decision: z.string().describe("The decision that was made"),
        reasoning: z.string().describe("Why this decision was made"),
        alternatives_rejected: z
          .string()
          .optional()
          .describe("Alternatives that were considered but rejected"),
        project_name: z
          .string()
          .optional()
          .describe("Associate with a project (optional)"),
        tags: z
          .string()
          .default("")
          .describe("Comma-separated tags for filtering"),
      },
      async ({
        decision,
        reasoning,
        alternatives_rejected,
        project_name,
        tags,
      }) => {
        const db = this.env.DB;

        // Format structured content
        let structuredContent = `DECISION: ${decision}\nREASONING: ${reasoning}`;
        if (alternatives_rejected) {
          structuredContent += `\nALTERNATIVES REJECTED: ${alternatives_rejected}`;
        }
        if (project_name) {
          structuredContent += `\nPROJECT: ${project_name}`;
        }

        // Dedup: check for exact decision match
        const exact = await db
          .prepare(
            "SELECT id FROM memories WHERE content = ? AND category = 'decision' LIMIT 1",
          )
          .bind(structuredContent)
          .first();

        if (exact) {
          await db
            .prepare(
              "UPDATE memories SET tags = ?, updated_at = datetime('now') WHERE id = ?",
            )
            .bind(tags || (exact as Record<string, unknown>).tags, exact.id)
            .run();
          return {
            content: [
              {
                type: "text" as const,
                text: `Decision already exists (id: ${exact.id}), refreshed timestamp. No duplicate created.`,
              },
            ],
          };
        }

        // Auto-detect source from the MCP client's clientInfo.name
        const source = this.detectSource();

        const result = await db
          .prepare(
            "INSERT INTO memories (content, category, tags, source) VALUES (?, 'decision', ?, ?)",
          )
          .bind(structuredContent, tags, source)
          .run();

        return {
          content: [
            {
              type: "text" as const,
              text: `Decision saved (id: ${result.meta.last_row_id}).${project_name ? ` Project: ${project_name}.` : ""} Tags: ${tags || "none"}`,
            },
          ],
        };
      },
    );

    this.server.tool(
      "search_decisions",
      `Search through saved decisions (memories with category='decision'). Returns structured decisions with their reasoning and rejected alternatives.

WHEN TO USE: When the user asks "why did we decide X?", "what decisions have we made about Y?", "show me project Z decisions", or needs to recall past reasoning.

SMART BEHAVIOR:
- Uses full-text search filtered to decisions only
- If project_name is provided, also filters by that project
- Returns the full decision structure including reasoning and alternatives`,
      {
        query: z.string().describe("Search query — natural language works"),
        project_name: z.string().optional().describe("Filter by project name"),
        limit: z.number().default(10).describe("Max results to return"),
      },
      async ({ query, project_name, limit }) => {
        const db = this.env.DB;

        const ftsResults = await db
          .prepare(
            `SELECT m.id, m.content, m.tags, m.source, m.created_at
             FROM memories_fts fts
             JOIN memories m ON fts.rowid = m.id
             WHERE fts.content MATCH ? AND m.category = 'decision'
             ORDER BY rank
             LIMIT ?`,
          )
          .bind(query, limit)
          .all();

        let decisions = ftsResults.results || [];

        // If project_name provided, filter further
        if (project_name && decisions.length) {
          decisions = decisions.filter((d: Record<string, unknown>) =>
            (d.content as string).includes(`PROJECT: ${project_name}`),
          );
        }

        if (!decisions.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No decisions found matching your query.",
              },
            ],
          };
        }

        const formatted = decisions
          .map(
            (r: Record<string, unknown>) =>
              `[${r.id}] ${r.content}\n    Tags: ${r.tags || "none"} | Source: ${r.source} | ${r.created_at}`,
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${decisions.length} decisions:\n\n${formatted}`,
            },
          ],
        };
      },
    );

    // ── DELETE INSTRUCTION ─────────────────────────────────────

    this.server.tool(
      "delete_instruction",
      `Delete an instruction by ID. Permanently removes the instruction from the hub.

WHEN TO USE: When the user says "remove that instruction", "delete instruction #X", "I no longer want that rule", or wants to clean up outdated behavior rules.

SMART BEHAVIOR:
- Use get_instructions first to see the list and find the ID
- Confirm with the user before deleting if the instruction content isn't specified`,
      {
        id: z.number().describe("Instruction ID to delete"),
      },
      async ({ id }) => {
        const db = this.env.DB;

        const existing = await db
          .prepare("SELECT id, content FROM instructions WHERE id = ?")
          .bind(id)
          .first();

        if (!existing) {
          return {
            content: [
              { type: "text" as const, text: `Instruction ${id} not found.` },
            ],
          };
        }

        await db
          .prepare("DELETE FROM instructions WHERE id = ?")
          .bind(id)
          .run();
        return {
          content: [
            {
              type: "text" as const,
              text: `Instruction ${id} deleted: "${(existing as Record<string, unknown>).content}"`,
            },
          ],
        };
      },
    );

    // ── ARCHIVE PROJECT ────────────────────────────────────────

    this.server.tool(
      "archive_project",
      `Soft-delete a project by setting its status to 'archived'. The project data is preserved but hidden from active project lists.

WHEN TO USE: When the user says "archive project X", "I'm done with project X", "shelve that project", or wants to remove a project from their active list without losing the data.

SMART BEHAVIOR:
- This is a soft-delete — data is kept, just hidden from default views
- Use list_projects with status 'all' to see archived projects
- The project can be reactivated by calling save_project with the same name`,
      {
        name: z.string().describe("Project name to archive"),
      },
      async ({ name }) => {
        const db = this.env.DB;

        const existing = await db
          .prepare("SELECT id, status FROM projects WHERE name = ?")
          .bind(name)
          .first();

        if (!existing) {
          return {
            content: [
              { type: "text" as const, text: `Project "${name}" not found.` },
            ],
          };
        }

        if ((existing as Record<string, unknown>).status === "archived") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Project "${name}" is already archived.`,
              },
            ],
          };
        }

        await db
          .prepare(
            "UPDATE projects SET status = 'archived', updated_at = datetime('now') WHERE name = ?",
          )
          .bind(name)
          .run();

        return {
          content: [
            {
              type: "text" as const,
              text: `Project "${name}" archived. Use list_projects with status 'all' to see it, or save_project to reactivate.`,
            },
          ],
        };
      },
    );

    // ── EXPORT HUB ─────────────────────────────────────────────

    this.server.tool(
      "export_hub",
      `Export ALL data from the Context Hub as structured JSON for backup or portability.

WHEN TO USE: When the user says "export my data", "backup my hub", "download everything", or wants to migrate their data to another instance.

SMART BEHAVIOR:
- Returns a complete JSON snapshot of all tables: identity, instructions, memories, projects, and context_log
- Includes an exported_at timestamp for versioning
- The output can be imported back using import_hub`,
      {},
      async () => {
        const db = this.env.DB;

        const [identity, instructions, memories, projects, contextLog] =
          await Promise.all([
            db
              .prepare(
                "SELECT key, value, created_at, updated_at FROM identity ORDER BY key",
              )
              .all(),
            db
              .prepare(
                "SELECT id, type, content, priority, active, created_at, updated_at FROM instructions ORDER BY priority DESC",
              )
              .all(),
            db
              .prepare(
                "SELECT id, content, category, tags, source, created_at, updated_at FROM memories ORDER BY created_at DESC",
              )
              .all(),
            db
              .prepare(
                "SELECT id, name, description, instructions, status, created_at, updated_at FROM projects ORDER BY updated_at DESC",
              )
              .all(),
            db
              .prepare(
                "SELECT id, source, summary, project_name, created_at FROM context_log ORDER BY created_at DESC",
              )
              .all(),
          ]);

        const exportData = {
          identity: identity.results || [],
          instructions: instructions.results || [],
          memories: memories.results || [],
          projects: projects.results || [],
          context_log: contextLog.results || [],
          exported_at: new Date().toISOString(),
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(exportData, null, 2),
            },
          ],
        };
      },
    );

    // ── IMPORT HUB ─────────────────────────────────────────────

    this.server.tool(
      "import_hub",
      `Import data from a JSON export into the Context Hub, with deduplication protection. Safely merges data without creating duplicates.

WHEN TO USE: When the user says "import this data", "restore from backup", "load this export", or wants to merge data from another Context Hub instance.

SMART BEHAVIOR:
- Parses the JSON input and imports each table with appropriate dedup logic
- Identity: upserts each key (existing values are updated)
- Memories: skips exact content duplicates
- Instructions: skips exact content+type duplicates
- Projects: upserts by name (existing projects are updated)
- Context log: inserts all entries (logs are append-only)
- Returns a summary of imported vs skipped items per table`,
      {
        data: z
          .string()
          .describe("JSON string of the export data (from export_hub output)"),
      },
      async ({ data }) => {
        const db = this.env.DB;

        let parsed: Record<string, unknown[]>;
        try {
          parsed = JSON.parse(data) as Record<string, unknown[]>;
        } catch {
          return {
            content: [
              {
                type: "text" as const,
                text: "Invalid JSON. Please provide a valid export JSON string.",
              },
            ],
          };
        }

        const counts = {
          identity: { imported: 0, skipped: 0 },
          memories: { imported: 0, skipped: 0 },
          instructions: { imported: 0, skipped: 0 },
          projects: { imported: 0, skipped: 0 },
          context_log: { imported: 0, skipped: 0 },
        };

        // Import identity (upsert by key)
        if (Array.isArray(parsed.identity)) {
          for (const item of parsed.identity) {
            const row = item as Record<string, unknown>;
            if (row.key && row.value) {
              await db
                .prepare(
                  `INSERT INTO identity (key, value)
                   VALUES (?, ?)
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
                )
                .bind(row.key, row.value)
                .run();
              counts.identity.imported++;
            }
          }
        }

        // Import memories (skip exact content duplicates)
        if (Array.isArray(parsed.memories)) {
          for (const item of parsed.memories) {
            const row = item as Record<string, unknown>;
            if (row.content) {
              const existing = await db
                .prepare("SELECT id FROM memories WHERE content = ? LIMIT 1")
                .bind(row.content)
                .first();

              if (existing) {
                counts.memories.skipped++;
              } else {
                await db
                  .prepare(
                    "INSERT INTO memories (content, category, tags, source) VALUES (?, ?, ?, ?)",
                  )
                  .bind(
                    row.content,
                    row.category || "general",
                    row.tags || "",
                    row.source || "import",
                  )
                  .run();
                counts.memories.imported++;
              }
            }
          }
        }

        // Import instructions (skip exact content+type duplicates)
        if (Array.isArray(parsed.instructions)) {
          for (const item of parsed.instructions) {
            const row = item as Record<string, unknown>;
            if (row.content && row.type) {
              const existing = await db
                .prepare(
                  "SELECT id FROM instructions WHERE content = ? AND type = ? LIMIT 1",
                )
                .bind(row.content, row.type)
                .first();

              if (existing) {
                counts.instructions.skipped++;
              } else {
                await db
                  .prepare(
                    "INSERT INTO instructions (type, content, priority) VALUES (?, ?, ?)",
                  )
                  .bind(row.type, row.content, row.priority || 0)
                  .run();
                counts.instructions.imported++;
              }
            }
          }
        }

        // Import projects (upsert by name)
        if (Array.isArray(parsed.projects)) {
          for (const item of parsed.projects) {
            const row = item as Record<string, unknown>;
            if (row.name) {
              await db
                .prepare(
                  `INSERT INTO projects (name, description, instructions, status)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(name) DO UPDATE SET
                     description = excluded.description,
                     instructions = excluded.instructions,
                     status = excluded.status,
                     updated_at = datetime('now')`,
                )
                .bind(
                  row.name,
                  row.description || "",
                  row.instructions || "",
                  row.status || "active",
                )
                .run();
              counts.projects.imported++;
            }
          }
        }

        // Import context log (insert all, no dedup for logs)
        if (Array.isArray(parsed.context_log)) {
          for (const item of parsed.context_log) {
            const row = item as Record<string, unknown>;
            if (row.summary) {
              await db
                .prepare(
                  "INSERT INTO context_log (summary, source, project_name) VALUES (?, ?, ?)",
                )
                .bind(
                  row.summary,
                  row.source || "import",
                  row.project_name || null,
                )
                .run();
              counts.context_log.imported++;
            }
          }
        }

        const summary = Object.entries(counts)
          .map(
            ([table, c]) =>
              `- ${table}: ${c.imported} imported, ${c.skipped} skipped (duplicates)`,
          )
          .join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Import complete:\n${summary}`,
            },
          ],
        };
      },
    );

    // ── GET PROJECT CONTEXT ────────────────────────────────────

    this.server.tool(
      "get_project_context",
      `Load everything relevant to ONE specific project in a single call — project details, instructions, related memories, decisions, and recent context logs.

WHEN TO USE: When the user says "load project X", "what do we know about project Y?", "catch me up on project Z", or is about to start working on a specific project. This is the project-focused version of get_full_context.

SMART BEHAVIOR:
- Returns project details + custom instructions + all memories tagged/categorized for that project + decisions related to that project + recent context logs mentioning that project
- Call this BEFORE starting work on any specific project`,
      {
        project_name: z
          .string()
          .describe("The project name to load context for"),
      },
      async ({ project_name }) => {
        const db = this.env.DB;

        // Get project details
        const project = await db
          .prepare("SELECT * FROM projects WHERE name = ?")
          .bind(project_name)
          .first();

        // Get memories related to this project (by tags, category, or content mention)
        const memories = await db
          .prepare(
            `SELECT id, content, category, tags, source, created_at FROM memories
             WHERE tags LIKE ? OR category = 'project' AND content LIKE ? OR content LIKE ?
             ORDER BY created_at DESC LIMIT 50`,
          )
          .bind(
            `%${project_name}%`,
            `%${project_name}%`,
            `%PROJECT: ${project_name}%`,
          )
          .all();

        // Get decisions for this project
        const decisions = await db
          .prepare(
            `SELECT id, content, tags, source, created_at FROM memories
             WHERE category = 'decision' AND content LIKE ?
             ORDER BY created_at DESC LIMIT 20`,
          )
          .bind(`%PROJECT: ${project_name}%`)
          .all();

        // Get context logs for this project
        const contextLogs = await db
          .prepare(
            `SELECT summary, source, created_at FROM context_log
             WHERE project_name = ?
             ORDER BY created_at DESC LIMIT 20`,
          )
          .bind(project_name)
          .all();

        // Get instructions (global — always relevant)
        const instructions = await db
          .prepare(
            "SELECT type, content FROM instructions WHERE active = 1 ORDER BY priority DESC",
          )
          .all();

        const sections: string[] = [];

        // Project details
        if (project) {
          const p = project as Record<string, unknown>;
          sections.push(
            `## Project: ${p.name}\nStatus: ${p.status}\nDescription: ${p.description || "(none)"}\n\nProject Instructions:\n${p.instructions || "(none)"}`,
          );
        } else {
          sections.push(
            `## Project: ${project_name}\n(Project not found in hub — showing related data only)`,
          );
        }

        // Global instructions
        if (instructions.results?.length) {
          sections.push(
            "## Global Instructions\n" +
              instructions.results
                .map(
                  (i: Record<string, unknown>) => `- [${i.type}] ${i.content}`,
                )
                .join("\n"),
          );
        }

        // Related memories
        if (memories.results?.length) {
          sections.push(
            `## Related Memories (${memories.results.length})\n` +
              memories.results
                .map(
                  (m: Record<string, unknown>) =>
                    `- [${m.id}] (${m.category}/${m.source}) ${m.content}${m.tags ? ` [tags: ${m.tags}]` : ""}`,
                )
                .join("\n"),
          );
        }

        // Decisions
        if (decisions.results?.length) {
          sections.push(
            `## Decisions (${decisions.results.length})\n` +
              decisions.results
                .map(
                  (d: Record<string, unknown>) =>
                    `- [${d.id}] ${d.content}\n    Tags: ${d.tags || "none"} | ${d.created_at}`,
                )
                .join("\n"),
          );
        }

        // Context logs
        if (contextLogs.results?.length) {
          sections.push(
            `## Recent Context (${contextLogs.results.length})\n` +
              contextLogs.results
                .map(
                  (c: Record<string, unknown>) =>
                    `- [${c.source}] ${c.summary} (${c.created_at})`,
                )
                .join("\n"),
          );
        }

        const output = sections.length
          ? sections.join("\n\n")
          : `No data found for project "${project_name}".`;

        return {
          content: [{ type: "text" as const, text: output }],
        };
      },
    );

    // ── FULL CONTEXT DUMP ─────────────────────────────────────

    this.server.tool(
      "get_full_context",
      `The session-start powerhouse. Returns EVERYTHING in one call: identity profile, custom instructions, active projects, recent memories, and cross-interface context breadcrumbs.

WHEN TO USE: At the very start of every new session. This is the single most important tool — it gives you the full picture of who the user is, how they want you to behave, what they've been working on, and what happened in their other sessions. Call this FIRST before doing anything else.`,
      {
        memory_limit: z
          .number()
          .default(15)
          .describe("Number of recent memories to include"),
        context_limit: z
          .number()
          .default(10)
          .describe("Number of recent context entries"),
      },
      async ({ memory_limit, context_limit }) => {
        const db = this.env.DB;

        const [identity, instructions, memories, context, projects] =
          await Promise.all([
            db.prepare("SELECT key, value FROM identity ORDER BY key").all(),
            db
              .prepare(
                "SELECT type, content FROM instructions WHERE active = 1 ORDER BY priority DESC",
              )
              .all(),
            db
              .prepare(
                "SELECT content, category, source, created_at FROM memories ORDER BY created_at DESC LIMIT ?",
              )
              .bind(memory_limit)
              .all(),
            db
              .prepare(
                "SELECT summary, source, project_name, created_at FROM context_log ORDER BY created_at DESC LIMIT ?",
              )
              .bind(context_limit)
              .all(),
            db
              .prepare(
                "SELECT name, description FROM projects WHERE status = 'active' ORDER BY updated_at DESC",
              )
              .all(),
          ]);

        const sections: string[] = [];

        // Identity
        if (identity.results?.length) {
          sections.push(
            "## Identity\n" +
              identity.results
                .map((i: Record<string, unknown>) => `- ${i.key}: ${i.value}`)
                .join("\n"),
          );
        }

        // Instructions
        if (instructions.results?.length) {
          sections.push(
            "## Custom Instructions\n" +
              instructions.results
                .map(
                  (i: Record<string, unknown>) => `- [${i.type}] ${i.content}`,
                )
                .join("\n"),
          );
        }

        // Active projects
        if (projects.results?.length) {
          sections.push(
            "## Active Projects\n" +
              projects.results
                .map(
                  (p: Record<string, unknown>) =>
                    `- **${p.name}**: ${p.description || "(no description)"}`,
                )
                .join("\n"),
          );
        }

        // Recent memories
        if (memories.results?.length) {
          sections.push(
            "## Recent Memories\n" +
              memories.results
                .map(
                  (m: Record<string, unknown>) =>
                    `- (${m.category}/${m.source}) ${m.content}`,
                )
                .join("\n"),
          );
        }

        // Recent context
        if (context.results?.length) {
          sections.push(
            "## Recent Context (Cross-Interface)\n" +
              context.results
                .map(
                  (c: Record<string, unknown>) =>
                    `- [${c.source}] ${c.summary} (${c.created_at})`,
                )
                .join("\n"),
          );
        }

        const output = sections.length
          ? sections.join("\n\n")
          : "No context saved yet. Start by setting your identity with set_identity.";

        return {
          content: [{ type: "text" as const, text: output }],
        };
      },
    );

    // ── LIST ALL DATA ───────────────────────────────────────────

    this.server.tool(
      "list_all_data",
      `Complete inventory of everything stored in the Context Hub — ALL memories, ALL identity fields, ALL instructions, ALL projects, ALL context logs. No limits, no truncation.

WHEN TO USE: When user says "show me everything", "what's in my hub?", "list all data", "inventory", or wants to audit their stored context. This returns the FULL database contents across all tables.
NOTE: For large hubs this may return a lot of data. If user only wants one category, use the boolean flags to include/exclude tables.`,
      {
        include_memories: z
          .boolean()
          .default(true)
          .describe("Include all memories"),
        include_identity: z
          .boolean()
          .default(true)
          .describe("Include identity fields"),
        include_instructions: z
          .boolean()
          .default(true)
          .describe("Include instructions"),
        include_projects: z
          .boolean()
          .default(true)
          .describe("Include projects"),
        include_context_log: z
          .boolean()
          .default(true)
          .describe("Include context log"),
      },
      async ({
        include_memories,
        include_identity,
        include_instructions,
        include_projects,
        include_context_log,
      }) => {
        const db = this.env.DB;
        const sections: string[] = [];

        if (include_identity) {
          const results = await db
            .prepare("SELECT key, value FROM identity ORDER BY key")
            .all();
          if (results.results?.length) {
            sections.push(
              `## Identity (${results.results.length} fields)\n` +
                results.results
                  .map(
                    (r: Record<string, unknown>) =>
                      `- **${r.key}**: ${r.value}`,
                  )
                  .join("\n"),
            );
          }
        }

        if (include_instructions) {
          const results = await db
            .prepare(
              "SELECT id, type, content, priority, active FROM instructions ORDER BY priority DESC",
            )
            .all();
          if (results.results?.length) {
            sections.push(
              `## Instructions (${results.results.length} total)\n` +
                results.results
                  .map(
                    (r: Record<string, unknown>) =>
                      `- [${r.id}] (${r.type}, priority: ${r.priority}${r.active ? "" : ", INACTIVE"}) ${r.content}`,
                  )
                  .join("\n"),
            );
          }
        }

        if (include_projects) {
          const results = await db
            .prepare(
              "SELECT name, description, instructions, status FROM projects ORDER BY updated_at DESC",
            )
            .all();
          if (results.results?.length) {
            sections.push(
              `## Projects (${results.results.length} total)\n` +
                results.results
                  .map(
                    (r: Record<string, unknown>) =>
                      `### ${r.name} (${r.status})\n${r.description || "(no description)"}${r.instructions ? `\n**Instructions:** ${r.instructions}` : ""}`,
                  )
                  .join("\n\n"),
            );
          }
        }

        if (include_memories) {
          const results = await db
            .prepare(
              "SELECT id, content, category, tags, source, created_at FROM memories ORDER BY created_at DESC",
            )
            .all();
          if (results.results?.length) {
            sections.push(
              `## Memories (${results.results.length} total)\n` +
                results.results
                  .map(
                    (r: Record<string, unknown>) =>
                      `- [${r.id}] (${r.category}/${r.source}) ${r.content}${r.tags ? ` [tags: ${r.tags}]` : ""}`,
                  )
                  .join("\n"),
            );
          }
        }

        if (include_context_log) {
          const results = await db
            .prepare(
              "SELECT summary, source, project_name, created_at FROM context_log ORDER BY created_at DESC LIMIT 50",
            )
            .all();
          if (results.results?.length) {
            sections.push(
              `## Context Log (${results.results.length} entries)\n` +
                results.results
                  .map(
                    (r: Record<string, unknown>) =>
                      `- [${r.created_at}] (${r.source}${r.project_name ? ` / ${r.project_name}` : ""}) ${r.summary}`,
                  )
                  .join("\n"),
            );
          }
        }

        const output = sections.length
          ? sections.join("\n\n---\n\n")
          : "Context Hub is empty. Start by setting your identity with set_identity.";

        return {
          content: [{ type: "text" as const, text: output }],
        };
      },
    );

    // ── HUB STATS / DASHBOARD ─────────────────────────────────

    this.server.tool(
      "get_hub_stats",
      `Get comprehensive stats about the Context Hub — storage usage, memory counts, activity patterns, and database health.

IMPORTANT: When presenting these stats to the user, display them as a clean, visually rich inline dashboard directly in the conversation — NOT as a separate artifact or code block.
Use a light background with colorful accents. Design with:
- Summary stat cards at the top using emoji indicators and bold numbers (total memories, projects, instructions, identity fields)
- Colorful inline bar representations for memories by category and by source (use colored blocks like 🟦🟩🟨🟧🟥 or Unicode bar characters)
- Activity trend showing memories added over last 7 days with a simple inline chart
- Top tags as colorful inline pill/badge style text
- Storage usage as an inline progress indicator with percentage against the D1 free tier (5GB)
- Last activity timestamps per source interface in a clean table

Use plenty of color, whitespace, and visual hierarchy. Think of it as a clean, modern analytics dashboard rendered with rich text and Unicode visuals — no HTML, no JSX, no code artifacts. Just beautiful inline formatting.`,
      {},
      async () => {
        const db = this.env.DB;

        // Run all stat queries in parallel
        const [
          memoryCounts,
          memoryByCategory,
          memoryBySource,
          projectCounts,
          instructionCount,
          identityCount,
          contextLogCount,
          recentActivity24h,
          recentActivity7d,
          recentActivity30d,
          topTags,
          oldestMemory,
          newestMemory,
          lastActivityBySource,
          memoryTimeline,
        ] = await Promise.all([
          // Total memories
          db.prepare("SELECT COUNT(*) as count FROM memories").first(),
          // Memories by category
          db
            .prepare(
              "SELECT category, COUNT(*) as count FROM memories GROUP BY category ORDER BY count DESC",
            )
            .all(),
          // Memories by source
          db
            .prepare(
              "SELECT source, COUNT(*) as count FROM memories GROUP BY source ORDER BY count DESC",
            )
            .all(),
          // Projects (active vs archived)
          db
            .prepare(
              "SELECT status, COUNT(*) as count FROM projects GROUP BY status",
            )
            .all(),
          // Instructions
          db
            .prepare(
              "SELECT COUNT(*) as count FROM instructions WHERE active = 1",
            )
            .first(),
          // Identity fields
          db.prepare("SELECT COUNT(*) as count FROM identity").first(),
          // Context log entries
          db.prepare("SELECT COUNT(*) as count FROM context_log").first(),
          // Activity: last 24h
          db
            .prepare(
              "SELECT COUNT(*) as count FROM memories WHERE created_at > datetime('now', '-1 day')",
            )
            .first(),
          // Activity: last 7 days
          db
            .prepare(
              "SELECT COUNT(*) as count FROM memories WHERE created_at > datetime('now', '-7 days')",
            )
            .first(),
          // Activity: last 30 days
          db
            .prepare(
              "SELECT COUNT(*) as count FROM memories WHERE created_at > datetime('now', '-30 days')",
            )
            .first(),
          // Top tags (explode comma-separated tags and count)
          db
            .prepare(
              `
            WITH RECURSIVE split_tags AS (
              SELECT id, trim(substr(tags, 1, instr(tags || ',', ',') - 1)) as tag,
                     substr(tags, instr(tags || ',', ',') + 1) as rest
              FROM memories WHERE tags != ''
              UNION ALL
              SELECT id, trim(substr(rest, 1, instr(rest || ',', ',') - 1)),
                     substr(rest, instr(rest || ',', ',') + 1)
              FROM split_tags WHERE rest != ''
            )
            SELECT tag, COUNT(*) as count FROM split_tags WHERE tag != '' GROUP BY tag ORDER BY count DESC LIMIT 10
          `,
            )
            .all(),
          // Oldest memory
          db
            .prepare(
              "SELECT created_at FROM memories ORDER BY created_at ASC LIMIT 1",
            )
            .first(),
          // Newest memory
          db
            .prepare(
              "SELECT created_at FROM memories ORDER BY created_at DESC LIMIT 1",
            )
            .first(),
          // Last activity per source
          db
            .prepare(
              `
            SELECT source, MAX(created_at) as last_active, COUNT(*) as total
            FROM memories GROUP BY source ORDER BY last_active DESC
          `,
            )
            .all(),
          // Memory creation timeline (last 7 days, grouped by day)
          db
            .prepare(
              `
            SELECT date(created_at) as day, COUNT(*) as count
            FROM memories
            WHERE created_at > datetime('now', '-7 days')
            GROUP BY date(created_at)
            ORDER BY day ASC
          `,
            )
            .all(),
        ]);

        // Estimate storage (rough: avg 200 bytes per memory row)
        const totalMemories =
          ((memoryCounts as Record<string, unknown>)?.count as number) || 0;
        const estimatedStorageMB = (totalMemories * 200) / (1024 * 1024);
        const d1FreeLimitMB = 5 * 1024; // 5GB in MB
        const storagePercent = (
          (estimatedStorageMB / d1FreeLimitMB) *
          100
        ).toFixed(4);

        const activeProjects = (projectCounts.results || []).find(
          (r: Record<string, unknown>) => r.status === "active",
        );
        const archivedProjects = (projectCounts.results || []).find(
          (r: Record<string, unknown>) => r.status === "archived",
        );

        // Build structured JSON for Claude to visualize
        const stats = {
          summary: {
            total_memories: totalMemories,
            total_projects_active:
              (activeProjects as Record<string, unknown>)?.count || 0,
            total_projects_archived:
              (archivedProjects as Record<string, unknown>)?.count || 0,
            total_instructions:
              (instructionCount as Record<string, unknown>)?.count || 0,
            total_identity_fields:
              (identityCount as Record<string, unknown>)?.count || 0,
            total_context_logs:
              (contextLogCount as Record<string, unknown>)?.count || 0,
          },
          memories_by_category: (memoryByCategory.results || []).map(
            (r: Record<string, unknown>) => ({
              category: r.category,
              count: r.count,
            }),
          ),
          memories_by_source: (memoryBySource.results || []).map(
            (r: Record<string, unknown>) => ({
              source: r.source,
              count: r.count,
            }),
          ),
          activity: {
            last_24h:
              (recentActivity24h as Record<string, unknown>)?.count || 0,
            last_7d: (recentActivity7d as Record<string, unknown>)?.count || 0,
            last_30d:
              (recentActivity30d as Record<string, unknown>)?.count || 0,
          },
          timeline_7d: (memoryTimeline.results || []).map(
            (r: Record<string, unknown>) => ({
              day: r.day,
              count: r.count,
            }),
          ),
          top_tags: (topTags.results || []).map(
            (r: Record<string, unknown>) => ({
              tag: r.tag,
              count: r.count,
            }),
          ),
          source_activity: (lastActivityBySource.results || []).map(
            (r: Record<string, unknown>) => ({
              source: r.source,
              last_active: r.last_active,
              total_memories: r.total,
            }),
          ),
          date_range: {
            oldest_memory:
              (oldestMemory as Record<string, unknown>)?.created_at || null,
            newest_memory:
              (newestMemory as Record<string, unknown>)?.created_at || null,
          },
          storage: {
            estimated_mb: Number(estimatedStorageMB.toFixed(2)),
            d1_free_limit_mb: d1FreeLimitMB,
            usage_percent: Number(storagePercent),
          },
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `# Context Hub Dashboard\n\nHere are your hub stats. Display these as a beautiful inline visual dashboard directly in this conversation — use colorful stat cards, inline bar charts with Unicode/emoji blocks, tag pills, and a storage progress bar. Light background, rich colors, clean typography.\n\n\`\`\`json\n${JSON.stringify(stats, null, 2)}\n\`\`\``,
            },
          ],
        };
      },
    );

    // ══════════════════════════════════════════════════════════════
    // 0.2 — SELF-EVOLVING LAYER (Hermes + LLM Wiki)
    // ══════════════════════════════════════════════════════════════

    // ── SKILLS (procedural memory) ──────────────────────────────

    this.server.tool(
      "save_skill",
      `Save a reusable skill — a markdown procedure the agent can auto-load next time a similar task appears. Skills are the "self-improving" layer: facts go in memories, methods go in skills.

WHEN TO USE: When a complex task succeeds and the procedure is worth re-running. Promote a memory to a skill when a reflection of kind "skill_candidate" is pending. Also use when the user says "remember how to do X", "save this workflow", "add this as a skill".

SMART BEHAVIOR:
- trigger_pattern: keywords the agent should look for when deciding to load this skill (e.g. "deploy frontend", "publish npm")
- procedure: markdown describing the steps — what to do, in what order, with gotchas
- Upserts by name. Bumps version + sets parent_skill_id when an existing skill is rewritten.`,
      {
        name: z
          .string()
          .describe("Skill name (unique slug, e.g. 'deploy-cf-worker')"),
        trigger_pattern: z
          .string()
          .describe(
            "Keywords/description for when this skill should auto-load",
          ),
        procedure: z.string().describe("The markdown how-to"),
        tags: z.string().default("").describe("Comma-separated tags"),
        parent_memory_id: z
          .number()
          .optional()
          .describe("If promoting a memory, its id (links lineage)"),
      },
      async ({ name, trigger_pattern, procedure, tags, parent_memory_id }) => {
        const db = this.env.DB;
        const scan = scanForInjection(procedure);
        if (scan.severity === "high") {
          await this.logInjection(
            "save_skill",
            procedure,
            scan.matched,
            scan.severity,
            "blocked",
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `⛔ Skill blocked. Procedure matched high-severity injection patterns: ${scan.matched.join(", ")}.`,
              },
            ],
          };
        }
        const source = this.detectSource();
        const existing = await db
          .prepare("SELECT id, version FROM skills WHERE name = ?")
          .bind(name)
          .first();

        let skillId: number;
        if (existing) {
          const ex = existing as Record<string, unknown>;
          const newVersion = ((ex.version as number) ?? 1) + 1;
          await db
            .prepare(
              `UPDATE skills SET trigger_pattern = ?, procedure = ?, tags = ?, version = ?, parent_skill_id = ?, source = ?, updated_at = datetime('now') WHERE id = ?`,
            )
            .bind(
              trigger_pattern,
              procedure,
              tags,
              newVersion,
              ex.id,
              source,
              ex.id,
            )
            .run();
          skillId = ex.id as number;
        } else {
          const r = await db
            .prepare(
              `INSERT INTO skills (name, trigger_pattern, procedure, tags, source) VALUES (?, ?, ?, ?, ?)`,
            )
            .bind(name, trigger_pattern, procedure, tags, source)
            .run();
          skillId = r.meta.last_row_id as number;
        }

        // If promoted from a memory, link the lineage
        if (parent_memory_id) {
          await this.recordReflection(
            "skill_candidate",
            `Memory #${parent_memory_id} promoted to skill "${name}" (#${skillId}).`,
            JSON.stringify({ action: "applied", target_id: skillId }),
            `${parent_memory_id},${skillId}`,
          );
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Skill "${name}" saved (id: ${skillId}). Will auto-load when triggers match.`,
            },
          ],
        };
      },
    );

    this.server.tool(
      "get_skill",
      `Load a skill's procedure by name or by matching the current task to a trigger pattern.

WHEN TO USE: Before starting a complex recurring task — search skills first, follow the saved procedure if one matches. After the task finishes, call record_skill_outcome to track success/failure.

SMART BEHAVIOR: If 'query' is provided, runs FTS over name/trigger/procedure. If 'name' is provided, exact lookup.`,
      {
        name: z.string().optional().describe("Exact skill name"),
        query: z
          .string()
          .optional()
          .describe("Free-text query to match trigger patterns"),
      },
      async ({ name, query }) => {
        const db = this.env.DB;
        let rows: Record<string, unknown>[] = [];
        if (name) {
          const row = await db
            .prepare("SELECT * FROM skills WHERE name = ? AND active = 1")
            .bind(name)
            .first();
          if (row) rows = [row as Record<string, unknown>];
        } else if (query) {
          const keywords = query
            .toLowerCase()
            .replace(/[^\w\s]/g, "")
            .split(/\s+/)
            .filter((w) => w.length >= 3)
            .slice(0, 8)
            .join(" OR ");
          if (keywords) {
            const r = await db
              .prepare(
                `SELECT s.* FROM skills_fts fts JOIN skills s ON fts.rowid = s.id WHERE fts.skills_fts MATCH ? AND s.active = 1 ORDER BY rank LIMIT 5`,
              )
              .bind(keywords)
              .all();
            rows = (r.results || []) as Record<string, unknown>[];
          }
        }
        if (!rows.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No matching skill found. Use save_skill to create one.",
              },
            ],
          };
        }
        // Bump last_used_at on retrieved skills
        const ids = rows.map((r) => r.id as number);
        const placeholders = ids.map(() => "?").join(",");
        await db
          .prepare(
            `UPDATE skills SET last_used_at = datetime('now') WHERE id IN (${placeholders})`,
          )
          .bind(...ids)
          .run();
        const out = rows
          .map(
            (r) =>
              `## ${r.name} (v${r.version}, id ${r.id})\nTrigger: ${r.trigger_pattern}\nSuccess: ${r.success_count} | Failures: ${r.failure_count}\n\n${r.procedure}`,
          )
          .join("\n\n---\n\n");
        return { content: [{ type: "text" as const, text: out }] };
      },
    );

    this.server.tool(
      "list_skills",
      `List all active skills with their success/failure counts. Use to audit procedural memory.`,
      {
        limit: z.number().default(50),
      },
      async ({ limit }) => {
        const db = this.env.DB;
        const r = await db
          .prepare(
            `SELECT id, name, trigger_pattern, version, success_count, failure_count, last_used_at FROM skills WHERE active = 1 ORDER BY (success_count - failure_count) DESC, last_used_at DESC LIMIT ?`,
          )
          .bind(limit)
          .all();
        if (!r.results?.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No skills saved yet. Promote a memory with save_skill.",
              },
            ],
          };
        }
        const out = r.results
          .map((s) => {
            const row = s as Record<string, unknown>;
            return `[${row.id}] ${row.name} v${row.version} — ${row.trigger_pattern}\n    ✓ ${row.success_count}  ✗ ${row.failure_count}  last: ${row.last_used_at || "never"}`;
          })
          .join("\n\n");
        return { content: [{ type: "text" as const, text: out }] };
      },
    );

    this.server.tool(
      "record_skill_outcome",
      `Record whether a skill worked. Skills with high failure rates surface as reflections so the user can refine them.`,
      {
        skill_id: z.number(),
        success: z.boolean(),
        note: z.string().default(""),
      },
      async ({ skill_id, success, note }) => {
        const db = this.env.DB;
        const col = success ? "success_count" : "failure_count";
        await db
          .prepare(
            `UPDATE skills SET ${col} = ${col} + 1, last_used_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
          )
          .bind(skill_id)
          .run();
        // If failure rate > 50% and >= 3 total runs, flag a reflection
        const row = (await db
          .prepare(
            "SELECT name, success_count, failure_count FROM skills WHERE id = ?",
          )
          .bind(skill_id)
          .first()) as Record<string, unknown> | null;
        if (row) {
          const s = row.success_count as number;
          const f = row.failure_count as number;
          if (f + s >= 3 && f / (f + s) > 0.5) {
            await this.recordReflection(
              "skill_failed",
              `Skill "${row.name}" (#${skill_id}) is failing more than succeeding (${f}/${f + s}). Refine the procedure or retire it.`,
              JSON.stringify({ action: "refine_skill", target_id: skill_id }),
              String(skill_id),
            );
          }
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Outcome recorded for skill ${skill_id}: ${success ? "success" : "failure"}.${note ? ` Note: ${note}` : ""}`,
            },
          ],
        };
      },
    );

    // ── MEMORY LINKS (wiki graph) ────────────────────────────────

    this.server.tool(
      "link_memories",
      `Create a typed link between two memories. Builds the wiki-style graph that lets the hub flag contradictions, supersession, and clusters.

WHEN TO USE: When you spot a relationship between two memories — one supersedes another, two memories contradict, one supports another, or they're examples of a shared idea.

RELATIONS:
- supersedes: from_id replaces to_id (also sets to_id.superseded_by)
- contradicts: from_id contradicts to_id (both kept, flagged)
- supports: from_id reinforces to_id
- related: loose association
- example_of: from_id is an instance of to_id
- refines: from_id is a more precise version of to_id`,
      {
        from_id: z.number(),
        to_id: z.number(),
        relation: z.enum([
          "supersedes",
          "contradicts",
          "supports",
          "related",
          "example_of",
          "refines",
        ]),
        note: z.string().default(""),
      },
      async ({ from_id, to_id, relation, note }) => {
        const db = this.env.DB;
        if (from_id === to_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Cannot link a memory to itself.",
              },
            ],
          };
        }
        await db
          .prepare(
            `INSERT INTO memory_links (from_id, to_id, relation, note) VALUES (?, ?, ?, ?)
             ON CONFLICT(from_id, to_id, relation) DO UPDATE SET note = excluded.note`,
          )
          .bind(from_id, to_id, relation, note)
          .run();
        if (relation === "supersedes") {
          await db
            .prepare(
              "UPDATE memories SET superseded_by = ?, tier = 'cold' WHERE id = ?",
            )
            .bind(from_id, to_id)
            .run();
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Linked #${from_id} —[${relation}]→ #${to_id}.${relation === "supersedes" ? ` Memory #${to_id} marked cold (superseded).` : ""}`,
            },
          ],
        };
      },
    );

    this.server.tool(
      "get_memory_graph",
      `Get a memory's neighborhood — all incoming + outgoing links + the actual linked memories. Use to understand what surrounds a fact.`,
      {
        memory_id: z.number(),
        depth: z
          .number()
          .default(1)
          .describe("Currently only depth=1 supported"),
      },
      async ({ memory_id }) => {
        const db = this.env.DB;
        const center = (await db
          .prepare("SELECT * FROM memories WHERE id = ?")
          .bind(memory_id)
          .first()) as Record<string, unknown> | null;
        if (!center) {
          return {
            content: [
              { type: "text" as const, text: `Memory ${memory_id} not found.` },
            ],
          };
        }
        const outgoing = await db
          .prepare(
            `SELECT l.relation, l.note, m.id, m.content, m.category FROM memory_links l JOIN memories m ON m.id = l.to_id WHERE l.from_id = ?`,
          )
          .bind(memory_id)
          .all();
        const incoming = await db
          .prepare(
            `SELECT l.relation, l.note, m.id, m.content, m.category FROM memory_links l JOIN memories m ON m.id = l.from_id WHERE l.to_id = ?`,
          )
          .bind(memory_id)
          .all();
        const sections = [
          `## Memory #${memory_id} (${center.category}, confidence ${center.confidence})\n${center.content}`,
        ];
        if (outgoing.results?.length) {
          sections.push(
            "## Outgoing\n" +
              outgoing.results
                .map((r) => {
                  const row = r as Record<string, unknown>;
                  return `→ [${row.relation}] #${row.id} (${row.category}): ${(row.content as string).slice(0, 100)}`;
                })
                .join("\n"),
          );
        }
        if (incoming.results?.length) {
          sections.push(
            "## Incoming\n" +
              incoming.results
                .map((r) => {
                  const row = r as Record<string, unknown>;
                  return `← [${row.relation}] #${row.id} (${row.category}): ${(row.content as string).slice(0, 100)}`;
                })
                .join("\n"),
          );
        }
        return {
          content: [{ type: "text" as const, text: sections.join("\n\n") }],
        };
      },
    );

    // ── REFLECTIONS (self-improvement queue) ─────────────────────

    this.server.tool(
      "list_reflections",
      `List pending reflections — things the hub noticed and wants the user to resolve. Contradictions, stale facts, skill candidates, failing skills.

WHEN TO USE: Periodically (start of session, after a batch of saves) to catch up on hub housekeeping. The hub appends a hint to write responses already, but call this to see the full queue.`,
      {
        status: z
          .enum(["pending", "applied", "dismissed", "all"])
          .default("pending"),
        limit: z.number().default(20),
      },
      async ({ status, limit }) => {
        const db = this.env.DB;
        const sql =
          status === "all"
            ? "SELECT * FROM reflections ORDER BY created_at DESC LIMIT ?"
            : "SELECT * FROM reflections WHERE status = ? ORDER BY created_at DESC LIMIT ?";
        const r =
          status === "all"
            ? await db.prepare(sql).bind(limit).all()
            : await db.prepare(sql).bind(status, limit).all();
        if (!r.results?.length) {
          return {
            content: [
              { type: "text" as const, text: "No reflections. Hub is clean." },
            ],
          };
        }
        const out = r.results
          .map((row) => {
            const x = row as Record<string, unknown>;
            return `[${x.id}] (${x.status} / ${x.trigger}) ${x.observation}${x.related_ids ? `\n    related: ${x.related_ids}` : ""}`;
          })
          .join("\n\n");
        return { content: [{ type: "text" as const, text: out }] };
      },
    );

    this.server.tool(
      "resolve_reflection",
      `Mark a reflection as applied or dismissed. Call after you (or the user) acted on it.`,
      {
        id: z.number(),
        resolution: z.enum(["applied", "dismissed"]),
      },
      async ({ id, resolution }) => {
        const db = this.env.DB;
        await db
          .prepare(
            "UPDATE reflections SET status = ?, resolved_at = datetime('now') WHERE id = ?",
          )
          .bind(resolution, id)
          .run();
        return {
          content: [
            {
              type: "text" as const,
              text: `Reflection ${id} marked ${resolution}.`,
            },
          ],
        };
      },
    );

    // ── HUB HEALTH (the nudge surface) ───────────────────────────

    this.server.tool(
      "get_hub_health",
      `Inspect the hub's hygiene: stale memories, contradictions, low-confidence facts, skill candidates, injection log. Returns a prioritized action list.

WHEN TO USE: At session start (alongside get_full_context) or whenever the user asks "what's the state of my hub?" / "is my memory healthy?". Use the action list to nudge the user toward fixing the worst issues first.`,
      {},
      async () => {
        const db = this.env.DB;
        const [
          stale,
          lowConf,
          pending,
          contradictions,
          failingSkills,
          recentInjections,
        ] = await Promise.all([
          db
            .prepare(
              `SELECT COUNT(*) as c FROM memories WHERE verified_at IS NULL OR verified_at < datetime('now', '-180 days')`,
            )
            .first(),
          db
            .prepare(
              `SELECT COUNT(*) as c FROM memories WHERE confidence < 0.5`,
            )
            .first(),
          db
            .prepare(
              `SELECT trigger, COUNT(*) as c FROM reflections WHERE status = 'pending' GROUP BY trigger`,
            )
            .all(),
          db
            .prepare(
              `SELECT COUNT(*) as c FROM memory_links WHERE relation = 'contradicts'`,
            )
            .first(),
          db
            .prepare(
              `SELECT name, success_count, failure_count FROM skills WHERE active = 1 AND failure_count > success_count AND (failure_count + success_count) >= 3`,
            )
            .all(),
          db
            .prepare(
              `SELECT COUNT(*) as c FROM injection_log WHERE created_at > datetime('now', '-7 days')`,
            )
            .first(),
        ]);

        const staleC = ((stale as Record<string, unknown>)?.c as number) || 0;
        const lowC = ((lowConf as Record<string, unknown>)?.c as number) || 0;
        const contraC =
          ((contradictions as Record<string, unknown>)?.c as number) || 0;
        const injC =
          ((recentInjections as Record<string, unknown>)?.c as number) || 0;

        const actions: string[] = [];
        const byTrigger = Object.fromEntries(
          (pending.results || []).map((r) => {
            const row = r as Record<string, unknown>;
            return [row.trigger, row.c];
          }),
        );

        if (byTrigger.skill_candidate)
          actions.push(
            `🛠  ${byTrigger.skill_candidate} memory(ies) look procedural — promote with save_skill so they auto-load next time.`,
          );
        if (byTrigger.contradiction)
          actions.push(
            `⚠️  ${byTrigger.contradiction} contradiction(s) pending — review with list_reflections then link_memories with relation 'supersedes' or 'contradicts'.`,
          );
        if (staleC > 0)
          actions.push(
            `🗓  ${staleC} memory(ies) not verified in 6+ months — re-confirm or mark superseded.`,
          );
        if (lowC > 0)
          actions.push(
            `🤔 ${lowC} memory(ies) with confidence < 0.5 — verify or delete.`,
          );
        if (contraC > 0)
          actions.push(
            `🔀 ${contraC} contradiction link(s) in graph — resolve so the hub picks one truth.`,
          );
        if ((failingSkills.results || []).length)
          actions.push(
            `💔 ${(failingSkills.results || []).length} skill(s) failing more than succeeding — refine procedures.`,
          );
        if (injC > 0)
          actions.push(
            `🛡  ${injC} injection scan hit(s) in last 7 days — audit with raw query on injection_log.`,
          );
        if (!actions.length) actions.push("✅ Hub is clean. No action needed.");

        return {
          content: [
            {
              type: "text" as const,
              text: `# Hub Health\n\n${actions.map((a) => `- ${a}`).join("\n")}\n\n## Counts\n- Pending reflections: ${Object.values(byTrigger).reduce((a: number, b) => a + (b as number), 0)}\n- Stale memories: ${staleC}\n- Low-confidence memories: ${lowC}\n- Contradiction links: ${contraC}\n- Failing skills: ${(failingSkills.results || []).length}\n- Injection hits (7d): ${injC}`,
            },
          ],
        };
      },
    );

    // ── VERIFY MEMORY (decay reset) ─────────────────────────────

    this.server.tool(
      "verify_memory",
      `Confirm a memory is still true. Resets verified_at, bumps confidence. Use when the user re-asserts a fact, or when an agent checks a stale memory and finds it accurate.`,
      {
        id: z.number(),
        confidence_delta: z.number().default(0.1),
      },
      async ({ id, confidence_delta }) => {
        const db = this.env.DB;
        await db
          .prepare(
            `UPDATE memories SET verified_at = datetime('now'), confidence = MIN(1.0, confidence + ?) WHERE id = ?`,
          )
          .bind(confidence_delta, id)
          .run();
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory ${id} re-verified. Confidence bumped by ${confidence_delta}.`,
            },
          ],
        };
      },
    );
  }
}

// ── Worker Entry Point ────────────────────────────────────────
// McpAgent.serve() handles Durable Object routing, session management,
// and MCP protocol negotiation automatically.

const mcpHandler = ContextHub.serve("/mcp", {
  binding: "CONTEXT_HUB",
  corsOptions: {
    origin: "*",
    methods: "GET, POST, OPTIONS",
    headers: "Content-Type, Authorization, mcp-session-id",
  },
});

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          name: "Context Hub",
          version: "0.2.0",
          status: "ok",
          endpoints: ["/mcp"],
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Delegate all /mcp traffic to McpAgent's handler
    return mcpHandler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
