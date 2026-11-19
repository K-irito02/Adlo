/**
 * Inspect the out-of-repo session registry (`<worktree-pool>/.sessions/*.json`)
 * and optionally close out `active` entries that have gone stale.
 *
 * Why: finished sessions are often never marked done/paused, so every cleanup
 * run has to ask the user whether a "active" entry is real. This is the tool the
 * skill means by "先向用户确认" — it turns that into a deterministic step.
 *
 * Usage:
 *   pnpm run worktree:sessions                          # list everything
 *   pnpm run worktree:sessions -- --stale-only          # list only stale active entries
 *   pnpm run worktree:sessions -- --reap                # mark stale actives paused (3d default)
 *   pnpm run worktree:sessions -- --reap --older-than 7d
 *
 * Only `status: active` entries older than the threshold are touched; every other
 * field is preserved. This script is meant to be run by a human, not by an agent
 * on someone else's session file.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { formatAge, sessionsDirFor, STALE_AFTER_MS } from "./worktree-registry.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseDuration(text) {
  const match = /^(\d+)([dh])$/i.exec(String(text ?? "").trim());
  if (!match) {
    throw new Error(`invalid duration: ${text} (expected e.g. 3d or 48h)`);
  }
  const value = Number(match[1]);
  return value * (match[2].toLowerCase() === "d" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000);
}

export function parseArgs(argv) {
  const options = {
    reap: false,
    staleOnly: false,
    olderThanMs: 3 * 24 * 60 * 60 * 1000,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--reap") {
      options.reap = true;
    } else if (arg === "--stale-only") {
      options.staleOnly = true;
    } else if (arg === "--older-than") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--older-than needs a value (e.g. 3d or 48h)");
      }
      options.olderThanMs = parseDuration(next);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return options;
}

function git(args, cwd) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return result.status === 0 ? (result.stdout ?? "").trim() : "";
}

function readEntries(sessionsDir, now) {
  let names;
  try {
    names = fs.readdirSync(sessionsDir);
  } catch {
    return [];
  }
  const entries = [];
  for (const name of names) {
    if (!name.endsWith(".json")) {
      continue;
    }
    const file = path.join(sessionsDir, name);
    let record;
    try {
      record = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      console.log(`[worktree:sessions] WARN malformed JSON skipped: ${file}`);
      continue;
    }
    let ageMs = 0;
    try {
      ageMs = Math.max(0, now - fs.statSync(file).mtimeMs);
    } catch {
      ageMs = 0;
    }
    entries.push({ file, name, record, ageMs });
  }
  return entries;
}

function reapEntry(entry, now) {
  const stamp = new Date(now).toISOString();
  entry.record.status = "paused";
  entry.record.pausedAt = stamp;
  const note = `[reaped ${stamp} as stale active (${formatAge(entry.ageMs)})]`;
  entry.record.notes = entry.record.notes ? `${entry.record.notes} ${note}` : note;
  fs.writeFileSync(entry.file, `${JSON.stringify(entry.record, null, 2)}\n`, "utf8");
}

function printUsage() {
  console.log(
    [
      "Usage: pnpm run worktree:sessions -- [options]",
      "",
      "  (no flags)                 list every registry entry",
      "  --stale-only               list only active entries older than the threshold",
      "  --older-than <3d|48h>      staleness threshold (default 3d)",
      "  --reap                     mark stale active entries as paused",
    ].join("\n"),
  );
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[worktree:sessions] ${error.message}`);
    printUsage();
    process.exit(2);
  }
  if (options.help) {
    printUsage();
    return;
  }

  const toplevel = git(["rev-parse", "--show-toplevel"], repoRoot);
  if (!toplevel) {
    console.error("[worktree:sessions] not inside a git worktree");
    process.exit(1);
  }
  const sessionsDir = sessionsDirFor(toplevel);
  if (!fs.existsSync(sessionsDir)) {
    console.log(`[worktree:sessions] no registry at ${sessionsDir}`);
    return;
  }

  const now = Date.now();
  const entries = readEntries(sessionsDir, now);
  const isStale = (entry) => entry.record.status === "active" && entry.ageMs >= options.olderThanMs;
  const selected = options.staleOnly ? entries.filter(isStale) : entries;

  console.log(
    `[worktree:sessions] ${sessionsDir} (stale after ${formatAge(options.olderThanMs)}, registry stale flag ${formatAge(
      STALE_AFTER_MS,
    )})`,
  );
  if (selected.length === 0) {
    console.log("  (none)");
  }
  for (const entry of selected) {
    const status = entry.record.status ?? "unknown";
    const marker = isStale(entry) ? "STALE " : "";
    console.log(
      `  ${marker}${String(status).padEnd(7)} ${String(entry.record.slot ?? "—").padEnd(8)} ` +
        `${formatAge(entry.ageMs).padStart(6)}  ${entry.name}`,
    );
  }

  if (!options.reap) {
    const candidates = entries.filter(isStale).length;
    if (candidates > 0) {
      console.log(
        `[worktree:sessions] ${candidates} stale active entr${candidates === 1 ? "y" : "ies"}; add --reap to close them out`,
      );
    }
    return;
  }

  const reaped = entries.filter(isStale);
  for (const entry of reaped) {
    reapEntry(entry, now);
    console.log(
      `[worktree:sessions] reaped ${entry.name} -> paused (age ${formatAge(entry.ageMs)})`,
    );
  }
  console.log(
    `[worktree:sessions] reaped ${reaped.length} entr${reaped.length === 1 ? "y" : "ies"}`,
  );
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) {
  main();
}
