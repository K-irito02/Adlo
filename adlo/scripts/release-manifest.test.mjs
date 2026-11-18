import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildManifest,
  defaultTestNotes,
  downloadUrl,
  isVersion,
  sha256Line,
  setupFileName,
} from "./release/manifest.mjs";

test("isVersion accepts plain and prerelease semver", () => {
  assert.equal(isVersion("0.1.1"), true);
  assert.equal(isVersion("1.2.3-beta.1"), true);
  assert.equal(isVersion("v0.1.1"), false);
  assert.equal(isVersion("0.1"), false);
});

test("downloadUrl points at the right host and tag", () => {
  assert.equal(
    downloadUrl("gitee", "0.1.1", setupFileName("0.1.1")),
    "https://gitee.com/K_irito/Adlo/releases/download/v0.1.1/Adlo_0.1.1_x64-setup.exe",
  );
  assert.equal(
    downloadUrl("github", "0.1.1", setupFileName("0.1.1")),
    "https://github.com/K-irito02/Adlo/releases/download/v0.1.1/Adlo_0.1.1_x64-setup.exe",
  );
});

test("buildManifest emits the tauri static manifest shape", () => {
  const manifest = buildManifest({
    version: "0.1.1",
    notes: "test",
    pubDate: "2026-11-18T08:00:00.000Z",
    url: "https://example.com/a.exe",
    signature: "sig",
  });
  assert.deepEqual(manifest, {
    version: "0.1.1",
    notes: "test",
    pub_date: "2026-11-18T08:00:00Z",
    platforms: {
      "windows-x86_64": { url: "https://example.com/a.exe", signature: "sig" },
    },
  });
});

test("buildManifest rejects missing signature and non-https url", () => {
  assert.throws(
    () =>
      buildManifest({
        version: "0.1.1",
        url: "https://example.com/a.exe",
        signature: "",
      }),
    /signature/,
  );
  assert.throws(
    () =>
      buildManifest({
        version: "0.1.1",
        url: "http://example.com/a.exe",
        signature: "sig",
      }),
    /https/,
  );
});

test("sha256Line rejects malformed digests", () => {
  assert.equal(sha256Line("a.exe", "a".repeat(64)), `${"a".repeat(64)}  a.exe`);
  assert.throws(() => sha256Line("a.exe", "abc"), /invalid sha256/);
});

test("defaultTestNotes marks the build as a test release", () => {
  const notes = defaultTestNotes("0.1.1");
  assert.match(notes, /测试版本/);
  assert.match(notes, /非正式发布/);
});
