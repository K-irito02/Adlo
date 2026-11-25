#!/usr/bin/env node
/**
 * Rule mirror sync: `.agents/rules` is the only editable copy; `.opencode/rules`
 * and `.trae/rules` must stay byte-identical.
 *
 * Usage:
 *   pnpm --dir adlo run agents:mirror            # copy .agents/rules to both mirrors
 *   pnpm --dir adlo run agents:mirror -- --check # report drift, exit 1 when out of sync
 *   pnpm --dir adlo run agents:mirror -- --prune # also delete mirror-only files
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const SOURCE = ".agents/rules";
const MIRRORS = [".opencode/rules", ".trae/rules"];

function listFiles(root) {
  const files = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.isFile()) {
        files.push(rel);
      }
    }
  };
  walk(root, "");
  return files.sort();
}

/** Sync one directory; returns the list of drifted files (empty when identical). */
export function syncDirectory(sourceRoot, mirrorRoot, options = {}) {
  const { check = false, prune = false } = options;
  const sourceFiles = listFiles(sourceRoot);
  const mirrorFiles = fs.existsSync(mirrorRoot) ? listFiles(mirrorRoot) : [];
  const drifted = [];

  for (const file of sourceFiles) {
    const sourcePath = path.join(sourceRoot, file);
    const mirrorPath = path.join(mirrorRoot, file);
    const sourceBytes = fs.readFileSync(sourcePath);
    const mirrorBytes = fs.existsSync(mirrorPath) ? fs.readFileSync(mirrorPath) : null;
    if (mirrorBytes && sourceBytes.equals(mirrorBytes)) {
      continue;
    }
    drifted.push(file);
    if (!check) {
      fs.mkdirSync(path.dirname(mirrorPath), { recursive: true });
      fs.writeFileSync(mirrorPath, sourceBytes);
    }
  }

  for (const file of mirrorFiles) {
    if (sourceFiles.includes(file)) {
      continue;
    }
    drifted.push(file);
    if (!check && prune) {
      fs.rmSync(path.join(mirrorRoot, file), { force: true });
    }
  }

  return drifted;
}

export function mirrorRules(options = {}) {
  const sourceRoot = path.join(repoRoot, SOURCE);
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`source rules directory not found: ${SOURCE}`);
  }
  const results = [];
  for (const mirror of MIRRORS) {
    const drifted = syncDirectory(sourceRoot, path.join(repoRoot, mirror), options);
    results.push({ mirror, drifted });
  }
  return results;
}

export function parseArgs(argv) {
  const options = { check: false, prune: false, help: false };
  for (const arg of argv) {
    if (arg === "--check") options.check = true;
    else if (arg === "--prune") options.prune = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage: node scripts/agents-mirror.mjs [--check] [--prune]",
        "",
        "  --check  report drift without writing (exit 1 when mirrors differ)",
        "  --prune  delete mirror-only files (default: report them)",
      ].join("\n"),
    );
    return;
  }

  const results = mirrorRules(options);
  const drift = results.flatMap((result) =>
    result.drifted.map((file) => `${result.mirror}/${file}`),
  );
  if (options.check) {
    if (drift.length > 0) {
      console.error("[agents-mirror] mirrors are out of sync:");
      for (const file of drift) console.error(`  - ${file}`);
      process.exit(1);
    }
    console.log("[agents-mirror] OK (rules mirrors match .agents/rules)");
    return;
  }
  console.log(`[agents-mirror] synced ${results.length} mirrors; ${drift.length} file(s) updated`);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`[agents-mirror] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
