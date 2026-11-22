/**
 * Print the `[ENV]` snapshot required by the parallel-branch-development skill.
 *
 * Usage: `pnpm run worktree:env` (from `adlo/` or via `pnpm --dir adlo`).
 * `--all` also prints the `[WORKTREES]` table (path / branch / base / dirty /
 * session occupancy) that §3.0 asks for, so agents stop re-deriving it with
 * hand-written `git rev-list` loops.
 *
 * Exit code 2 when another active session claims this worktree. The snapshot
 * still prints, so the agent can show the user why it stopped. Pass
 * `--allow-shared` only after explicit user approval.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findLockedDevExecutables } from "./dev-instance.mjs";
import {
  formatAge,
  listWorktrees,
  readActiveSessions,
  summarizeSessions,
} from "./worktree-registry.mjs";

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

const active = readActiveSessions(toplevel);
const allowShared = process.argv.includes("--allow-shared");
const registry = active[0]?.name ?? "missing";
const others = active.map(
  ({ record, name, ageMs, stale }) =>
    `${record.session ?? name} (active${stale ? `, ${formatAge(ageMs)} stale` : ""})`,
);

const locked = findLockedDevExecutables(repoRoot);
const instance = locked.length > 0 ? locked.join(", ") : "none";
const hooks = git(["config", "--get", "core.hooksPath"]);
const hooksState = hooks === ".husky" ? "ok" : "missing";
const graph = fs.existsSync(path.join(repoRoot, ".codegraph")) ? "ok" : "missing";

const lines = [
  "[ENV]",
  `  toplevel : ${toplevel}`,
  `  branch   : ${branch} @ ${sha}`,
  `  base     : main 落后 ${behind} / 领先 ${ahead}`,
  `  dirty    : ${dirty}`,
  `  slot     : ${slot} / mode : ${mode}`,
  `  others   : ${others.length > 0 ? others.join(", ") : "无"}`,
  `  instance : ${instance}`,
  `  hooks    : ${hooksState} / graph : ${graph}`,
  `  registry : ${registry}`,
];

console.log(lines.join("\n"));

if (active.length > 0 && !allowShared) {
  console.error(
    "[worktree:env] active session claims this worktree; stop or pass --allow-shared after user approval.",
  );
  process.exitCode = 2;
}

if (process.argv.includes("--all")) {
  console.log("");
  console.log(buildWorktreeTable(toplevel));
}

if (graph === "missing") {
  console.log(
    "[worktree:env] WARN graph index missing; run: pnpm --dir adlo run setup:worktree (then retry)",
  );
}
if (hooksState === "missing") {
  console.log("[worktree:env] WARN git hooks not enabled; the same setup command enables them.");
}

function buildWorktreeTable(currentToplevel) {
  const rows = listWorktrees(currentToplevel).map((worktree) => {
    const behindAhead = worktree.branch
      ? git(["rev-list", "--left-right", "--count", `main...${worktree.branch}`], worktree.path)
          .split(/\s+/)
          .filter(Boolean)
      : [];
    const dirtyCount = git(["status", "--porcelain"], worktree.path)
      .split(/\r?\n/)
      .filter(Boolean).length;
    return {
      branch: worktree.branch ?? (worktree.detached ? "(detached)" : "—"),
      base: behindAhead.length === 2 ? `${behindAhead[0]}/${behindAhead[1]}` : "—",
      dirty: String(dirtyCount),
      sessions: summarizeSessions(readActiveSessions(worktree.path)),
      path: worktree.path,
    };
  });

  const width = (header, values) =>
    Math.max(header.length, ...values.map((value) => String(value).length));
  const branchWidth = width(
    "branch",
    rows.map((row) => row.branch),
  );
  const baseWidth = width(
    "base",
    rows.map((row) => row.base),
  );
  const dirtyWidth = width(
    "dirty",
    rows.map((row) => row.dirty),
  );
  const sessionsWidth = width(
    "sessions",
    rows.map((row) => row.sessions),
  );

  return [
    "[WORKTREES]",
    `  ${"branch".padEnd(branchWidth)}  ${"base".padEnd(baseWidth)}  ${"dirty".padEnd(
      dirtyWidth,
    )}  ${"sessions".padEnd(sessionsWidth)}  path`,
    ...rows.map(
      (row) =>
        `  ${row.branch.padEnd(branchWidth)}  ${row.base.padEnd(baseWidth)}  ${row.dirty.padEnd(
          dirtyWidth,
        )}  ${row.sessions.padEnd(sessionsWidth)}  ${row.path}`,
    ),
  ].join("\n");
}
