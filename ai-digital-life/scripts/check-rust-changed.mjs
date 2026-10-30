/**
 * 推送前的 Rust 门禁（affected scope）。
 *
 * `quality-gates.md` 要求 fmt/clippy，但此前只有需要人工批准的 `check:all` 才会跑，
 * 默认 pre-push 只跑前端 `check:changed` —— 未格式化的 Rust 可以一路推上去
 * （2026-10-30 实测：两个提交带着 `cargo fmt` 差异）。本脚本补上这一腿：
 *
 * - `cargo fmt --all -- --check`：永远执行（秒级）；
 * - 仅当本次推送涉及 Rust 源码/构建配置时执行 `cargo clippy --workspace --all-targets -- -D warnings`
 *   （增量、缓存友好；全工作区口径与 `check:all` 一致）。
 *
 * 用法：node scripts/check-rust-changed.mjs [--base <ref>] [--all] [--skip-fmt]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const implRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";

/** 该路径变更是否需要跑 Rust lint。 */
export function isRustPath(file) {
  if (!file.startsWith("ai-digital-life/")) {
    return false;
  }
  return (
    file.includes("/crates/") ||
    file.startsWith("ai-digital-life/src-tauri/") ||
    file === "ai-digital-life/Cargo.toml" ||
    file === "ai-digital-life/Cargo.lock" ||
    file === "ai-digital-life/rustfmt.toml" ||
    file === "ai-digital-life/clippy.toml" ||
    file === "ai-digital-life/.cargo/config.toml"
  );
}

/** 从变更路径提取受影响的 crate 目录（`crates/<dir>` 或 `src-tauri`）。 */
export function affectedCrateDirs(files) {
  const dirs = new Set();
  for (const file of files) {
    const match = /^ai-digital-life\/(crates\/[^/]+|src-tauri)\//.exec(file);
    if (match) {
      dirs.add(match[1]);
    }
  }
  return [...dirs];
}

/** 读取 `<dir>/Cargo.toml` 的包名（供 `cargo clippy -p` 使用）。 */
export function packageNameOf(dir) {
  const manifest = path.join(implRoot, dir, "Cargo.toml");
  const text = fs.readFileSync(manifest, "utf8");
  const match = /^\s*name\s*=\s*"([^"]+)"/m.exec(text);
  if (!match) {
    throw new Error(`cannot read package name from ${manifest}`);
  }
  return match[1];
}

export function parseArgs(argv) {
  const options = { base: null, all: false, skipFmt: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--all") {
      options.all = true;
    } else if (arg === "--skip-fmt") {
      options.skipFmt = true;
    } else if (arg === "--base") {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error("missing value for --base");
      }
      options.base = value;
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function git(args, { optional = false } = {}) {
  const result = spawnSync("git", args, { cwd: implRoot, encoding: "utf8" });
  if (result.status !== 0) {
    if (optional) {
      return null;
    }
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || "").trim()}`);
  }
  return (result.stdout || "").trim();
}

function resolveBase(explicit) {
  if (explicit) {
    git(["rev-parse", "--verify", explicit]);
    return explicit;
  }
  const upstream = git(["rev-parse", "--verify", "@{u}"], { optional: true });
  if (upstream) {
    return upstream;
  }
  const originMain = git(["rev-parse", "--verify", "origin/main"], { optional: true });
  if (originMain) {
    return originMain;
  }
  const parent = git(["rev-parse", "--verify", "HEAD~1"], { optional: true });
  return parent ?? "HEAD";
}

function run(command, args, label) {
  console.log(`[check-rust] ${label}`);
  const result = spawnSync(command, args, { cwd: implRoot, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`[check-rust] FAILED: ${label}`);
    process.exit(result.status ?? 1);
  }
}

const WORKSPACE_LEVEL_FILES = new Set([
  "ai-digital-life/Cargo.toml",
  "ai-digital-life/Cargo.lock",
  "ai-digital-life/rustfmt.toml",
  "ai-digital-life/clippy.toml",
  "ai-digital-life/.cargo/config.toml",
]);

export function clippyArgs(files) {
  const workspaceLevel = files.some((file) => WORKSPACE_LEVEL_FILES.has(file));
  const dirs = affectedCrateDirs(files);
  const shellChanged = dirs.includes("src-tauri");
  const args = ["clippy"];
  if (workspaceLevel || dirs.length === 0) {
    args.push("--workspace");
    // 未改壳层时排除 shell：tauri-build 会在构建脚本里复制 sidecar，运行中的桌面实例
    // 会锁住 target/debug/adl-server.exe，导致 clippy 误报 PermissionDenied。
    if (!shellChanged) {
      args.push("--exclude", "ai-digital-life");
    }
  } else {
    for (const pkg of dirs.map(packageNameOf)) {
      args.push("-p", pkg);
    }
  }
  args.push("--all-targets", "--", "-D", "warnings");
  return args;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[check-rust] ${error.message}`);
    process.exit(1);
  }
  if (options.help) {
    console.log("usage: node scripts/check-rust-changed.mjs [--base <ref>] [--all] [--skip-fmt]");
    return;
  }

  const base = resolveBase(options.base);
  const files = git(["diff", "--name-only", `${base}..HEAD`])
    .split(/\r?\n/)
    .filter(Boolean);
  const rustFiles = files.filter(isRustPath);
  console.log(`[check-rust] base=${base} changed=${files.length} rust=${rustFiles.length > 0}`);

  if (!options.skipFmt) {
    run(cargo, ["fmt", "--all", "--", "--check"], "cargo fmt --all -- --check");
  }
  if (options.all || rustFiles.length > 0) {
    const args = clippyArgs(rustFiles);
    // 运行中的桌面实例会锁住 target/debug/adl-server.exe（tauri-build 在
    // src-tauri 构建脚本里复制 sidecar 时删除旧文件失败），给出可操作提示。
    if (args.includes("--workspace") || args.includes("ai-digital-life")) {
      console.warn(
        "[check-rust] note: a running desktop instance locks target/debug/adl-server.exe; close it if clippy fails with PermissionDenied.",
      );
    }
    run(cargo, args, `cargo ${args.join(" ")}`);
  } else {
    console.log("[check-rust] clippy skipped (no Rust changes in this push)");
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isMain) {
  main();
}
