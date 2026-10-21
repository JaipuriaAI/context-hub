#!/usr/bin/env node
// Mirror Context Hub into a folder of plain markdown you can open as an Obsidian vault
// (or as a sub-folder of one). One-way: hub → files. Re-run any time; it only touches
// files it wrote itself, tracked in .context-hub-manifest.json.
//
//   BASE=https://<worker>.workers.dev TOKEN=<API_KEY> node scripts/sync-obsidian.mjs [target-dir]
//
// Default target: ./context-hub-vault
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = (process.env.BASE ?? "").replace(/\/$/, "");
const TOKEN = process.env.TOKEN ?? process.env.API_KEY ?? "";
const target = path.resolve(process.argv[2] ?? "context-hub-vault");
const MANIFEST = ".context-hub-manifest.json";

if (!BASE || !TOKEN) {
  console.error("Set BASE (your Worker URL) and TOKEN (your API_KEY).");
  process.exit(2);
}

const res = await fetch(`${BASE}/mcp/export/markdown`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});
if (!res.ok) {
  console.error(
    `Export failed: HTTP ${res.status} ${await res.text().catch(() => "")}`.slice(
      0,
      400,
    ),
  );
  process.exit(1);
}
const { files, generated_at } = await res.json();

// Every path must stay inside the target folder.
const safe = (rel) => {
  if (
    typeof rel !== "string" ||
    !rel.endsWith(".md") ||
    path.isAbsolute(rel) ||
    rel.includes("\0")
  )
    return null;
  const abs = path.resolve(target, rel);
  return abs.startsWith(target + path.sep) ? abs : null;
};

let previous = [];
try {
  previous =
    JSON.parse(await readFile(path.join(target, MANIFEST), "utf8")).files ?? [];
} catch {
  /* first run */
}

const written = [];
let changed = 0;
for (const f of files) {
  const abs = safe(f.path);
  if (!abs) {
    console.warn(`skipped unsafe path: ${f.path}`);
    continue;
  }
  await mkdir(path.dirname(abs), { recursive: true });
  const old = await readFile(abs, "utf8").catch(() => null);
  if (old !== f.content) {
    await writeFile(abs, f.content, "utf8");
    changed++;
  }
  written.push(f.path);
}

// Remove files this script wrote last time that the hub no longer exports.
const keep = new Set(written);
let removed = 0;
for (const rel of previous) {
  if (keep.has(rel)) continue;
  const abs = safe(rel);
  if (abs) {
    await rm(abs, { force: true });
    removed++;
  }
}

await writeFile(
  path.join(target, MANIFEST),
  JSON.stringify({ generated_at, files: written }, null, 2),
);
console.log(
  `Synced ${written.length} files to ${target} (${changed} changed, ${removed} removed). Hub export: ${generated_at}`,
);
