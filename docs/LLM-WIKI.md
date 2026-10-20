# Context Hub as an LLM Wiki

Context Hub 0.3 implements Andrej Karpathy's "LLM Wiki" pattern: an LLM maintains a cross-linked markdown wiki over immutable raw sources, navigates it through an index, files good answers back, and lints it. The memory store from 0.1/0.2 stays as the fast, atomic-fact layer underneath.

Schema: [`migrations/0003_llm_wiki.sql`](../migrations/0003_llm_wiki.sql). Code: [`src/wiki.ts`](../src/wiki.ts). Verified by [`scripts/e2e-wiki.mjs`](../scripts/e2e-wiki.mjs) (40 checks).

## How each part of the pattern is implemented

| Karpathy's LLM Wiki                                | Context Hub 0.3                                                                                                                                                                                                                                                                                   | Match  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Raw-source layer, never changed                    | `sources` table. Database triggers reject every `UPDATE` and `DELETE`. Content is SHA-256 deduplicated. `ingest_source`, `get_source`, `list_sources`                                                                                                                                             | Strong |
| Wiki pages: summaries, concepts, entities          | `pages` of type `concept`, `entity`, `project`, `summary`, `synthesis`; markdown body, one-line summary, full revision history (`page_revisions`, `get_page_history`)                                                                                                                             | Strong |
| Cross-links                                        | `[[slug]]` links parsed into `page_links`, with backlinks in `get_page`. Typed `memory_links` (`supersedes`, `contradicts`, …) between facts. Memories point to their page (`page_slug`) and evidence (`source_id`)                                                                               | Strong |
| Schema file                                        | `instructions` + `identity` (+ per-project instructions), exported as `schema.md`. The server's MCP `instructions` field teaches every client the ingest → page → index → file-back → lint workflow                                                                                               | Strong |
| Ingest: a new source updates the pages it touches  | `ingest_source` stores the source and returns the pages and memories it touches plus a checklist. `save_page` records citations (`cites` or inline `[[source-N]]` / `[[memory-N]]`). `lint_wiki` lists sources not yet integrated                                                                 | Strong |
| Query: navigate the index, cite, file answers back | `get_index` and the `contexthub://index` resource (catalog with one-line summaries) → `get_page` → follow links. `search_wiki` covers pages, sources and memories, with punctuation-safe FTS. `file_answer` stores a cited synthesis page                                                         | Strong |
| Lint                                               | `lint_wiki`: broken links, stale claims (citing superseded/deleted memories), dead page citations, unintegrated sources, uncited pages, citation-less syntheses, orphans, missing summaries, dangling memory→page pointers. Plus 0.2's `get_hub_health`, reflections, decay and injection scanner | Strong |
| `log.md`                                           | `context_log`. Ingests, page creates/updates and filed answers are logged automatically. Exposed as `contexthub://log` and `log.md`                                                                                                                                                               | Strong |
| Plain markdown you own, browsable in Obsidian      | `GET /mcp/export/markdown` (same OAuth/Bearer protection as `/mcp`) returns the whole hub as markdown with YAML frontmatter and wikilinks. `npm run wiki:sync` writes it into a folder you open as an Obsidian vault                                                                              | Strong |

## Workflow for agents

1. **Ingest:** `ingest_source` with the full text. Then follow its checklist: write a `summary` page, update every touched page with `cites.sources=[N]`, create concept and entity pages, and save atomic facts with `save_memory(source_id, page_slug)`.
2. **Query:** `get_index` → `get_page` → follow `[[links]]`. Use `search_wiki` only when the catalog has no fitting page.
3. **File back:** `file_answer` with the pages, sources and memories the answer used. It needs at least one citation.
4. **Lint:** `lint_wiki` after larger edits; every finding comes with its fix.

## Obsidian mirror

```bash
BASE=https://<your-worker>.workers.dev TOKEN=<API_KEY> npm run wiki:sync -- ~/Documents/obsidian-wiki-vault/context-hub
```

The script writes `index.md`, `log.md`, `schema.md`, `pages/<type>/<slug>.md`, `sources/source-N.md`, `memories/memory-N.md` and `projects/project-<name>.md`. It only touches files listed in its own `.context-hub-manifest.json`, so it can live inside an existing vault. The mirror is one-way: edit through the hub's tools (the LLM is the wiki's writer), then re-sync.

## Upgrading an existing deployment

```bash
npm run db:migrate:0003:remote   # additive: new tables + two nullable memory columns
npm run deploy
```

The migration is not idempotent, because SQLite has no `ADD COLUMN IF NOT EXISTS`. Run it once. D1 Time Travel can restore the database to before the migration.

## Limits

- Sources over 900,000 characters must be split; pages are capped at 200,000.
- A wrongly ingested source (for example, one containing a secret) can only be removed by the owner. Drop the two `sources_no_*` triggers with `wrangler d1 execute`, delete the row, then recreate the triggers from the migration.
