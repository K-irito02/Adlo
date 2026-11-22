/**
 * Shared git-worktree / session-registry helpers for cross-worktree tooling:
 * `worktree:env --all`, `worktree:disk`, `worktree:sessions`.
 *
 * The registry lives outside the repo at `<worktree-pool>/.sessions/*.json`
 * (see the parallel-branch-development skill §6).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * 依赖是否落后于锁文件：pnpm 在 `node_modules/.pnpm/lock.yaml` 留一份安装时的
 * 锁快照，与仓库根 `pnpm-lock.yaml` 逐字节比较。返回 `ok|stale|missing`。
 */
export function depsState(worktreePath) {
  const targets = [worktreePath, path.join(worktreePath, "adlo")];
  let missing = false;
  let stale = false;
  for (const dir of targets) {
    const lock = path.join(dir, "pnpm-lock.yaml");
    if (!fs.existsSync(lock)) {
      continue;
    }
    const installed = path.join(dir, "node_modules", ".pnpm", "lock.yaml");
    if (!fs.existsSync(installed)) {
      missing = true;
      continue;
    }
    if (!fs.readFileSync(lock).equals(fs.readFileSync(installed))) {
      stale = true;
    }
  }
  return missing ? "missing" : stale ? "stale" : "ok";
}

/** Run `git worktree list --porcelain` and return parsed entries. */
export function listWorktrees(cwd) {
  const result = spawnSync("git", ["-C", cwd, "worktree", "list", "--porcelain"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return [];
  }
  return parseWorktreePorcelain(result.stdout ?? "");
}

/** Pure parser for `git worktree list --porcelain` output. */
export function parseWorktreePorcelain(text) {
  const entries = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      if (current) {
        entries.push(current);
      }
      current = {
        path: line.slice("worktree ".length),
        branch: null,
        head: null,
        detached: false,
      };
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith("branch refs/heads/")) {
      current.branch = line.slice("branch refs/heads/".length);
      continue;
    }
    if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length, "HEAD ".length + 7);
      continue;
    }
    if (line === "detached") {
      current.detached = true;
    }
  }
  if (current) {
    entries.push(current);
  }
  return entries;
}

export function sessionsDirFor(worktreePath) {
  const resolved = path.resolve(worktreePath);
  const parent = path.dirname(resolved);
  // Slot worktrees live under `<root>-worktrees/<name>`; the main worktree
  // shares the same registry at `<root>-worktrees/.sessions`.
  if (/-worktrees$/i.test(path.basename(parent))) {
    return path.join(parent, ".sessions");
  }
  const siblingPool = `${resolved}-worktrees`;
  if (fs.existsSync(siblingPool)) {
    return path.join(siblingPool, ".sessions");
  }
  // Arbitrary/test worktrees keep the historical parent `.sessions` layout.
  return path.join(parent, ".sessions");
}

/**
 * Active registry entries that claim this worktree.
 * `stale` mirrors the skill's 24h rule (file mtime, not `startedAt`).
 */
export function readActiveSessions(worktreePath, now = Date.now()) {
  const dir = sessionsDirFor(worktreePath);
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const target = path.resolve(worktreePath).toLowerCase();
  const active = [];
  for (const name of names) {
    if (!name.endsWith(".json")) {
      continue;
    }
    const file = path.join(dir, name);
    let record;
    try {
      record = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (record.status !== "active" || typeof record.worktree !== "string") {
      continue;
    }
    if (path.resolve(record.worktree).toLowerCase() !== target) {
      continue;
    }
    let ageMs = 0;
    try {
      ageMs = Math.max(0, now - fs.statSync(file).mtimeMs);
    } catch {
      ageMs = 0;
    }
    active.push({ file, name, record, ageMs, stale: ageMs > STALE_AFTER_MS });
  }
  return active;
}

export function formatAge(ms) {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) {
    return "just now";
  }
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.floor(hours / 24)}d`;
}

/** One-line summary for the `[ENV] others` field / worktree table. */
export function summarizeSessions(sessions) {
  if (sessions.length === 0) {
    return "—";
  }
  const staleAges = sessions.filter((session) => session.stale).map((session) => session.ageMs);
  const suffix = staleAges.length > 0 ? `, ${formatAge(Math.max(...staleAges))} stale` : "";
  return `${sessions.length} active${suffix}`;
}

export { STALE_AFTER_MS };
