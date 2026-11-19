/**
 * Cross-worktree disk report and build-artifact cleanup.
 *
 * Why this exists: `clean-target.ps1` only knows the current worktree, and agents
 * otherwise hand-roll recursive `Get-ChildItem` scans over 100k+ files per slot.
 *
 * Usage (from the repo root or `adlo/`):
 *   pnpm run worktree:disk                              # report all worktrees
 *   pnpm run worktree:disk -- --current                 # only this worktree
 *   pnpm run worktree:disk -- --clean                   # delete target/ + node_modules/
 *   pnpm run worktree:disk -- --clean --keep-node-modules
 *   pnpm run worktree:disk -- --clean --dry-run
 *   pnpm run worktree:disk -- --clean --include-instance-state
 *
 * Dev instance state (`<adlo>/.adl-instance/`) is preserved by default. A legacy
 * `target/adl-instance/` is migrated there before `target/` is removed.
 *
 * Implementation note: `describeWorktree` is the only recursive scan; cleaning
 * reuses its sizes so a `--clean` run walks each tree once.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findLockedDevExecutables } from "./dev-instance.mjs";
import { INSTANCE_STATE_DIRNAME } from "./instance-id.mjs";
import { listWorktrees } from "./worktree-registry.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes) {
  let value = Number(bytes) || 0;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${BYTE_UNITS[unit]}`;
}

export function parseArgs(argv) {
  const options = {
    current: false,
    clean: false,
    dryRun: false,
    keepNodeModules: false,
    includeInstanceState: false,
    force: false,
    help: false,
  };
  for (const arg of argv) {
    if (arg === "--current") {
      options.current = true;
    } else if (arg === "--clean") {
      options.clean = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--keep-node-modules") {
      options.keepNodeModules = true;
    } else if (arg === "--include-instance-state") {
      options.includeInstanceState = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return options;
}

/** Size of a directory tree in bytes/files. Symlinks are not followed. */
export function directorySize(dir) {
  let bytes = 0;
  let files = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        try {
          bytes += fs.statSync(full).size;
          files += 1;
        } catch {
          // File raced with cleanup; ignore.
        }
      }
    }
  }
  return { bytes, files };
}

/** Remove a tree, retrying through the Windows long-path prefix when needed. */
export function removePath(target) {
  if (!fs.existsSync(target)) {
    return false;
  }
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 2 });
    return true;
  } catch (error) {
    if (process.platform !== "win32") {
      throw error;
    }
    const long = `\\\\?\\${path.resolve(target).replaceAll("/", "\\")}`;
    fs.rmSync(long, { recursive: true, force: true, maxRetries: 2 });
    return true;
  }
}

function git(args, cwd) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return result.status === 0 ? (result.stdout ?? "").trim() : "";
}

function freeBytes(dir) {
  try {
    if (typeof fs.statfsSync !== "function") {
      return null;
    }
    const stats = fs.statfsSync(dir);
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
}

function describeWorktree(worktreePath) {
  const adlo = path.join(worktreePath, "adlo");
  const target = path.join(adlo, "target");
  const parts = {};
  let targetBytes = 0;
  let targetFiles = 0;
  if (fs.existsSync(target)) {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const size = directorySize(path.join(target, entry.name));
      parts[entry.name] = size;
      targetBytes += size.bytes;
      targetFiles += size.files;
    }
  }
  return {
    path: worktreePath,
    branch: git(["branch", "--show-current"], worktreePath) || "(detached)",
    dirty: git(["status", "--porcelain"], worktreePath).split(/\r?\n/).filter(Boolean).length,
    target: { bytes: targetBytes, files: targetFiles, parts },
    legacyState: parts["adl-instance"] ?? { bytes: 0, files: 0 },
    state: fs.existsSync(path.join(adlo, INSTANCE_STATE_DIRNAME))
      ? directorySize(path.join(adlo, INSTANCE_STATE_DIRNAME))
      : { bytes: 0, files: 0 },
    nodeModules: fs.existsSync(path.join(adlo, "node_modules"))
      ? directorySize(path.join(adlo, "node_modules"))
      : { bytes: 0, files: 0 },
  };
}

function migrateLegacyState(adlo, target) {
  const legacy = path.join(target, "adl-instance");
  const state = path.join(adlo, INSTANCE_STATE_DIRNAME);
  if (!fs.existsSync(legacy) || fs.existsSync(state)) {
    return false;
  }
  fs.renameSync(legacy, state);
  return true;
}

function cleanWorktree(worktreePath, options) {
  const adlo = path.join(worktreePath, "adlo");
  const target = path.join(adlo, "target");
  const nodeModules = path.join(adlo, "node_modules");
  const state = path.join(adlo, INSTANCE_STATE_DIRNAME);
  const label = path.basename(worktreePath);

  const locked = findLockedDevExecutables(adlo);
  if (locked.length > 0 && !options.force) {
    console.log(`[worktree:disk] SKIP ${label}: dev image locked (${locked.join(", ")})`);
    console.log("[worktree:disk]   run `pnpm --dir adlo run dev:stop` first, or pass --force");
    return { skipped: true };
  }

  const info = describeWorktree(worktreePath);
  const plan = [];
  if (fs.existsSync(target)) {
    plan.push(`target (${formatBytes(info.target.bytes)})`);
  }
  if (!options.keepNodeModules && fs.existsSync(nodeModules)) {
    plan.push(`node_modules (${formatBytes(info.nodeModules.bytes)})`);
  }
  if (options.includeInstanceState && fs.existsSync(state)) {
    plan.push(`${INSTANCE_STATE_DIRNAME} (${formatBytes(info.state.bytes)})`);
  }

  if (plan.length === 0) {
    console.log(`[worktree:disk] ${label}: nothing to clean`);
    return { skipped: false };
  }
  if (options.dryRun) {
    console.log(`[worktree:disk] DRY-RUN ${label}: would delete ${plan.join(", ")}`);
    return { skipped: false };
  }

  try {
    if (!options.includeInstanceState && migrateLegacyState(adlo, target)) {
      console.log(`[worktree:disk] ${label}: migrated legacy target/adl-instance -> .adl-instance`);
    }
    removePath(target);
    if (!options.keepNodeModules) {
      removePath(nodeModules);
    }
    if (options.includeInstanceState) {
      removePath(state);
    }
  } catch (error) {
    console.error(`[worktree:disk] FAILED ${label}: ${error.message}`);
    return { skipped: true };
  }

  console.log(`[worktree:disk] cleaned ${label}: ${plan.join(", ")}`);
  return { skipped: false };
}

function printUsage() {
  console.log(
    [
      "Usage: pnpm run worktree:disk -- [options]",
      "",
      "  (no flags)                report every worktree",
      "  --current                 only the worktree containing the current directory",
      "  --clean                   delete target/ + node_modules/ (dry-run with --dry-run)",
      "  --keep-node-modules       keep node_modules when cleaning",
      "  --include-instance-state  also delete .adl-instance (dev DB + WebView profile)",
      "  --force                   clean even when a dev image is locked",
    ].join("\n"),
  );
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[worktree:disk] ${error.message}`);
    printUsage();
    process.exit(2);
  }
  if (options.help) {
    printUsage();
    return;
  }

  const toplevel = git(["rev-parse", "--show-toplevel"], repoRoot);
  if (!toplevel) {
    console.error("[worktree:disk] not inside a git worktree");
    process.exit(1);
  }

  const worktrees = options.current
    ? [{ path: toplevel, branch: null, head: null, detached: false }]
    : listWorktrees(toplevel);

  if (!options.clean) {
    const free = freeBytes(toplevel);
    if (free !== null) {
      console.log(`[worktree:disk] free ${formatBytes(free)}`);
    }
    const rows = worktrees.map((worktree) => {
      const info = describeWorktree(worktree.path);
      return {
        branch: info.branch,
        dirty: String(info.dirty),
        target: formatBytes(info.target.bytes),
        debug: formatBytes(info.target.parts.debug?.bytes ?? 0),
        release: formatBytes(info.target.parts.release?.bytes ?? 0),
        legacyState: formatBytes(info.legacyState.bytes),
        state: formatBytes(info.state.bytes),
        nodeModules: formatBytes(info.nodeModules.bytes),
        path: info.path,
      };
    });
    const width = (header, values) =>
      Math.max(header.length, ...values.map((value) => String(value).length));
    const branchWidth = width(
      "branch",
      rows.map((row) => row.branch),
    );
    const dirtyWidth = width(
      "dirty",
      rows.map((row) => row.dirty),
    );
    const targetWidth = width(
      "target",
      rows.map((row) => row.target),
    );
    const debugWidth = width(
      "debug",
      rows.map((row) => row.debug),
    );
    const releaseWidth = width(
      "release",
      rows.map((row) => row.release),
    );
    const legacyWidth = width(
      "legacy",
      rows.map((row) => row.legacyState),
    );
    const stateWidth = width(
      "state",
      rows.map((row) => row.state),
    );
    const modulesWidth = width(
      "modules",
      rows.map((row) => row.nodeModules),
    );

    console.log(
      `  ${"branch".padEnd(branchWidth)}  ${"dirty".padEnd(dirtyWidth)}  ${"target".padEnd(
        targetWidth,
      )}  ${"debug".padEnd(debugWidth)}  ${"release".padEnd(releaseWidth)}  ${"legacy".padEnd(
        legacyWidth,
      )}  ${"state".padEnd(stateWidth)}  ${"modules".padEnd(modulesWidth)}  path`,
    );
    for (const row of rows) {
      console.log(
        `  ${row.branch.padEnd(branchWidth)}  ${row.dirty.padEnd(dirtyWidth)}  ${row.target.padEnd(
          targetWidth,
        )}  ${row.debug.padEnd(debugWidth)}  ${row.release.padEnd(
          releaseWidth,
        )}  ${row.legacyState.padEnd(legacyWidth)}  ${row.state.padEnd(
          stateWidth,
        )}  ${row.nodeModules.padEnd(modulesWidth)}  ${row.path}`,
      );
    }
    return;
  }

  const failures = worktrees.filter((worktree) => cleanWorktree(worktree.path, options).skipped);
  if (failures.length > 0) {
    process.exit(1);
  }
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) {
  main();
}
