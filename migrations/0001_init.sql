-- Context Hub - Initial Schema
-- Stores memories, projects, instructions, and identity across any MCP client

-- Memories: things Claude learns about you across conversations
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',  -- general, preference, decision, learning, project
  source TEXT DEFAULT 'unknown',    -- auto-detected from MCP client's clientInfo.name (any client: claude-code, claude-ai, claude-app, chatgpt, perplexity, cursor, windsurf, zed, custom agent systems, etc. — slugified, free-form). Also 'manual' / 'import' for seeded rows.
  tags TEXT DEFAULT '',              -- comma-separated tags for filtering
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Full-text search index for memories
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content,
  category,
  tags,
  content='memories',
  content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, category, tags)
  VALUES (new.id, new.content, new.category, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, category, tags)
  VALUES ('delete', old.id, old.content, old.category, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, category, tags)
  VALUES ('delete', old.id, old.content, old.category, old.tags);
  INSERT INTO memories_fts(rowid, content, category, tags)
  VALUES (new.id, new.content, new.category, new.tags);
END;

-- Projects: workspace-level context (mirrors Claude.ai Projects concept)
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  instructions TEXT DEFAULT '',     -- custom instructions for this project
  status TEXT DEFAULT 'active',     -- active, archived
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Instructions: global custom instructions (like Claude.ai's "Custom Instructions")
CREATE TABLE IF NOT EXISTS instructions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,               -- system, style, behavior, constraint
  content TEXT NOT NULL,
  priority INTEGER DEFAULT 0,       -- higher = more important
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Identity: who you are — your profile that Claude should always know
CREATE TABLE IF NOT EXISTS identity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,         -- name, role, expertise, location, etc.
  value TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Context log: breadcrumb trail of what was discussed where
CREATE TABLE IF NOT EXISTS context_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,             -- auto-detected from MCP client's clientInfo.name (any client: claude-code, claude-ai, chatgpt, perplexity, cursor, custom agent systems, etc. — slugified, free-form)
  summary TEXT NOT NULL,            -- brief summary of what was discussed
  project_name TEXT DEFAULT NULL,   -- optional project association
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
CREATE INDEX IF NOT EXISTS idx_context_log_source ON context_log(source);
CREATE INDEX IF NOT EXISTS idx_context_log_created ON context_log(created_at);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
