import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  formatAge,
  parseWorktreePorcelain,
  readActiveSessions,
  summarizeSessions,
} from "./worktree-registry.mjs";

const PORCELAIN = [
  "worktree E:/wt/SourceWorkspace",
  "HEAD 1234567890abcdef",
  "branch refs/heads/main",
  "",
  "worktree E:/wt/SourceWorkspace-worktrees/slot-1",
  "HEAD abcdef1234567890",
  "branch refs/heads/slot-1",
  "",
  "worktree E:/wt/detached",
  "HEAD fedcba9876543210",
  "detached",
  "",
].join("\n");

test("parseWorktreePorcelain keeps path, branch, short head and detached flag", () => {
  const entries = parseWorktreePorcelain(PORCELAIN);
  assert.equal(entries.length, 3);
  assert.deepEqual(entries[0], {
    path: "E:/wt/SourceWorkspace",
    branch: "main",
    head: "1234567",
    detached: false,
  });
  assert.equal(entries[1].branch, "slot-1");
  assert.equal(entries[2].branch, null);
  assert.equal(entries[2].detached, true);
});

test("summarizeSessions reports none and stale counts", () => {
  assert.equal(summarizeSessions([]), "—");
  assert.equal(
    summarizeSessions([
      { stale: false, ageMs: 1000 },
      { stale: true, ageMs: 2 * 24 * 60 * 60 * 1000 },
    ]),
    "2 active, 2d stale",
  );
});

test("formatAge switches from hours to days", () => {
  assert.equal(formatAge(30 * 60 * 1000), "just now");
  assert.equal(formatAge(5 * 60 * 60 * 1000), "5h");
  assert.equal(formatAge(3 * 24 * 60 * 60 * 1000), "3d");
});

test("readActiveSessions only returns active entries claiming this worktree", () => {
  const pool = fs.mkdtempSync(path.join(os.tmpdir(), "adl-registry-"));
  try {
    const worktree = path.join(pool, "slot-1");
    const sessions = path.join(pool, ".sessions");
    fs.mkdirSync(worktree, { recursive: true });
    fs.mkdirSync(sessions, { recursive: true });

    const activeFile = path.join(sessions, "active.json");
    fs.writeFileSync(
      activeFile,
      JSON.stringify({
        session: "active",
        status: "active",
        worktree: worktree.replaceAll("\\", "/"),
      }),
      "utf8",
    );
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    fs.utimesSync(activeFile, old, old);

    fs.writeFileSync(
      path.join(sessions, "done.json"),
      JSON.stringify({ session: "done", status: "done", worktree }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessions, "other.json"),
      JSON.stringify({ session: "other", status: "active", worktree: path.join(pool, "slot-2") }),
      "utf8",
    );

    const active = readActiveSessions(worktree);
    assert.equal(active.length, 1);
    assert.equal(active[0].record.session, "active");
    assert.equal(active[0].stale, true);
  } finally {
    fs.rmSync(pool, { recursive: true, force: true });
  }
});
