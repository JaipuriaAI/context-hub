#!/usr/bin/env node

import * as p from "@clack/prompts";
import pc from "picocolors";
import { execFileSync, spawnSync } from "node:child_process";
import { cp, readdir, readFile, writeFile, unlink, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = resolve(__dirname, "..", "templates", "default");

function runCommand(
  cmd: string,
  args: string[],
  cwd?: string
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
  cwd?: string
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
  replacements: Record<string, string>
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

async function main(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" create-context-hub ")));

  p.log.info(
    `Your personal AI context layer — bridging Claude.ai, Claude Code, and the Claude App.\n` +
      `${pc.dim("Runs on Cloudflare Workers (free tier). Costs $0/month.")}`
  );

  // Step 1: Project name
  const argName = process.argv[2];
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
      `npm install failed. Run manually: ${pc.cyan(`cd ${projectName} && npm install`)}`
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
      pc.green("Project created! Follow the steps above to finish setup.")
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
        `Run manually: ${pc.cyan(`cd ${projectName} && npx wrangler login`)}`
      );
      printManualSteps(projectName, "login");
      p.outro(
        pc.yellow("Fix the login issue and continue with the steps above.")
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
    targetDir
  );
  if (!dbResult.success) {
    dbSpinner.stop(pc.red("Failed to create D1 database."));
    p.log.error(dbResult.output);
    p.log.warn(
      `Run manually: ${pc.cyan(`cd ${projectName} && npx wrangler d1 create ${dbName}`)}`
    );
    printManualSteps(projectName, "db");
    p.outro(pc.yellow("Fix the issue and continue with the steps above."));
    process.exit(1);
  }

  const databaseId = parseDatabaseId(dbResult.output);
  if (!databaseId) {
    dbSpinner.stop(
      pc.yellow("Database created but couldn't parse database_id.")
    );
    p.log.warn(
      "Check the output above and manually update wrangler.json with the database_id."
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
    targetDir
  );
  if (!migrateResult.success) {
    p.log.warn(
      `Migration failed. Run manually: ${pc.cyan(`cd ${projectName} && npx wrangler d1 execute ${dbName} --remote --file=./migrations/0001_init.sql`)}`
    );
  } else {
    p.log.success("Database migration complete.");
  }

  // Step 8: Deploy
  p.log.step("Deploying to Cloudflare Workers...");

  const deployResult = runCommand(
    "npx",
    ["wrangler", "deploy"],
    targetDir
  );
  let deployedUrl: string | null = null;

  if (!deployResult.success) {
    p.log.warn(
      `Deploy failed. Run manually: ${pc.cyan(`cd ${projectName} && npx wrangler deploy`)}`
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
        }
      );

      if (secretResult.status !== 0) {
        p.log.warn(
          `Failed to set API key. Run manually: ${pc.cyan(`cd ${projectName} && npx wrangler secret put API_KEY`)}\n` +
            `  Then enter your chosen key when prompted.`
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
          pc.yellow("Couldn't configure Claude Code automatically.")
        );
        const cmdParts = [`claude mcp add \\`, `  --transport http \\`, `  --scope user \\`];
        if (apiKey) {
          cmdParts.push(`  --header "Authorization: Bearer ${apiKey}" \\`);
        }
        cmdParts.push(`  context-hub \\`, `  ${mcpUrl}`);
        p.log.warn(`Run manually:\n${cmdParts.map((l) => `  ${pc.cyan(l)}`).join("\n")}`);
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
        `  ${apiKey ? "5" : "4"}. Click ${pc.bold("Add")} → ${pc.bold("Connect")}`
    );
  }

  // Step 11: Summary
  p.log.step(pc.bold("Summary"));

  const summaryLines: string[] = [
    `  ${pc.green("✓")} Project:  ${pc.cyan(targetDir)}`,
  ];

  if (deployedUrl) {
    summaryLines.push(
      `  ${pc.green("✓")} URL:      ${pc.cyan(deployedUrl)}`
    );
    summaryLines.push(
      `  ${pc.green("✓")} MCP:      ${pc.cyan(deployedUrl + "/mcp")}`
    );
  }

  if (apiKey) {
    summaryLines.push(
      `  ${pc.green("✓")} API Key:  ${pc.cyan(apiKey)}`
    );
    summaryLines.push(
      `    ${pc.dim("(save this — it won't be shown again)")}`
    );
  }

  p.log.message(summaryLines.join("\n"));

  p.outro(
    pc.green("Your Context Hub is live!") +
      pc.dim(" Run `get_full_context` in Claude to verify.")
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
      `  ${n++}. ${pc.cyan(`npx wrangler d1 create ${projectName}-db`)}`
    );
    steps.push(
      `  ${n++}. Update ${pc.bold("wrangler.json")} with the database_id from the output`
    );
    steps.push(
      `  ${n++}. ${pc.cyan(`npx wrangler d1 execute ${projectName}-db --remote --file=./migrations/0001_init.sql`)}`
    );
    steps.push(`  ${n++}. ${pc.cyan("npx wrangler deploy")}`);
  }

  p.log.step(pc.bold("Remaining steps:"));
  p.log.message(steps.join("\n"));
}

main().catch((err) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
