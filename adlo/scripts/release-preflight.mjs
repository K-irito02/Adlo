#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, statfsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { planArchivePath } from "./release/local-package.mjs";
import {
  collectPreflight,
  inspectVersions,
  resolveArchiveRoot,
  resolveSigningConfig,
} from "./release/preflight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ADLO_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(ADLO_ROOT, "..");

function git(args) {
  const result = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function userEnvironment(name) {
  if (process.env[name]) return process.env[name];
  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", `[Environment]::GetEnvironmentVariable('${name}','User')`],
    { encoding: "utf8" },
  );
  return result.status === 0 ? result.stdout.replace(/\r?\n$/, "") : "";
}

function inspectGit() {
  const branch = git(["branch", "--show-current"]);
  const head = git(["rev-parse", "--short", "HEAD"]);
  const dirty = Boolean(git(["status", "--porcelain"]));
  const remotes = {
    origin: git(["remote", "get-url", "origin"]),
    gitee: git(["remote", "get-url", "gitee"]),
  };
  return { branch, head, dirty, remotes };
}

function inspectDisk() {
  const stats = statfsSync(REPO_ROOT);
  const freeBytes = Number(stats.bavail) * Number(stats.bsize);
  const minBytes = Number(process.env.ADL_MIN_FREE_BYTES ?? 25_000_000_000);
  return { freeBytes, minBytes };
}

function inspectArchive(version, sha) {
  const bundle = join(ADLO_ROOT, "target", "release", "bundle", "nsis");
  const local = join(REPO_ROOT, ".release", "local", `v${version}`);
  const oldArtifacts = [
    join(bundle, `Adlo_${version}_x64-setup.exe`),
    join(bundle, `Adlo_${version}_x64-setup.exe.sig`),
    local,
  ].filter((path) => existsSync(path)).length;
  if (!version || !sha) return { exists: false, oldArtifacts, archiveDir: null };
  const archiveDir = planArchivePath({
    archiveRoot: resolveArchiveRoot(process.env),
    version,
    sha,
  });
  return { exists: existsSync(archiveDir), oldArtifacts, archiveDir };
}

function main() {
  const versions = inspectVersions(REPO_ROOT);
  const signing = resolveSigningConfig(
    {
      ...process.env,
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: userEnvironment("TAURI_SIGNING_PRIVATE_KEY_PASSWORD"),
    },
    process.env.USERPROFILE,
  );
  const gitState = inspectGit();
  const disk = inspectDisk();
  const archive = inspectArchive(versions.versions.tauri, gitState.head);
  const report = collectPreflight({ versions, signing, git: gitState, disk, archive });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`[release-preflight] ${error.message}`);
    process.exit(1);
  }
}
