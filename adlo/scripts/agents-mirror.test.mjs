import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, syncDirectory } from "./agents-mirror.mjs";

function tempDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adl-agents-mirror-"));
  const source = path.join(root, "source");
  const mirror = path.join(root, "mirror");
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(mirror, { recursive: true });
  return { root, source, mirror };
}

test("syncDirectory reports drift without writing in check mode", () => {
  const { root, source, mirror } = tempDirs();
  try {
    fs.writeFileSync(path.join(source, "a.md"), "canonical\n");
    fs.writeFileSync(path.join(mirror, "a.md"), "stale\n");
    fs.writeFileSync(path.join(mirror, "extra.md"), "old\n");

    const drifted = syncDirectory(source, mirror, { check: true });
    assert.deepEqual(drifted, ["a.md", "extra.md"]);
    assert.equal(fs.readFileSync(path.join(mirror, "a.md"), "utf8"), "stale\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("syncDirectory copies changed files and prunes mirror-only files", () => {
  const { root, source, mirror } = tempDirs();
  try {
    fs.mkdirSync(path.join(source, "nested"), { recursive: true });
    fs.writeFileSync(path.join(source, "a.md"), "canonical\n");
    fs.writeFileSync(path.join(source, "nested", "b.md"), "b\n");
    fs.writeFileSync(path.join(mirror, "extra.md"), "old\n");

    const drifted = syncDirectory(source, mirror, { prune: true });
    assert.deepEqual(drifted, ["a.md", "nested/b.md", "extra.md"]);
    assert.equal(fs.readFileSync(path.join(mirror, "a.md"), "utf8"), "canonical\n");
    assert.equal(fs.readFileSync(path.join(mirror, "nested", "b.md"), "utf8"), "b\n");
    assert.equal(fs.existsSync(path.join(mirror, "extra.md")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("parseArgs only accepts check/prune/help", () => {
  assert.deepEqual(parseArgs(["--check"]), { check: true, prune: false, help: false });
  assert.throws(() => parseArgs(["--nope"]), /unknown argument/);
});
