import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { collectPreflight, inspectVersions, resolveSigningConfig } from "./release/preflight.mjs";

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

test("inspects all three application versions and rejects drift", () => {
  const root = mkdtempSync(join(tmpdir(), "adl-preflight-versions-"));
  try {
    write(join(root, "adlo/src-tauri/tauri.conf.json"), JSON.stringify({ version: "0.1.0" }));
    write(join(root, "adlo/package.json"), JSON.stringify({ version: "0.1.0" }));
    write(join(root, "adlo/frontend/package.json"), JSON.stringify({ version: "0.1.0" }));
    assert.deepEqual(inspectVersions(root), {
      ok: true,
      versions: { tauri: "0.1.0", adlo: "0.1.0", frontend: "0.1.0" },
      errors: [],
    });

    write(join(root, "adlo/frontend/package.json"), JSON.stringify({ version: "0.1.1" }));
    const drifted = inspectVersions(root);
    assert.equal(drifted.ok, false);
    assert.ok(drifted.errors.some((error) => error.includes("version mismatch")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports signing configuration as booleans without exposing secrets", () => {
  const root = mkdtempSync(join(tmpdir(), "adl-preflight-signing-"));
  try {
    const keyPath = join(root, ".tauri/adlo.key");
    write(keyPath, "PRIVATE_KEY_CONTENT");
    const configured = resolveSigningConfig(
      { USERPROFILE: root, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "PASSWORD_VALUE" },
      root,
    );
    assert.equal(configured.keyConfigured, true);
    assert.equal(configured.passwordConfigured, true);
    assert.equal(configured.keyPath, keyPath);
    assert.equal(JSON.stringify(configured).includes("PRIVATE_KEY_CONTENT"), false);
    assert.equal(JSON.stringify(configured).includes("PASSWORD_VALUE"), false);

    const missing = resolveSigningConfig({ USERPROFILE: root }, root);
    assert.equal(missing.keyConfigured, true);
    assert.equal(missing.passwordConfigured, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const cleanInput = () => ({
  versions: {
    ok: true,
    versions: { tauri: "0.1.0", adlo: "0.1.0", frontend: "0.1.0" },
    errors: [],
  },
  signing: { keyConfigured: true, passwordConfigured: true, keyPath: "key" },
  git: {
    branch: "main",
    head: "abc1234",
    dirty: false,
    remotes: { origin: "github", gitee: "gitee" },
  },
  disk: { freeBytes: 50_000_000_000, minBytes: 25_000_000_000 },
  archive: { exists: false, oldArtifacts: 2 },
});

test("collects a clean preflight with old artifacts as warnings", () => {
  const result = collectPreflight(cleanInput());
  assert.equal(result.ok, true);
  assert.deepEqual(result.blockers, []);
  assert.ok(result.warnings.some((warning) => warning.includes("old artifact")));
});

test("blocks dirty trees, missing signatures, low disk, archive collisions and missing remotes", () => {
  const input = cleanInput();
  input.git.dirty = true;
  input.git.remotes.gitee = null;
  input.signing.passwordConfigured = false;
  input.disk.freeBytes = 1_000_000_000;
  input.archive.exists = true;
  const result = collectPreflight(input);
  assert.equal(result.ok, false);
  for (const fragment of ["dirty", "password", "disk", "archive", "gitee"]) {
    assert.ok(
      result.blockers.some((blocker) => blocker.includes(fragment)),
      fragment,
    );
  }
});
