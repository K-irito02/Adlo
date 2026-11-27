import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function inspectVersions(root) {
  const files = {
    tauri: join(root, "adlo/src-tauri/tauri.conf.json"),
    adlo: join(root, "adlo/package.json"),
    frontend: join(root, "adlo/frontend/package.json"),
  };
  const versions = {};
  const errors = [];
  for (const [name, path] of Object.entries(files)) {
    try {
      versions[name] = readJson(path).version;
      if (typeof versions[name] !== "string") {
        errors.push(`${name} version missing`);
      }
    } catch (error) {
      errors.push(`${name} version unreadable: ${error.message}`);
    }
  }
  const values = Object.values(versions).filter(Boolean);
  if (errors.length === 0 && new Set(values).size !== 1) {
    errors.push("version mismatch across tauri.conf / package.json files");
  }
  return { ok: errors.length === 0, versions, errors };
}

export function resolveSigningConfig(env, userProfile) {
  const profile = env.USERPROFILE ?? userProfile;
  const defaultKey = profile ? join(profile, ".tauri", "adlo.key") : null;
  let keyConfigured = false;
  let keySource = "missing";
  if (env.TAURI_SIGNING_PRIVATE_KEY) {
    keyConfigured = true;
    keySource = "content";
  } else if (env.TAURI_SIGNING_PRIVATE_KEY_PATH) {
    keyConfigured = existsSync(env.TAURI_SIGNING_PRIVATE_KEY_PATH);
    keySource = keyConfigured ? "explicit-path" : "missing";
  } else if (defaultKey && existsSync(defaultKey)) {
    keyConfigured = true;
    keySource = "default-path";
  }
  return {
    keyConfigured,
    passwordConfigured: Boolean(env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD),
    keySource,
  };
}

export function collectPreflight({ versions, signing, git, disk, archive }) {
  const blockers = [];
  const warnings = [];
  if (!versions.ok) blockers.push(`version check failed: ${versions.errors.join("; ")}`);
  if (!signing.keyConfigured) blockers.push("signing private key is not configured");
  if (!signing.passwordConfigured) blockers.push("signing password is not configured");
  if (!git.branch || git.branch === "HEAD") blockers.push("Git branch is detached or missing");
  if (git.dirty) blockers.push("working tree is dirty");
  if (!git.remotes?.origin) blockers.push("missing origin remote");
  if (!git.remotes?.gitee) blockers.push("missing gitee remote");
  if (disk.freeBytes < disk.minBytes) {
    blockers.push(`disk free ${disk.freeBytes} bytes is below required ${disk.minBytes}`);
  }
  if (archive.exists) blockers.push("archive target already exists");
  if (archive.oldArtifacts > 0) {
    warnings.push(`${archive.oldArtifacts} old artifact(s) will be backed up before local build`);
  }
  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    versions,
    signing,
    git,
    disk,
    archive,
  };
}

export function resolveArchiveRoot(env) {
  return env.ADLO_BUILD_ARCHIVE_ROOT || resolve("E:/AI-DIGITAL-LIFE/Adlo-builds");
}
