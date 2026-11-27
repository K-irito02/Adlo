import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  archiveLocalPackage,
  backupExistingArtifacts,
  planArchivePath,
  summarizePackage,
} from "./release/local-package.mjs";

function write(path, content) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

test("plans a version and commit specific archive path", () => {
  assert.equal(
    planArchivePath({ archiveRoot: "E:/Adlo-builds", version: "0.1.0", sha: "abc1234" }),
    join("E:/Adlo-builds", "v0.1.0-pre-abc1234"),
  );
  assert.throws(
    () => planArchivePath({ archiveRoot: "E:/Adlo-builds", version: "0.1", sha: "abc1234" }),
    /invalid version/,
  );
});

test("backs up old bundle and local staging artifacts without overwriting", () => {
  const root = mkdtempSync(join(tmpdir(), "adl-local-backup-"));
  try {
    const bundle = join(root, "adlo/target/release/bundle/nsis");
    const local = join(root, ".release/local/v0.1.0");
    write(join(bundle, "Adlo_0.1.0_x64-setup.exe"), "old-exe");
    write(join(bundle, "Adlo_0.1.0_x64-setup.exe.sig"), "old-sig");
    write(join(local, "SHA256SUMS.txt"), "old-sums");

    const result = backupExistingArtifacts({
      repoRoot: root,
      version: "0.1.0",
      timestamp: "stamp",
    });
    assert.equal(result.backupRoot, join(root, ".release/backups/stamp"));
    assert.deepEqual(result.moved, [
      join(bundle, "Adlo_0.1.0_x64-setup.exe"),
      join(bundle, "Adlo_0.1.0_x64-setup.exe.sig"),
      local,
    ]);
    assert.equal(existsSync(join(bundle, "Adlo_0.1.0_x64-setup.exe")), false);
    assert.equal(existsSync(local), false);
    assert.equal(
      readFileSync(join(result.backupRoot, "Adlo_0.1.0_x64-setup.exe"), "utf8"),
      "old-exe",
    );
    assert.equal(
      readFileSync(join(result.backupRoot, "local-v0.1.0/SHA256SUMS.txt"), "utf8"),
      "old-sums",
    );
    assert.throws(
      () => backupExistingArtifacts({ repoRoot: root, version: "0.1.0", timestamp: "stamp" }),
      /backup already exists/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("archives exactly installer, signature and checksum", () => {
  const root = mkdtempSync(join(tmpdir(), "adl-local-archive-"));
  try {
    const local = join(root, "local");
    const archiveRoot = join(root, "builds");
    const files = ["Adlo_0.1.0_x64-setup.exe", "Adlo_0.1.0_x64-setup.exe.sig", "SHA256SUMS.txt"];
    for (const file of files) write(join(local, file), `new-${file}`);

    const result = archiveLocalPackage({
      localDir: local,
      archiveRoot,
      version: "0.1.0",
      sha: "abc1234",
    });
    assert.equal(result.archiveDir, join(archiveRoot, "v0.1.0-pre-abc1234"));
    assert.deepEqual(result.files, files);
    for (const file of files) {
      assert.equal(readFileSync(join(result.archiveDir, file), "utf8"), `new-${file}`);
    }
    assert.throws(
      () => archiveLocalPackage({ localDir: local, archiveRoot, version: "0.1.0", sha: "abc1234" }),
      /archive already exists/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses to archive an incomplete local package", () => {
  const root = mkdtempSync(join(tmpdir(), "adl-local-incomplete-"));
  try {
    const local = join(root, "local");
    write(join(local, "Adlo_0.1.0_x64-setup.exe"), "exe");
    assert.throws(
      () =>
        archiveLocalPackage({
          localDir: local,
          archiveRoot: join(root, "builds"),
          version: "0.1.0",
          sha: "abc1234",
        }),
      /missing local artifact/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("summarizes package metadata without secret fields", () => {
  const summary = summarizePackage({
    version: "0.1.0",
    sha: "abc1234",
    archiveDir: "E:/Adlo-builds/v0.1.0-pre-abc1234",
    sha256: "digest",
    signatureOk: true,
  });
  assert.deepEqual(summary, {
    version: "0.1.0",
    commit: "abc1234",
    archiveDir: "E:/Adlo-builds/v0.1.0-pre-abc1234",
    sha256: "digest",
    signatureOk: true,
    published: false,
  });
  assert.equal(JSON.stringify(summary).includes("TAURI_SIGNING"), false);
});
