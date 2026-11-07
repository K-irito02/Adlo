/**
 * Print the `[ENV]` snapshot required by the parallel-branch-development skill.
 *
 * Usage: `pnpm run worktree:env` (from `adlo/` or via `pnpm --dir adlo`).
 * The output is the fixed 10-line block from §2 of the skill, so agents can paste
 * it into the conversation instead of re-deriving each field by hand.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findLockedDevExecutables } from "./dev-instance.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function git(args, cwd = repoRoot) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return result.status === 0 ? (result.stdout ?? "").trim() : "";
}

const toplevel = git(["rev-parse", "--show-toplevel"]);
if (!toplevel) {
  console.error("[worktree:env] not inside a git worktree");
  process.exit(1);
}

const branch = git(["branch", "--show-current"]) || "—";
const sha = git(["rev-parse", "--short", "HEAD"]) || "—";
const [behind = "?", ahead = "?"] = git(["rev-list", "--left-right", "--count", "main...HEAD"])
  .split(/\s+/)
  .filter(Boolean);
const dirty = git(["status", "--porcelain"]).split(/\r?\n/).filter(Boolean).length;
const slot = path.basename(toplevel);
const isPoolWorktree = /-worktrees$/i.test(path.basename(path.dirname(toplevel)));
const mode = isPoolWorktree ? "existing-worktree" : "main-worktree";

const sessionsDir = path.join(path.dirname(toplevel), ".sessions");
const activeSessions = [];
let registry = "missing";

function formatAge(ms) {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) {
    return "just now";
  }
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.floor(hours / 24)}d`;
}

try {
  for (const name of fs.readdirSync(sessionsDir)) {
    if (!name.endsWith(".json")) {
      continue;
    }
    try {
      const filePath = path.join(sessionsDir, name);
      const record = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const sameWorktree =
        typeof record.worktree === "string" &&
        path.resolve(record.worktree).toLowerCase() === path.resolve(toplevel).toLowerCase();
      if (sameWorktree && record.status === "active") {
        registry = name;
        const ageMs = Date.now() - fs.statSync(filePath).mtimeMs;
        const stale = ageMs > 24 * 60 * 60 * 1000;
        activeSessions.push(
          `${record.session ?? name} (active${stale ? `, ${formatAge(ageMs)} stale` : ""})`,
        );
      }
    } catch {
      // Ignore a malformed registry entry; report the rest.
    }
  }
} catch {
  // No .sessions directory (main worktree or fresh clone).
}

const locked = findLockedDevExecutables(repoRoot);
const instance = locked.length > 0 ? locked.join(", ") : "none";
const hooks = git(["config", "--get", "core.hooksPath"]);
const hooksState = hooks === ".githooks" ? "ok" : "missing";
const graph = fs.existsSync(path.join(repoRoot, ".codegraph")) ? "ok" : "missing";

const lines = [
  "[ENV]",
  `  toplevel : ${toplevel}`,
  `  branch   : ${branch} @ ${sha}`,
  `  base     : main 落后 ${behind} / 领先 ${ahead}`,
  `  dirty    : ${dirty}`,
  `  slot     : ${slot} / mode : ${mode}`,
  `  others   : ${activeSessions.length > 0 ? activeSessions.join(", ") : "无"}`,
  `  instance : ${instance}`,
  `  hooks    : ${hooksState} / graph : ${graph}`,
  `  registry : ${registry}`,
];

console.log(lines.join("\n"));

if (graph === "missing") {
  console.log(
    "[worktree:env] WARN graph index missing; run: pnpm --dir adlo run setup:worktree (then retry)",
  );
}
if (hooksState === "missing") {
  console.log("[worktree:env] WARN git hooks not enabled; the same setup command enables them.");
}
