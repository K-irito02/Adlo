#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  archiveLocalPackage,
  backupExistingArtifacts,
  summarizePackage,
} from "./release/local-package.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ADLO_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(ADLO_ROOT, "..");

function fail(message) {
  console.error(`[release-local] ${message}`);
  process.exit(1);
}

function git(args) {
  const result = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    fail(`git ${args.join(" ")} failed: ${(result.stderr ?? "").trim()}`);
  }
  return result.stdout.trim();
}

function readVersion() {
  const conf = JSON.parse(readFileSync(join(ADLO_ROOT, "src-tauri", "tauri.conf.json"), "utf8"));
  if (!/^\d+\.\d+\.\d+$/.test(conf.version)) {
    fail(`tauri.conf.json has an invalid version: ${conf.version}`);
  }
  return conf.version;
}

function runNodeScript(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ADLO_ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    fail(`${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "");
}

function main() {
  const version = readVersion();
  const dirty = git(["status", "--porcelain"]);
  if (dirty) {
    fail("working tree is dirty; commit the exact state before building a local package");
  }
  const sha = git(["rev-parse", "--short", "HEAD"]);
  const backup = backupExistingArtifacts({ repoRoot: REPO_ROOT, version, timestamp: timestamp() });
  if (backup.moved.length > 0) {
    console.log(
      `[release-local] backed up ${backup.moved.length} old artifact(s) to ${backup.backupRoot}`,
    );
  }

  runNodeScript(["scripts/release.mjs", "build", "--local"]);
  runNodeScript(["scripts/verify-local-signature.mjs", version]);

  const localDir = join(REPO_ROOT, ".release", "local", `v${version}`);
  const setupPath = join(localDir, `Adlo_${version}_x64-setup.exe`);
  const archiveRoot = process.env.ADLO_BUILD_ARCHIVE_ROOT ?? "E:/AI-DIGITAL-LIFE/Adlo-builds";
  const archived = archiveLocalPackage({ localDir, archiveRoot, version, sha });
  const summary = summarizePackage({
    version,
    sha,
    archiveDir: archived.archiveDir,
    sha256: sha256File(setupPath),
    signatureOk: true,
  });
  console.log(JSON.stringify(summary, null, 2));
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    main();
  } catch (error) {
    fail(error.message);
  }
}
