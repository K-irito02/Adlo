import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  cleanLogPath,
  directorySize,
  formatBytes,
  formatDelta,
  parseArgs,
  readLastCleanEvent,
  recordCleanEvent,
  removePath,
  selectWorktrees,
} from "./worktree-disk.mjs";

test("formatBytes picks a readable unit", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(1.25 * 1024 ** 3), "1.3 GB");
});

test("formatDelta signs reclaimed space", () => {
  assert.equal(formatDelta(1024 ** 3), "+1.0 GB");
  assert.equal(formatDelta(-512 * 1024 ** 2), "-512 MB");
  assert.equal(formatDelta(0), "0 B");
});

test("parseArgs defaults to a read-only report over all worktrees", () => {
  assert.deepEqual(parseArgs([]), {
    current: false,
    only: [],
    clean: false,
    dryRun: false,
    keepNodeModules: false,
    includeInstanceState: false,
    force: false,
    help: false,
  });
  assert.equal(parseArgs(["--clean", "--keep-node-modules"]).keepNodeModules, true);
  assert.throws(() => parseArgs(["--nope"]), /unknown option/);
});

test("parseArgs collects --only selectors and rejects the --current mix", () => {
  assert.deepEqual(parseArgs(["--only", "main,slot-1"]).only, ["main", "slot-1"]);
  assert.deepEqual(parseArgs(["--only", "main", "--only", "slot-2"]).only, ["main", "slot-2"]);
  assert.deepEqual(parseArgs(["--only", "main, main"]).only, ["main"]);
  // pnpm 会把 `a,b,c` 转发成单个含空格的参数；空格分隔必须等价于逗号分隔。
  assert.deepEqual(parseArgs(["--only", "main slot-1 slot-2"]).only, ["main", "slot-1", "slot-2"]);
  assert.deepEqual(parseArgs(["--only", " main,\tslot-1\nslot-2 "]).only, [
    "main",
    "slot-1",
    "slot-2",
  ]);
  assert.throws(() => parseArgs(["--only"]), /--only needs a value/);
  assert.throws(() => parseArgs(["--only", "--clean"]), /--only needs a value/);
  assert.throws(() => parseArgs(["--only", "main", "--current"]), /exclusive/);
});

test("selectWorktrees picks by branch, directory name, or path", () => {
  const trees = [
    { path: "E:/ws", branch: "main" },
    { path: "E:/ws-worktrees/slot-1", branch: "slot-1" },
    { path: "E:/ws-worktrees/slot-2", branch: "slot-2" },
  ];
  assert.deepEqual(selectWorktrees(trees, []), trees);
  assert.deepEqual(
    selectWorktrees(trees, ["main", "slot-1"]).map((tree) => tree.branch),
    ["main", "slot-1"],
  );
  assert.deepEqual(
    selectWorktrees(trees, ["slot-2"]).map((tree) => tree.branch),
    ["slot-2"],
  );
  assert.deepEqual(
    selectWorktrees(trees, ["E:/ws-worktrees/slot-2"]).map((tree) => tree.branch),
    ["slot-2"],
  );
  assert.deepEqual(
    selectWorktrees(trees, ["slot-2", "main"]).map((tree) => tree.branch),
    ["main", "slot-2"],
  );
  assert.throws(
    () => selectWorktrees(trees, ["nope"]),
    /unknown worktree selector: nope \(available: main, slot-1, slot-2\)/,
  );
});

test("directorySize sums nested files without following symlinks", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adl-disk-"));
  try {
    fs.mkdirSync(path.join(root, "nested"), { recursive: true });
    fs.writeFileSync(path.join(root, "a.txt"), "abc");
    fs.writeFileSync(path.join(root, "nested", "b.txt"), "de");
    assert.deepEqual(directorySize(root), { bytes: 5, files: 2 });
    assert.deepEqual(directorySize(path.join(root, "missing")), { bytes: 0, files: 0 });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("removePath removes a tree and reports whether it existed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adl-rm-"));
  const victim = path.join(root, "target");
  fs.mkdirSync(victim);
  fs.writeFileSync(path.join(victim, "x"), "x");
  assert.equal(removePath(victim), true);
  assert.equal(fs.existsSync(victim), false);
  assert.equal(removePath(victim), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("clean events append in order and the latest one reads back", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adl-cleanlog-"));
  try {
    assert.equal(readLastCleanEvent(root), null);
    recordCleanEvent(root, { at: "2026-11-25T00:00:00.000Z", tree: "main", plannedBytes: 10 });
    recordCleanEvent(root, { at: "2026-11-25T01:00:00.000Z", tree: "slot-1", plannedBytes: 20 });
    const log = cleanLogPath(path.join(root, "adlo"));
    assert.equal(fs.readFileSync(log, "utf8").trim().split("\n").length, 2);
    assert.equal(readLastCleanEvent(root).tree, "slot-1");
    assert.equal(readLastCleanEvent(root).plannedBytes, 20);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("clean log survives a corrupted last line", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adl-cleanlog-"));
  try {
    recordCleanEvent(root, { at: "2026-11-25T00:00:00.000Z", tree: "main" });
    fs.appendFileSync(cleanLogPath(path.join(root, "adlo")), "{not json\n", "utf8");
    assert.equal(readLastCleanEvent(root), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
