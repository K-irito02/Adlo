import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { BASE_IDENTIFIER, isInstanceLocatorPath, resolveInstance } from "./instance-id.mjs";

const MAIN_ROOT = path.resolve("E:/AI-DIGITAL-LIFE/SourceWorkspace/adlo");
const SLOT_ROOT = path.resolve("E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1/adlo");

function expectedStateDir(repoRoot) {
  return path.join(repoRoot, ".adl-instance");
}

function expectedLocator(repoRoot) {
  return path.join(repoRoot, ".adl-instance", "storage-locator.json");
}

test("main worktree keeps the plain identifier and no locator override", () => {
  assert.deepEqual(resolveInstance({ repoRoot: MAIN_ROOT, env: {} }), {
    suffix: null,
    identifier: BASE_IDENTIFIER,
    stateDir: null,
    locatorPath: null,
  });
});

test("slot worktree derives identifier and locator from the slot directory", () => {
  assert.deepEqual(resolveInstance({ repoRoot: SLOT_ROOT, env: {} }), {
    suffix: "slot-1",
    identifier: `${BASE_IDENTIFIER}.slot-1`,
    stateDir: expectedStateDir(SLOT_ROOT),
    locatorPath: expectedLocator(SLOT_ROOT),
  });
});

test("branch-named worktree directory is used verbatim when already kebab-case", () => {
  const repoRoot = path.resolve(
    "E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/settings-panel-fix/adlo",
  );
  const instance = resolveInstance({ repoRoot, env: {} });
  assert.equal(instance.suffix, "settings-panel-fix");
  assert.equal(instance.identifier, `${BASE_IDENTIFIER}.settings-panel-fix`);
});

test("worktrees parent match is case-insensitive", () => {
  const repoRoot = path.resolve("E:/AI-DIGITAL-LIFE/SourceWorkspace-WORKTREES/slot-2/adlo");
  assert.equal(resolveInstance({ repoRoot, env: {} }).suffix, "slot-2");
});

test("a sibling directory that is not a worktree is not isolated", () => {
  const repoRoot = path.resolve("E:/AI-DIGITAL-LIFE/OtherCopy/adlo");
  assert.equal(resolveInstance({ repoRoot, env: {} }).suffix, null);
});

test("directory names are sanitized to [a-z0-9-]", () => {
  const repoRoot = path.resolve("E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/Slot_1 Beta/adlo");
  assert.equal(resolveInstance({ repoRoot, env: {} }).suffix, "slot-1-beta");
});

test("ADL_INSTANCE_ID overrides the directory-derived suffix", () => {
  const instance = resolveInstance({ repoRoot: SLOT_ROOT, env: { ADL_INSTANCE_ID: "alpha" } });
  assert.equal(instance.suffix, "alpha");
  assert.equal(instance.identifier, `${BASE_IDENTIFIER}.alpha`);
});

test("ADL_INSTANCE_ID isolates the main worktree too", () => {
  const instance = resolveInstance({
    repoRoot: MAIN_ROOT,
    env: { ADL_INSTANCE_ID: "Alpha Beta!" },
  });
  assert.equal(instance.suffix, "alpha-beta");
  assert.equal(instance.identifier, `${BASE_IDENTIFIER}.alpha-beta`);
  assert.equal(instance.locatorPath, expectedLocator(MAIN_ROOT));
});

test("blank ADL_INSTANCE_ID is ignored", () => {
  assert.equal(
    resolveInstance({ repoRoot: MAIN_ROOT, env: { ADL_INSTANCE_ID: "   " } }).suffix,
    null,
  );
});

test("trailing separators in repoRoot do not change the result", () => {
  assert.deepEqual(
    resolveInstance({ repoRoot: `${SLOT_ROOT}${path.sep}`, env: {} }),
    resolveInstance({ repoRoot: SLOT_ROOT, env: {} }),
  );
});

test("a multi-segment ADL_INSTANCE_ID is joined into one suffix", () => {
  assert.equal(
    resolveInstance({ repoRoot: MAIN_ROOT, env: { ADL_INSTANCE_ID: "team/alpha" } }).suffix,
    "team-alpha",
  );
});

test("isInstanceLocatorPath matches the current and legacy dev-managed locations", () => {
  assert.equal(isInstanceLocatorPath("E:/x/adlo/.adl-instance/storage-locator.json"), true);
  assert.equal(isInstanceLocatorPath("E:\\x\\adlo\\.adl-instance\\storage-locator.json"), true);
  assert.equal(isInstanceLocatorPath("E:/x/adlo/target/adl-instance/storage-locator.json"), true);
  assert.equal(
    isInstanceLocatorPath("C:/Users/me/AppData/Roaming/adlo/storage-locator.json"),
    false,
  );
  assert.equal(isInstanceLocatorPath(""), false);
  assert.equal(isInstanceLocatorPath(undefined), false);
});

test("worktree dev state lives outside target so cargo clean cannot wipe it", () => {
  const { stateDir } = resolveInstance({ repoRoot: SLOT_ROOT, env: {} });
  assert.equal(stateDir.includes(`${path.sep}target${path.sep}`), false);
});
