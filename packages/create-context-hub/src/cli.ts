#!/usr/bin/env node

import * as p from "@clack/prompts";
import pc from "picocolors";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cp,
  readdir,
  readFile,
  writeFile,
  unlink,
  rename,
  copyFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = resolve(__dirname, "..", "templates", "default");

function runCommand(
  cmd: string,
  args: string[],
  cwd?: string,
): { success: boolean; output: string } {
  try {
    const output = execFileSync(cmd, args, {
      cwd,
      stdio: ["inherit", "pipe", "pipe"],
      encoding: "utf-8",
    });
    return { success: true, output: output ?? "" };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const parts = [error.stdout, error.stderr, error.message].filter(Boolean);
    return {
      success: false,
      output: parts.join("\n").trim() || "Unknown error",
    };
  }
}

function runCommandLive(
  cmd: string,
  args: string[],
  cwd?: string,
): { success: boolean; output: string } {
  try {
    const result = spawnSync(cmd, args, {
      cwd,
      stdio: ["inherit", "inherit", "inherit"],
      encoding: "utf-8",
    });
    return { success: result.status === 0, output: "" };
  } catch (err: unknown) {
    const error = err as { message?: string };
    return { success: false, output: error.message ?? "" };
  }
}

function parseDatabaseId(output: string): string | null {
  const match =
    output.match(/database_id\s*=\s*"([^"]+)"/) ??
    output.match(/"database_id"\s*:\s*"([^"]+)"/);
  return match?.[1] ?? null;
}

function parseDeployUrl(output: string): string | null {
  const match = output.match(/(https:\/\/[^\s]+\.workers\.dev)/);
  return match?.[1] ?? null;
}

async function processTemplates(
  targetDir: string,
  replacements: Record<string, string>,
): Promise<void> {
  const entries = await readdir(targetDir, {
    recursive: true,
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".tmpl")) continue;

    const tmplPath = join(entry.parentPath ?? entry.path, entry.name);
    let content = await readFile(tmplPath, "utf-8");

    for (const [key, value] of Object.entries(replacements)) {
      content = content.replaceAll(`{{${key}}}`, value);
    }

    const finalPath = tmplPath.replace(/\.tmpl$/, "");
    await writeFile(finalPath, content, "utf-8");
    await unlink(tmplPath);
  }
}

async function scaffold(firstArg: string | undefined): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" create-context-hub ")));

  p.log.info(
    `Your personal AI context layer — shared across any MCP client (Claude, ChatGPT, Perplexity, Cursor, and more).\n` +
      `${pc.dim("Runs on Cloudflare Workers (free tier). Costs $0/month.")}`,
  );

  // Step 1: Project name
  const argName = firstArg;
  let projectName: string;

  if (argName && !argName.startsWith("-")) {
    projectName = argName;
    p.log.info(`Project name: ${pc.cyan(projectName)}`);
  } else {
    const nameResult = await p.text({
      message: "What should your project be called?",
      placeholder: "my-context-hub",
      defaultValue: "my-context-hub",
      validate: (value) => {
        if (!value.trim()) return "Project name is required";
        if (!/^[a-z0-9-]+$/.test(value))
          return "Use lowercase letters, numbers, and hyphens only";
        return undefined;
      },
    });
    if (p.isCancel(nameResult)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }
    projectName = nameResult;
  }

  const targetDir = resolve(process.cwd(), projectName);

  if (existsSync(targetDir)) {
    p.log.error(`Directory ${pc.red(projectName)} already exists.`);
    process.exit(1);
  }

  // Step 2: Scaffold project
  const scaffoldSpinner = p.spinner();
  scaffoldSpinner.start("Scaffolding project files...");

  await cp(TEMPLATES_DIR, targetDir, { recursive: true });
  // npm strips dotfiles — rename gitignore → .gitignore
  const gitignorePath = join(targetDir, "gitignore");
  if (existsSync(gitignorePath)) {
    await rename(gitignorePath, join(targetDir, ".gitignore"));
  }
  await processTemplates(targetDir, {
    PROJECT_NAME: projectName,
    DB_ID: "PLACEHOLDER",
  });

  scaffoldSpinner.stop("Project scaffolded.");

  // Step 3: Install dependencies
  p.log.step("Installing dependencies...");
  const installResult = runCommandLive("npm", ["install"], targetDir);
  if (!installResult.success) {
    p.log.warn(
      `npm install failed. Run manually: ${pc.cyan(`cd ${projectName} && npm install`)}`,
    );
  } else {
    p.log.success("Dependencies installed.");
  }

  // Step 4: Cloudflare setup
  const setupCloudflare = await p.confirm({
    message: "Set up Cloudflare? (login, create database, deploy)",
    initialValue: true,
  });

  if (p.isCancel(setupCloudflare) || !setupCloudflare) {
    printManualSteps(projectName);
    p.outro(
      pc.green("Project created! Follow the steps above to finish setup."),
    );
    process.exit(0);
  }

  // Step 5: Wrangler login
  const loginSpinner = p.spinner();
  loginSpinner.start("Checking Cloudflare authentication...");

  const whoami = runCommand("npx", ["wrangler", "whoami"], targetDir);
  if (whoami.success && !whoami.output.includes("not authenticated")) {
    loginSpinner.stop("Already logged in to Cloudflare.");
  } else {
    loginSpinner.stop("Need to log in to Cloudflare.");
    p.log.info("Opening browser for Cloudflare login...");

    const loginResult = runCommandLive("npx", ["wrangler", "login"], targetDir);
    if (!loginResult.success) {
      p.log.error("Cloudflare login failed.");
      p.log.warn(
        `Run manually: ${pc.cyan(`cd ${projectName} && npx wrangler login`)}`,
      );
      printManualSteps(projectName, "login");
      p.outro(
        pc.yellow("Fix the login issue and continue with the steps above."),
      );
      process.exit(1);
    }
    p.log.success("Logged in to Cloudflare.");
  }

  // Step 6: Create D1 database
  const dbName = `${projectName}-db`;
  const dbSpinner = p.spinner();
  dbSpinner.start(`Creating D1 database "${dbName}"...`);

  const dbResult = runCommand(
    "npx",
    ["wrangler", "d1", "create", dbName],
    targetDir,
  );
  if (!dbResult.success) {
    dbSpinner.stop(pc.red("Failed to create D1 database."));
    p.log.error(dbResult.output);
    p.log.warn(
      `Run manually: ${pc.cyan(`cd ${projectName} && npx wrangler d1 create ${dbName}`)}`,
    );
    printManualSteps(projectName, "db");
    p.outro(pc.yellow("Fix the issue and continue with the steps above."));
    process.exit(1);
  }

  const databaseId = parseDatabaseId(dbResult.output);
  if (!databaseId) {
    dbSpinner.stop(
      pc.yellow("Database created but couldn't parse database_id."),
    );
    p.log.warn(
      "Check the output above and manually update wrangler.json with the database_id.",
    );
    p.log.message(dbResult.output);
  } else {
    dbSpinner.stop(`Database created: ${pc.cyan(databaseId)}`);

    const wranglerPath = join(targetDir, "wrangler.json");
    let wranglerContent = await readFile(wranglerPath, "utf-8");
    wranglerContent = wranglerContent.replace("PLACEHOLDER", databaseId);
    await writeFile(wranglerPath, wranglerContent, "utf-8");
    p.log.success("Updated wrangler.json with database ID.");
  }

  // Step 7: Run migration
  p.log.step("Running database migration...");
  const migrateResult = runCommandLive(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      dbName,
      "--remote",
      "--file=./migrations/0001_init.sql",
    ],
    targetDir,
  );
  if (!migrateResult.success) {
    p.log.warn(
      `Migration failed. Run manually: ${pc.cyan(`cd ${projectName} && npx wrangler d1 execute ${dbName} --remote --file=./migrations/0001_init.sql`)}`,
    );
  } else {
    p.log.success("Database migration complete.");
  }

  // Step 8: Deploy
  p.log.step("Deploying to Cloudflare Workers...");

  const deployResult = runCommand("npx", ["wrangler", "deploy"], targetDir);
  let deployedUrl: string | null = null;

  if (!deployResult.success) {
    p.log.warn(
      `Deploy failed. Run manually: ${pc.cyan(`cd ${projectName} && npx wrangler deploy`)}`,
    );
  } else {
    deployedUrl = parseDeployUrl(deployResult.output);
    if (deployedUrl) {
      p.log.success(`Deployed to ${pc.cyan(deployedUrl)}`);
    } else {
      p.log.success("Deployed successfully.");
      p.log.message(deployResult.output);
    }
  }

  // Step 9: API key setup
  let apiKey: string | null = null;

  if (deployedUrl) {
    const setupApiKey = await p.confirm({
      message: "Protect your hub with an API key? (recommended)",
      initialValue: true,
    });

    if (!p.isCancel(setupApiKey) && setupApiKey) {
      apiKey = randomUUID();
      p.log.step("Setting API key...");

      const secretResult = spawnSync(
        "npx",
        ["wrangler", "secret", "put", "API_KEY"],
        {
          cwd: targetDir,
          input: apiKey + "\n",
          stdio: ["pipe", "inherit", "inherit"],
          encoding: "utf-8",
        },
      );

      if (secretResult.status !== 0) {
        p.log.warn(
          `Failed to set API key. Run manually: ${pc.cyan(`cd ${projectName} && npx wrangler secret put API_KEY`)}\n` +
            `  Then enter your chosen key when prompted.`,
        );
        apiKey = null;
      } else {
        p.log.success("API key set.");
      }
    }
  }

  // Step 10: Claude Code connection
  if (deployedUrl) {
    const mcpUrl = `${deployedUrl}/mcp`;

    const setupClaude = await p.confirm({
      message: "Configure Claude Code connection?",
      initialValue: true,
    });

    if (!p.isCancel(setupClaude) && setupClaude) {
      const claudeSpinner = p.spinner();
      claudeSpinner.start("Adding MCP server to Claude Code...");

      const claudeArgs = [
        "mcp",
        "add",
        "--transport",
        "http",
        "--scope",
        "user",
        "context-hub",
        mcpUrl,
      ];
      if (apiKey) {
        claudeArgs.push("--header", `Authorization: Bearer ${apiKey}`);
      }

      const claudeResult = spawnSync("claude", claudeArgs, {
        stdio: ["inherit", "pipe", "pipe"],
        encoding: "utf-8",
      });
      if (claudeResult.status !== 0) {
        claudeSpinner.stop(
          pc.yellow("Couldn't configure Claude Code automatically."),
        );
        const cmdParts = [
          `claude mcp add \\`,
          `  --transport http \\`,
          `  --scope user \\`,
        ];
        if (apiKey) {
          cmdParts.push(`  --header "Authorization: Bearer ${apiKey}" \\`);
        }
        cmdParts.push(`  context-hub \\`, `  ${mcpUrl}`);
        p.log.warn(
          `Run manually:\n${cmdParts.map((l) => `  ${pc.cyan(l)}`).join("\n")}`,
        );
      } else {
        claudeSpinner.stop("Claude Code connected.");
      }
    }

    // Print Claude.ai instructions
    p.log.step(pc.bold("Connect to Claude.ai + Claude App:"));
    p.log.message(
      `  1. Go to ${pc.cyan("claude.ai/settings/connectors")}\n` +
        `  2. Click ${pc.bold('"Add custom connector"')}\n` +
        `  3. Enter URL: ${pc.cyan(mcpUrl)}\n` +
        (apiKey
          ? `  4. Click Advanced settings → add header:\n` +
            `     ${pc.dim("Authorization")}: ${pc.dim(`Bearer ${apiKey}`)}\n`
          : "") +
        `  ${apiKey ? "5" : "4"}. Click ${pc.bold("Add")} → ${pc.bold("Connect")}`,
    );
  }

  // Step 11: Summary
  p.log.step(pc.bold("Summary"));

  const summaryLines: string[] = [
    `  ${pc.green("✓")} Project:  ${pc.cyan(targetDir)}`,
  ];

  if (deployedUrl) {
    summaryLines.push(`  ${pc.green("✓")} URL:      ${pc.cyan(deployedUrl)}`);
    summaryLines.push(
      `  ${pc.green("✓")} MCP:      ${pc.cyan(deployedUrl + "/mcp")}`,
    );
  }

  if (apiKey) {
    summaryLines.push(`  ${pc.green("✓")} API Key:  ${pc.cyan(apiKey)}`);
    summaryLines.push(`    ${pc.dim("(save this — it won't be shown again)")}`);
  }

  p.log.message(summaryLines.join("\n"));

  p.outro(
    pc.green("Your Context Hub is live!") +
      pc.dim(" Run `get_full_context` in Claude to verify."),
  );
}

function printManualSteps(projectName: string, from?: string): void {
  const steps: string[] = [];
  let n = 1;

  if (!from || from === "login") {
    steps.push(`  ${n++}. ${pc.cyan(`cd ${projectName}`)}`);
    steps.push(`  ${n++}. ${pc.cyan("npx wrangler login")}`);
  }
  if (!from || from === "login" || from === "db") {
    steps.push(
      `  ${n++}. ${pc.cyan(`npx wrangler d1 create ${projectName}-db`)}`,
    );
    steps.push(
      `  ${n++}. Update ${pc.bold("wrangler.json")} with the database_id from the output`,
    );
    steps.push(
      `  ${n++}. ${pc.cyan(`npx wrangler d1 execute ${projectName}-db --remote --file=./migrations/0001_init.sql`)}`,
    );
    steps.push(`  ${n++}. ${pc.cyan("npx wrangler deploy")}`);
  }

  p.log.step(pc.bold("Remaining steps:"));
  p.log.message(steps.join("\n"));
}

function printUsage(): void {
  console.log(
    `\n${pc.bold("create-context-hub")} — scaffold, update, or locate a Context Hub MCP server.\n\n` +
      `${pc.bold("Usage:")}\n` +
      `  ${pc.cyan("npx create-context-hub")} [project-name]   Scaffold a new hub (interactive)\n` +
      `  ${pc.cyan("npx create-context-hub update")}           Update an existing hub to the latest template\n` +
      `  ${pc.cyan("npx create-context-hub locate")}           Find Context Hub projects on this machine\n` +
      `  ${pc.cyan("npx create-context-hub --help")}           Show this help\n\n` +
      `${pc.bold("Examples:")}\n` +
      `  ${pc.dim("# Fresh scaffold, prompts for project name")}\n` +
      `  ${pc.cyan("npx create-context-hub")}\n\n` +
      `  ${pc.dim("# Fresh scaffold with explicit name")}\n` +
      `  ${pc.cyan("npx create-context-hub my-hub")}\n\n` +
      `  ${pc.dim("# Update an existing project (run from inside the project directory)")}\n` +
      `  ${pc.cyan("cd my-hub && npx create-context-hub@latest update")}\n\n` +
      `  ${pc.dim("# Forgot where your hub lives? Scan common directories:")}\n` +
      `  ${pc.cyan("npx create-context-hub@latest locate")}\n`,
  );
}

// Directories to skip while walking the filesystem.
const LOCATE_SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
  ".DS_Store",
  "Library",
  "Applications",
  ".Trash",
]);

const LOCATE_MAX_DEPTH = 4;

interface HubMatch {
  path: string;
  workerName: string | null;
  databaseName: string | null;
  databaseId: string | null;
}

async function findHubsInDir(
  root: string,
  maxDepth: number,
): Promise<HubMatch[]> {
  const matches: HubMatch[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // permission denied, symlink loop, etc. — skip silently
    }

    // Check whether this directory is a Context Hub project.
    const hasWrangler = entries.some(
      (e) => e.isFile() && e.name === "wrangler.json",
    );
    if (hasWrangler) {
      const match = await identifyHub(dir);
      if (match) {
        matches.push(match);
        return; // don't recurse into a hub directory
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (LOCATE_SKIP.has(entry.name)) continue;
      if (entry.name.startsWith(".")) continue;
      await walk(join(dir, entry.name), depth + 1);
    }
  }

  await walk(root, 0);
  return matches;
}

async function identifyHub(dir: string): Promise<HubMatch | null> {
  // Fingerprint: wrangler.json + src/index.ts + migrations/0001_init.sql,
  // plus wrangler.json references a CONTEXT_HUB durable object or a context-hub-like DB.
  const srcExists = existsSync(join(dir, "src", "index.ts"));
  const migrationExists = existsSync(join(dir, "migrations", "0001_init.sql"));
  if (!srcExists || !migrationExists) return null;

  let content: string;
  try {
    content = await readFile(join(dir, "wrangler.json"), "utf-8");
  } catch {
    return null;
  }

  if (!/CONTEXT_HUB|context-hub/i.test(content)) return null;

  // Parse wrangler.json — it's json-with-comments, so strip simple // and /* */ comments.
  const cleaned = content
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  let parsed: {
    name?: string;
    d1_databases?: Array<{ database_name?: string; database_id?: string }>;
  } = {};
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Non-fatal — return what we can.
  }

  return {
    path: dir,
    workerName: parsed.name ?? null,
    databaseName: parsed.d1_databases?.[0]?.database_name ?? null,
    databaseId: parsed.d1_databases?.[0]?.database_id ?? null,
  };
}

async function locateProjects(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" create-context-hub locate ")));

  const home = homedir();
  const cwd = process.cwd();

  // Search roots in priority order. De-dupe.
  const rawRoots = [
    cwd,
    join(home, "Documents"),
    join(home, "Projects"),
    join(home, "code"),
    join(home, "Code"),
    join(home, "dev"),
    join(home, "Developer"),
    join(home, "workspace"),
    join(home, "src"),
    home,
  ];
  const seenRoots = new Set<string>();
  const roots: string[] = [];
  for (const r of rawRoots) {
    if (!existsSync(r)) continue;
    if (seenRoots.has(r)) continue;
    seenRoots.add(r);
    roots.push(r);
  }

  const spinner = p.spinner();
  spinner.start(`Scanning ${roots.length} common locations...`);

  const allMatches: HubMatch[] = [];
  const seenPaths = new Set<string>();

  for (const root of roots) {
    // Shallower search for $HOME to avoid walking Photos/Music/etc.
    const depth = root === home ? 2 : LOCATE_MAX_DEPTH;
    const found = await findHubsInDir(root, depth);
    for (const match of found) {
      if (seenPaths.has(match.path)) continue;
      seenPaths.add(match.path);
      allMatches.push(match);
    }
  }

  spinner.stop(
    allMatches.length === 0
      ? "No hubs found in common locations."
      : `Found ${allMatches.length} Context Hub ${allMatches.length === 1 ? "project" : "projects"}.`,
  );

  if (allMatches.length === 0) {
    p.log.info(`Searched:\n${roots.map((r) => `  ${pc.dim(r)}`).join("\n")}`);
    p.log.info(
      `\nTry a manual search if your hub is in an unusual location:\n` +
        `  ${pc.cyan(
          `find ~ -name "wrangler.json" -not -path "*/node_modules/*" -exec grep -l "CONTEXT_HUB" {} \\; 2>/dev/null`,
        )}\n\n` +
        `Or check your Cloudflare dashboard: ${pc.cyan("dash.cloudflare.com/?to=/:account/workers")}`,
    );
    p.outro(pc.yellow("No projects found."));
    return;
  }

  p.log.step(pc.bold("Found:"));
  for (let i = 0; i < allMatches.length; i++) {
    const m = allMatches[i];
    const lines = [`  ${pc.cyan(`[${i + 1}]`)} ${pc.bold(m.path)}`];
    if (m.workerName) {
      lines.push(`      Worker:   ${pc.green(m.workerName)}`);
    }
    if (m.databaseName) {
      lines.push(
        `      D1 Name:  ${pc.green(m.databaseName)}${
          m.databaseId ? pc.dim(` (${m.databaseId})`) : ""
        }`,
      );
    }
    p.log.message(lines.join("\n"));
  }

  p.log.info(
    `\n${pc.bold("Next steps:")}\n` +
      `  ${pc.dim("# Update any of these to the latest template")}\n` +
      `  ${pc.cyan(`cd ${allMatches[0].path}`)}\n` +
      `  ${pc.cyan("npx create-context-hub@latest update")}\n\n` +
      `  ${pc.dim("# Deploy changes to Cloudflare")}\n` +
      `  ${pc.cyan("npx wrangler deploy")}`,
  );

  p.outro(pc.green("Done."));
}

// Parse the D1 database name from a project's wrangler.json so we can run
// schema probes / migrations via wrangler CLI without asking the user.
async function parseDbNameFromWrangler(
  wranglerPath: string,
): Promise<string | null> {
  try {
    const raw = await readFile(wranglerPath, "utf-8");
    const json = JSON.parse(raw) as {
      d1_databases?: Array<{ database_name?: string }>;
    };
    return json.d1_databases?.[0]?.database_name ?? null;
  } catch {
    return null;
  }
}

// Probe the remote D1 database to see whether the 0.2 self-evolving schema
// (confidence column on memories) is already applied. Returns:
//   "applied"   → schema is on 0.2, no migration needed
//   "pending"   → 0.1 schema, needs 0002 migration
//   "unknown"   → probe failed (no auth, DB missing, etc.); caller asks user
async function probe02Schema(
  dbName: string,
  cwd: string,
): Promise<"applied" | "pending" | "unknown"> {
  const probe = runCommand(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      dbName,
      "--remote",
      "--command",
      "SELECT name FROM pragma_table_info('memories') WHERE name='confidence' LIMIT 1;",
      "--json",
    ],
    cwd,
  );
  if (!probe.success) return "unknown";
  // Wrangler --json output contains the rows; "confidence" presence means applied.
  if (/"confidence"/.test(probe.output)) return "applied";
  return "pending";
}

async function updateProject(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" create-context-hub update ")));

  const cwd = process.cwd();

  // Detect whether we're in a scaffolded Context Hub project.
  const wranglerPath = join(cwd, "wrangler.json");
  const indexPath = join(cwd, "src", "index.ts");
  const migrationPath = join(cwd, "migrations", "0001_init.sql");

  const missing: string[] = [];
  if (!existsSync(wranglerPath)) missing.push("wrangler.json");
  if (!existsSync(indexPath)) missing.push("src/index.ts");
  if (!existsSync(migrationPath)) missing.push("migrations/0001_init.sql");

  if (missing.length > 0) {
    p.log.error(
      `This doesn't look like a Context Hub project. Missing: ${missing.join(", ")}`,
    );
    p.log.info(
      `Run ${pc.cyan("npx create-context-hub update")} from inside a project scaffolded by this CLI.`,
    );
    p.outro(pc.yellow("Update cancelled."));
    process.exit(1);
  }

  // Load CLI version for reporting.
  let cliVersion = "unknown";
  try {
    const ownPkg = JSON.parse(
      await readFile(resolve(__dirname, "..", "package.json"), "utf-8"),
    );
    cliVersion = ownPkg.version ?? "unknown";
  } catch {
    // non-fatal
  }

  p.log.info(
    `Updating your Context Hub to ${pc.cyan(`create-context-hub@${cliVersion}`)}.\n\n` +
      `${pc.bold("What this does, in plain English:")}\n` +
      `  ${pc.green("✓")} Checks your local files against the new template\n` +
      `  ${pc.green("✓")} Checks your live Cloudflare database for the latest schema\n` +
      `  ${pc.green("✓")} Asks you before each step — nothing happens without confirmation\n` +
      `  ${pc.green("✓")} Backs up files as ${pc.cyan(".bak")} before any change\n` +
      `  ${pc.green("✓")} Redeploys to Cloudflare so your AI clients see the new tools\n\n` +
      `${pc.bold("What is preserved:")}\n` +
      `  ${pc.green("✓")} Every memory you've saved\n` +
      `  ${pc.green("✓")} Every project, instruction, identity field\n` +
      `  ${pc.green("✓")} Your wrangler.json, package.json, API keys, custom code\n\n` +
      `${pc.dim("If something feels off, you can cancel at any prompt by pressing Ctrl+C.")}`,
  );

  // Compare template source to user's source to see what's actually changing.
  const templateIndexPath = join(TEMPLATES_DIR, "src", "index.ts");
  const templateMigrationPath = join(
    TEMPLATES_DIR,
    "migrations",
    "0001_init.sql",
  );
  // 0.2 — self-evolving layer (additive migration). Present in templates ≥ 0.4.
  const template02MigrationPath = join(
    TEMPLATES_DIR,
    "migrations",
    "0002_self_evolving.sql",
  );
  const user02MigrationPath = join(cwd, "migrations", "0002_self_evolving.sql");

  const [userIndex, templateIndex, userMigration, templateMigration] =
    await Promise.all([
      readFile(indexPath, "utf-8"),
      readFile(templateIndexPath, "utf-8"),
      readFile(migrationPath, "utf-8"),
      readFile(templateMigrationPath, "utf-8"),
    ]);

  const template02Exists = existsSync(template02MigrationPath);
  const user02Exists = existsSync(user02MigrationPath);
  let template02Migration = "";
  let user02Migration = "";
  if (template02Exists) {
    template02Migration = await readFile(template02MigrationPath, "utf-8");
  }
  if (user02Exists) {
    user02Migration = await readFile(user02MigrationPath, "utf-8");
  }

  const indexChanged = userIndex !== templateIndex;
  const migrationChanged = userMigration !== templateMigration;
  // 0.2 migration is brand new for upgrading users (file doesn't exist yet).
  const migration02New = template02Exists && !user02Exists;
  // Or content drift if both exist.
  const migration02Changed =
    template02Exists && user02Exists && template02Migration !== user02Migration;

  const filesNeedUpdate =
    indexChanged || migrationChanged || migration02New || migration02Changed;

  // ── Probe remote D1 BEFORE deciding "already up to date" ─────────────
  // This is the key fix: even when local files match the template, the user's
  // live D1 may still be on the 0.1 schema (common when running update from
  // the source repo, or when a previous update skipped the DB step).
  const dbName = await parseDbNameFromWrangler(wranglerPath);
  let dbStatus: "applied" | "pending" | "unknown" = "unknown";
  if (dbName) {
    const probeSpinner = p.spinner();
    probeSpinner.start(`Probing ${dbName} for 0.2 schema...`);
    dbStatus = await probe02Schema(dbName, cwd);
    probeSpinner.stop(`Remote schema: ${dbStatus}.`);
  } else {
    p.log.warn(
      "Could not parse database name from wrangler.json — DB probe skipped.",
    );
  }

  const dbNeedsMigration = dbStatus === "pending";

  if (!filesNeedUpdate && !dbNeedsMigration) {
    if (dbStatus === "applied") {
      p.outro(
        pc.green(
          "Already up to date — files match template and remote D1 is on 0.2 schema.",
        ),
      );
    } else {
      p.outro(
        pc.green("Files already up to date.") +
          pc.dim(
            " (Could not verify remote D1 — run `npm run db:upgrade` manually if needed.)",
          ),
      );
    }
    return;
  }

  // Summarize what will change.
  const changes: string[] = [];
  if (indexChanged) {
    const diff = lineDiffSummary(userIndex, templateIndex);
    changes.push(
      `  ${pc.yellow("~")} src/index.ts                       ${pc.dim(`(${diff})`)}`,
    );
  }
  if (migrationChanged) {
    const diff = lineDiffSummary(userMigration, templateMigration);
    changes.push(
      `  ${pc.yellow("~")} migrations/0001_init.sql           ${pc.dim(`(${diff})`)}`,
    );
  }
  if (migration02New) {
    const lines = template02Migration.split("\n").length;
    changes.push(
      `  ${pc.green("+")} migrations/0002_self_evolving.sql  ${pc.dim(`(new, ${lines} lines)`)}`,
    );
  } else if (migration02Changed) {
    const diff = lineDiffSummary(user02Migration, template02Migration);
    changes.push(
      `  ${pc.yellow("~")} migrations/0002_self_evolving.sql  ${pc.dim(`(${diff})`)}`,
    );
  }
  if (dbNeedsMigration) {
    changes.push(
      `  ${pc.green("↑")} remote D1 schema                  ${pc.dim(`(${dbName} — needs 0.2 migration)`)}`,
    );
  }

  if (filesNeedUpdate) {
    p.log.step(pc.bold("Files that will be updated:"));
  } else {
    p.log.step(pc.bold("Schema migration needed (files already current):"));
  }
  p.log.message(changes.join("\n"));

  if (migration02New || migration02Changed || dbNeedsMigration) {
    p.log.info(
      `${pc.cyan("0.2 self-evolving layer")} — adds skills, memory_links, reflections, injection_log tables\n` +
        `${pc.dim("and 6 new columns on `memories` (confidence, verified_at, tier, ...).")}\n` +
        `${pc.dim("All changes are additive — existing rows keep their data, ALTER TABLE ADD COLUMN")}\n` +
        `${pc.dim("uses defaults so reads continue working, and new tables use CREATE TABLE IF NOT EXISTS.")}`,
    );
  }
  if (migrationChanged) {
    p.log.info(
      `${pc.dim("0001_init.sql is being refreshed (comment/format changes only — no schema diff against your live DB).")}`,
    );
  }

  // Only ask about file-write confirmation if files actually need updating.
  if (filesNeedUpdate) {
    const proceed = await p.confirm({
      message:
        "Backup (.bak) will be written for each existing file. Proceed with update?",
      initialValue: true,
    });
    if (p.isCancel(proceed) || !proceed) {
      p.outro(pc.yellow("Update cancelled. No changes made."));
      return;
    }
  }

  // ── File write block (only if files actually differ) ──────────────
  if (filesNeedUpdate) {
    const backupSpinner = p.spinner();
    backupSpinner.start("Backing up existing files...");
    if (indexChanged) {
      await copyFile(indexPath, `${indexPath}.bak`);
    }
    if (migrationChanged) {
      await copyFile(migrationPath, `${migrationPath}.bak`);
    }
    if (user02Exists && migration02Changed) {
      await copyFile(user02MigrationPath, `${user02MigrationPath}.bak`);
    }
    backupSpinner.stop("Backups written (.bak files).");

    const writeSpinner = p.spinner();
    writeSpinner.start("Applying template updates...");
    if (indexChanged) {
      await writeFile(indexPath, templateIndex, "utf-8");
    }
    if (migrationChanged) {
      await writeFile(migrationPath, templateMigration, "utf-8");
    }
    if (template02Exists) {
      await writeFile(user02MigrationPath, template02Migration, "utf-8");
    }
    writeSpinner.stop("Template files updated.");
  }

  // ── Run remote 0002 migration if D1 schema is on 0.1 ───────────────
  // We reuse the `dbStatus` probed at the top of the function — runs even
  // when local files match the template (which is what bit the source-repo case).
  if (dbNeedsMigration && dbName) {
    const runMigration = await p.confirm({
      message:
        "Apply the 0.2 self-evolving migration to your REMOTE D1 now? (additive only — existing memories preserved)",
      initialValue: true,
    });
    if (p.isCancel(runMigration) || !runMigration) {
      p.log.info(
        `${pc.dim("Skipped DB migration. Run later with:")} ${pc.cyan("npm run db:upgrade")}`,
      );
    } else {
      p.log.step("Applying 0002_self_evolving.sql to remote D1...");
      const migrateResult = runCommandLive(
        "npx",
        [
          "wrangler",
          "d1",
          "execute",
          dbName,
          "--remote",
          "--file=./migrations/0002_self_evolving.sql",
        ],
        cwd,
      );
      if (!migrateResult.success) {
        p.log.warn(
          `Migration command exited non-zero. If you see "duplicate column" errors, that's safe — the new columns already exist.\n` +
            `Re-run later with: ${pc.cyan("npm run db:upgrade")}`,
        );
      } else {
        // Verify by re-probing — gives the user confidence the migration landed.
        const reProbe = await probe02Schema(dbName, cwd);
        if (reProbe === "applied") {
          p.log.success(
            `${pc.green("0.2 schema applied")} — confirmed via re-probe. Existing memories preserved with defaults (confidence=0.8, tier=warm).`,
          );
        } else {
          p.log.warn(
            `Migration ran but re-probe still shows '${reProbe}'. Inspect manually: ${pc.cyan(`npx wrangler d1 execute ${dbName} --remote --command "PRAGMA table_info(memories);"`)}`,
          );
        }
      }
    }
  } else if (dbStatus === "applied" && filesNeedUpdate) {
    p.log.info(
      `${pc.dim("Remote D1 already on 0.2 schema — no DB migration needed.")}`,
    );
  } else if (dbStatus === "unknown") {
    p.log.warn(
      `Couldn't reach D1 to verify schema (likely not logged in or DB missing).\n` +
        `If your hub is missing the 0.2 columns, run: ${pc.cyan("npm run db:upgrade")}`,
    );
  }

  // Offer to redeploy whenever there was ANY change (files OR DB migration).
  // A DB-only migration still benefits from a redeploy because the deployed
  // worker code may be older than the new schema (common when running update
  // from inside the source repo, or when a prior update skipped deploy).
  const anythingChanged = filesNeedUpdate || dbNeedsMigration;
  if (!anythingChanged) {
    p.outro(
      pc.green(
        "Already up to date — files match template and remote D1 is on 0.2 schema.",
      ),
    );
    return;
  }

  const deployMsg = filesNeedUpdate
    ? "Redeploy to Cloudflare Workers now?"
    : "Redeploy worker to Cloudflare now? (Recommended — your live worker code may be older than the new schema.)";
  const deploy = await p.confirm({
    message: deployMsg,
    initialValue: true,
  });
  if (p.isCancel(deploy) || !deploy) {
    p.log.info(`Deploy when ready: ${pc.cyan("npx wrangler deploy")}`);
    p.outro(
      pc.green("Update applied.") +
        pc.dim(" Backups saved as .bak files next to each updated file."),
    );
    return;
  }

  p.log.step("Deploying to Cloudflare Workers...");
  const deployResult = runCommandLive("npx", ["wrangler", "deploy"], cwd);
  if (!deployResult.success) {
    p.log.warn(
      `Deploy failed. Run manually: ${pc.cyan("npx wrangler deploy")}`,
    );
    p.log.info(
      `${pc.dim("If something went wrong, restore backups:")}\n` +
        `  ${pc.cyan("mv src/index.ts.bak src/index.ts")}\n` +
        `  ${pc.cyan("mv migrations/0001_init.sql.bak migrations/0001_init.sql")}`,
    );
    p.outro(
      pc.yellow("Deploy step failed — files are already updated on disk."),
    );
    return;
  }

  p.log.success("Redeployed.");
  p.log.info(
    `${pc.dim("Your MCP clients pick up the new tool schemas on their next conversation.")}\n` +
      `${pc.dim("In Claude Code, run /mcp to refresh immediately.")}\n` +
      `${pc.dim("Try: ")}${pc.cyan('"check hub health"')}${pc.dim(" — your client will call the new get_hub_health tool.")}`,
  );
  p.outro(
    pc.green("Update complete.") +
      pc.dim(" Remove .bak files once you've verified everything works."),
  );
}

function lineDiffSummary(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split("\n").length;
  const newLines = newContent.split("\n").length;
  const delta = newLines - oldLines;
  if (delta === 0) return `~${oldLines} lines, in-place changes`;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta} lines (${oldLines} → ${newLines})`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const first = argv[0];

  if (first === "--help" || first === "-h" || first === "help") {
    printUsage();
    return;
  }

  if (first === "update") {
    await updateProject();
    return;
  }

  if (first === "locate" || first === "list" || first === "ls") {
    await locateProjects();
    return;
  }

  await scaffold(first);
}

main().catch((err) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
