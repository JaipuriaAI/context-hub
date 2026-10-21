-- Context Hub 0.2 — Self-Evolving Layer
-- Adds Hermes-style procedural memory + LLM Wiki-style linking + decay/provenance
-- on top of the existing flat memory store.
--
-- ZERO BREAKING CHANGES: every addition is either a new table or a new column
-- with a safe default. Existing tools continue to work unchanged.

-- ─────────────────────────────────────────────────────────────
-- 1. PROVENANCE + DECAY on memories
-- ─────────────────────────────────────────────────────────────
-- Existing memories rows get sensible defaults so nothing breaks.
ALTER TABLE memories ADD COLUMN confidence REAL DEFAULT 0.8;       -- 0.0–1.0
ALTER TABLE memories ADD COLUMN verified_at TEXT DEFAULT NULL;     -- last time user/agent confirmed it
ALTER TABLE memories ADD COLUMN superseded_by INTEGER DEFAULT NULL;-- points at the newer memory that replaced this
ALTER TABLE memories ADD COLUMN tier TEXT DEFAULT 'warm';          -- hot | warm | cold (prompt budget tier)
ALTER TABLE memories ADD COLUMN access_count INTEGER DEFAULT 0;    -- bumped on retrieval, drives hot/cold tiering
ALTER TABLE memories ADD COLUMN last_accessed_at TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_memories_tier ON memories(tier);
CREATE INDEX IF NOT EXISTS idx_memories_superseded ON memories(superseded_by);
CREATE INDEX IF NOT EXISTS idx_memories_confidence ON memories(confidence);

-- ─────────────────────────────────────────────────────────────
-- 2. MEMORY LINKS — wiki-style graph
-- ─────────────────────────────────────────────────────────────
-- Contradictions, supersession, support, relatedness — between any two memories.
CREATE TABLE IF NOT EXISTS memory_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  relation TEXT NOT NULL,         -- contradicts | supersedes | supports | related | example_of | refines
  confidence REAL DEFAULT 0.8,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(from_id, to_id, relation),
  FOREIGN KEY (from_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES memories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_links_from ON memory_links(from_id);
CREATE INDEX IF NOT EXISTS idx_links_to ON memory_links(to_id);
CREATE INDEX IF NOT EXISTS idx_links_relation ON memory_links(relation);

-- ─────────────────────────────────────────────────────────────
-- 3. SKILLS — procedural memory (the Hermes leap)
-- ─────────────────────────────────────────────────────────────
-- A "skill" is a markdown procedure the agent extracted from a successful task.
-- When a similar trigger appears, load the procedure and refine it after use.
CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  trigger_pattern TEXT NOT NULL,    -- when to load this skill (keywords / description)
  procedure TEXT NOT NULL,          -- the markdown how-to
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_used_at TEXT DEFAULT NULL,
  version INTEGER DEFAULT 1,
  parent_skill_id INTEGER DEFAULT NULL,  -- lineage: skill v1 → v2 → v3
  source TEXT DEFAULT 'unknown',
  tags TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (parent_skill_id) REFERENCES skills(id) ON DELETE SET NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
  name, trigger_pattern, procedure, tags,
  content='skills', content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS skills_ai AFTER INSERT ON skills BEGIN
  INSERT INTO skills_fts(rowid, name, trigger_pattern, procedure, tags)
  VALUES (new.id, new.name, new.trigger_pattern, new.procedure, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS skills_ad AFTER DELETE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, trigger_pattern, procedure, tags)
  VALUES ('delete', old.id, old.name, old.trigger_pattern, old.procedure, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS skills_au AFTER UPDATE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, trigger_pattern, procedure, tags)
  VALUES ('delete', old.id, old.name, old.trigger_pattern, old.procedure, old.tags);
  INSERT INTO skills_fts(rowid, name, trigger_pattern, procedure, tags)
  VALUES (new.id, new.name, new.trigger_pattern, new.procedure, new.tags);
END;

CREATE INDEX IF NOT EXISTS idx_skills_active ON skills(active);
CREATE INDEX IF NOT EXISTS idx_skills_last_used ON skills(last_used_at);

-- ─────────────────────────────────────────────────────────────
-- 4. REFLECTIONS — substrate for self-improvement
-- ─────────────────────────────────────────────────────────────
-- Agent writes a reflection when it spots a contradiction, a stale fact,
-- a repeated workflow, or a skill failure. Tools read pending reflections
-- and surface them to the user as suggestions.
CREATE TABLE IF NOT EXISTS reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger TEXT NOT NULL,            -- contradiction | stale_fact | skill_candidate | skill_failed | duplicate_cluster | low_confidence
  observation TEXT NOT NULL,        -- what was noticed
  proposed_change TEXT DEFAULT '',  -- JSON: { action, target_id, payload }
  related_ids TEXT DEFAULT '',      -- comma-separated memory/skill IDs involved
  status TEXT DEFAULT 'pending',    -- pending | applied | dismissed
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_reflections_status ON reflections(status);
CREATE INDEX IF NOT EXISTS idx_reflections_trigger ON reflections(trigger);

-- ─────────────────────────────────────────────────────────────
-- 5. INJECTION SCAN LOG — security audit trail
-- ─────────────────────────────────────────────────────────────
-- Every flagged write gets logged here. Doesn't block the write by default
-- (tools decide), but gives the user a security feed.
CREATE TABLE IF NOT EXISTS injection_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  surface TEXT NOT NULL,            -- save_memory | save_instruction | save_project | etc.
  content_preview TEXT NOT NULL,    -- first 200 chars
  patterns_matched TEXT NOT NULL,   -- comma-separated rule IDs
  severity TEXT NOT NULL,           -- low | medium | high
  action_taken TEXT NOT NULL,       -- blocked | flagged | sanitized
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_injection_severity ON injection_log(severity);
CREATE INDEX IF NOT EXISTS idx_injection_created ON injection_log(created_at);
