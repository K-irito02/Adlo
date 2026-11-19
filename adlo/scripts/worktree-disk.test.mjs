import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { directorySize, formatBytes, parseArgs, removePath } from "./worktree-disk.mjs";

test("formatBytes picks a readable unit", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(1.25 * 1024 ** 3), "1.3 GB");
});

test("parseArgs defaults to a read-only report over all worktrees", () => {
  assert.deepEqual(parseArgs([]), {
    current: false,
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
