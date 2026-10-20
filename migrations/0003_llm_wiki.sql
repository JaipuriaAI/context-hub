-- Context Hub 0.3 — LLM Wiki layer (Karpathy's "LLM Wiki" pattern)
-- Raw sources (immutable) → wiki pages (LLM-maintained, cited, cross-linked)
-- → index-led query with answers filed back → lint → markdown mirror.
--
-- ZERO BREAKING CHANGES: new tables, plus two nullable columns on memories.

-- ─────────────────────────────────────────────────────────────
-- 1. RAW SOURCES — append-only, never changed
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note',  -- article | transcript | document | chat | note | url | other
  url TEXT DEFAULT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE, -- sha-256 of content; re-ingesting the same text returns the existing row
  captured_by TEXT DEFAULT 'unknown',-- MCP client that ingested it
  created_at TEXT DEFAULT (datetime('now'))
);

-- Immutability is enforced by the database, not just by the tool surface.
-- (Owner escape hatch for e.g. an accidentally ingested secret: drop these
--  triggers with `wrangler d1 execute`, delete the row, recreate them.)
CREATE TRIGGER IF NOT EXISTS sources_no_update BEFORE UPDATE ON sources BEGIN
  SELECT RAISE(ABORT, 'sources are immutable');
END;
CREATE TRIGGER IF NOT EXISTS sources_no_delete BEFORE DELETE ON sources BEGIN
  SELECT RAISE(ABORT, 'sources are append-only');
END;

CREATE VIRTUAL TABLE IF NOT EXISTS sources_fts USING fts5(
  title,
  content,
  content='sources',
  content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS sources_ai AFTER INSERT ON sources BEGIN
  INSERT INTO sources_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;

CREATE INDEX IF NOT EXISTS idx_sources_kind ON sources(kind);
CREATE INDEX IF NOT EXISTS idx_sources_created ON sources(created_at);

-- ─────────────────────────────────────────────────────────────
-- 2. WIKI PAGES — summaries, concepts, entities, projects, syntheses
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,          -- lowercase-kebab; also the markdown file name
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'concept', -- concept | entity | project | summary | synthesis
  summary TEXT NOT NULL DEFAULT '',   -- one line, shown in the index
  body TEXT NOT NULL DEFAULT '',      -- markdown; [[slug]] links to other pages
  tags TEXT DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT DEFAULT 'unknown',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Every overwrite keeps the previous version.
CREATE TABLE IF NOT EXISTS page_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT DEFAULT '',
  updated_by TEXT DEFAULT 'unknown',
  created_at TEXT DEFAULT (datetime('now'))
);

-- [[slug]] links parsed out of page bodies (target may not exist yet → lint flags it).
CREATE TABLE IF NOT EXISTS page_links (
  from_page_id INTEGER NOT NULL,
  to_slug TEXT NOT NULL,
  PRIMARY KEY (from_page_id, to_slug)
);

-- What a page's claims rest on: raw sources, memories, other pages.
CREATE TABLE IF NOT EXISTS citations (
  page_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,          -- source | memory | page
  target_ref TEXT NOT NULL,           -- source id, memory id, or page slug
  PRIMARY KEY (page_id, target_type, target_ref)
);

CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
  title,
  summary,
  body,
  tags,
  content='pages',
  content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
  INSERT INTO pages_fts(rowid, title, summary, body, tags)
  VALUES (new.id, new.title, new.summary, new.body, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
  INSERT INTO pages_fts(pages_fts, rowid, title, summary, body, tags)
  VALUES ('delete', old.id, old.title, old.summary, old.body, old.tags);
END;
CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
  INSERT INTO pages_fts(pages_fts, rowid, title, summary, body, tags)
  VALUES ('delete', old.id, old.title, old.summary, old.body, old.tags);
  INSERT INTO pages_fts(rowid, title, summary, body, tags)
  VALUES (new.id, new.title, new.summary, new.body, new.tags);
END;

CREATE INDEX IF NOT EXISTS idx_pages_type ON pages(type);
CREATE INDEX IF NOT EXISTS idx_page_revisions_page ON page_revisions(page_id);
CREATE INDEX IF NOT EXISTS idx_page_links_to ON page_links(to_slug);
CREATE INDEX IF NOT EXISTS idx_citations_target ON citations(target_type, target_ref);

-- ─────────────────────────────────────────────────────────────
-- 3. MEMORIES point into the wiki and back to their evidence
-- ─────────────────────────────────────────────────────────────
ALTER TABLE memories ADD COLUMN source_id INTEGER DEFAULT NULL; -- raw source the fact came from
ALTER TABLE memories ADD COLUMN page_slug TEXT DEFAULT NULL;    -- wiki page the fact belongs to

CREATE INDEX IF NOT EXISTS idx_memories_source_id ON memories(source_id);
CREATE INDEX IF NOT EXISTS idx_memories_page_slug ON memories(page_slug);
