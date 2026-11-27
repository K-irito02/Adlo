import { copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const VERSION_RE = /^\d+\.\d+\.\d+$/;
const SHA_RE = /^[0-9a-f]{7,40}$/i;

export function planArchivePath({ archiveRoot, version, sha }) {
  if (!VERSION_RE.test(version)) throw new Error(`invalid version: ${version}`);
  if (!SHA_RE.test(sha)) throw new Error(`invalid commit sha: ${sha}`);
  return join(archiveRoot, `v${version}-pre-${sha}`);
}

export function backupExistingArtifacts({ repoRoot, version, timestamp }) {
  if (!VERSION_RE.test(version)) throw new Error(`invalid version: ${version}`);
  if (!/^[a-zA-Z0-9._-]+$/.test(timestamp)) throw new Error(`invalid timestamp: ${timestamp}`);
  const backupRoot = join(repoRoot, ".release", "backups", timestamp);
  if (existsSync(backupRoot)) {
    throw new Error(`backup already exists: ${backupRoot}`);
  }
  const bundleDir = join(repoRoot, "adlo", "target", "release", "bundle", "nsis");
  const localDir = join(repoRoot, ".release", "local", `v${version}`);
  const candidates = [
    join(bundleDir, `Adlo_${version}_x64-setup.exe`),
    join(bundleDir, `Adlo_${version}_x64-setup.exe.sig`),
    localDir,
  ];
  const moved = candidates.filter((path) => existsSync(path));
  if (moved.length === 0) return { backupRoot, moved };

  mkdirSync(backupRoot, { recursive: true });
  for (const source of moved) {
    const target = join(
      backupRoot,
      source === localDir ? `local-v${version}` : source.split(/[\\/]/).at(-1),
    );
    renameSync(source, target);
  }
  return { backupRoot, moved };
}

export function publishArchive(tempDir, archiveDir) {
  if (existsSync(archiveDir)) {
    throw new Error(`archive already exists: ${archiveDir}`);
  }
  try {
    renameSync(tempDir, archiveDir);
  } catch (error) {
    if (existsSync(archiveDir)) {
      throw new Error(`archive already exists: ${archiveDir}`);
    }
    throw error;
  }
}

export function archiveLocalPackage({ localDir, archiveRoot, version, sha }) {
  const archiveDir = planArchivePath({ archiveRoot, version, sha });
  const files = [
    `Adlo_${version}_x64-setup.exe`,
    `Adlo_${version}_x64-setup.exe.sig`,
    "SHA256SUMS.txt",
  ];
  for (const file of files) {
    if (!existsSync(join(localDir, file))) {
      throw new Error(`missing local artifact: ${join(localDir, file)}`);
    }
  }
  mkdirSync(dirname(archiveDir), { recursive: true });
  const tempDir = mkdtempSync(join(dirname(archiveDir), `.${basename(archiveDir)}.tmp-`));
  try {
    for (const file of files) {
      copyFileSync(join(localDir, file), join(tempDir, file));
    }
    publishArchive(tempDir, archiveDir);
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
  return { archiveDir, files };
}

export function summarizePackage({ version, sha, archiveDir, sha256, signatureOk }) {
  return {
    version,
    commit: sha,
    archiveDir,
    sha256,
    signatureOk,
    published: false,
  };
}
