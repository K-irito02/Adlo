/**
 * 推送前的 Rust 门禁（affected scope）。
 *
 * `quality-gates.md` 要求 fmt/clippy，但此前只有需要人工批准的 `check:all` 才会跑，
 * 默认 pre-push 只跑前端 `check:changed` —— 未格式化的 Rust 可以一路推上去
 * （2026-10-30 实测：两个提交带着 `cargo fmt` 差异）。本脚本补上这一腿：
 *
 * - `cargo fmt --all -- --check`：永远执行（秒级）；
 * - 仅当本次推送涉及 Rust 源码/构建配置时执行 clippy（受影响 crate 口径，
 *   未改壳层时 `--workspace --exclude adlo`；与 `check:all` 的全工作区口径
 *   只在「有壳层改动」时才一致）；
 * - 含壳层改动时先调 `scripts/build-stage-sidecar.ps1 -Profile debug` 生成
 *   `src-tauri/binaries/adl-server-<triple>.exe`（重副作用：会写构建产物；该脚本仅 Windows）。
 *
 * 用法：node scripts/check-rust-changed.mjs [--base <ref>] [--all] [--skip-fmt]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { findLockedDevExecutables, devStopHint } from "./dev-instance.mjs";

const implRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
let verbose = false;

// pre-push 钩子会注入 GIT_DIR / GIT_WORK_TREE 等相对路径变量；从
// `adlo/` 子目录调用 git 时它们会解析失败（ls-files 直接报错）。
// 与 check-changed / check-source-hygiene 保持同一清理口径。
const cleanGitEnv = { ...process.env };
for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"]) {
  delete cleanGitEnv[key];
}

/** 该路径变更是否需要跑 Rust lint。 */
export function isRustPath(file) {
  if (!file.startsWith("adlo/")) {
    return false;
  }
  return (
    file.includes("/crates/") ||
    file.startsWith("adlo/src-tauri/") ||
    file === "adlo/Cargo.toml" ||
    file === "adlo/Cargo.lock" ||
    file === "adlo/rustfmt.toml" ||
    file === "adlo/clippy.toml" ||
    file === "adlo/.cargo/config.toml"
  );
}

/** 从变更路径提取受影响的 crate 目录（`crates/<dir>` 或 `src-tauri`）。 */
export function affectedCrateDirs(files) {
  const dirs = new Set();
  for (const file of files) {
    const match = /^adlo\/(crates\/[^/]+|src-tauri)\//.exec(file);
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
  const options = {
    base: null,
    all: false,
    skipFmt: false,
    skipTest: false,
    verbose: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--all") {
      options.all = true;
    } else if (arg === "--skip-fmt") {
      options.skipFmt = true;
    } else if (arg === "--skip-test") {
      options.skipTest = true;
    } else if (arg === "--verbose") {
      options.verbose = true;
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
  const result = spawnSync("git", args, { cwd: implRoot, encoding: "utf8", env: cleanGitEnv });
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

function tailOutput(text, maxLines = 120) {
  const lines = text.trimEnd().split(/\r?\n/);
  if (lines.length <= maxLines) {
    return text.trimEnd();
  }
  return `… (${lines.length - maxLines} lines omitted)\n${lines.slice(-maxLines).join("\n")}`;
}

function run(command, args, label) {
  console.log(`[check-rust] ${label}`);
  if (verbose) {
    const result = spawnSync(command, args, { cwd: implRoot, stdio: "inherit" });
    if (result.status !== 0) {
      console.error(`[check-rust] FAILED: ${label}`);
      process.exit(result.status ?? 1);
    }
    return;
  }
  const result = spawnSync(command, args, {
    cwd: implRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    console.error(tailOutput(`${result.stdout ?? ""}${result.stderr ?? ""}`));
    console.error(`[check-rust] FAILED: ${label} (rerun with --verbose for full output)`);
    process.exit(result.status ?? 1);
  }
  console.log(`[check-rust] ok: ${label}`);
}

const WORKSPACE_LEVEL_FILES = new Set([
  "adlo/Cargo.toml",
  "adlo/Cargo.lock",
  "adlo/rustfmt.toml",
  "adlo/clippy.toml",
  "adlo/.cargo/config.toml",
]);

/**
 * pre-push 是否需要先 stage sidecar：仅当 clippy 会编译壳层（`src-tauri`）时。
 * 从受影响 crate 直接判定，避免从 argv 反推（`--exclude adlo` 的值
 * 也会被 `args.includes('adlo')` 命中）。
 */
export function shouldStageSidecar(files) {
  return affectedCrateDirs(files).includes("src-tauri");
}

export function clippyArgs(files) {
  const workspaceLevel = files.some((file) => WORKSPACE_LEVEL_FILES.has(file));
  const dirs = affectedCrateDirs(files);
  const shellChanged = shouldStageSidecar(files);
  const args = ["clippy"];
  if (workspaceLevel || dirs.length === 0) {
    args.push("--workspace");
    // 未改壳层时排除 shell：tauri-build 会在构建脚本里复制 sidecar，运行中的桌面实例
    // 会锁住 target/debug/adl-server.exe，导致 clippy 误报 PermissionDenied。
    if (!shellChanged) {
      args.push("--exclude", "adlo");
    }
  } else {
    for (const pkg of dirs.map(packageNameOf)) {
      args.push("-p", pkg);
    }
  }
  args.push("--all-targets", "--", "-D", "warnings");
  return args;
}

/**
 * 受影响 crate 的单元测试命令（可能多条）。
 *
 * - 工作区级变更 / 无法定位 crate：`--workspace --lib`（保持快、稳）；
 * - 只影响普通 crate：`-p <pkg...> --lib`；
 * - 影响外壳 crate（`src-tauri`，**bin-only，无 lib.rs**）：单独 `-p adlo --bins`，
 *   否则 `-p adlo --lib` 会直接以 "no library targets found" 失败（本仓实测）。
 *
 * 变更的集成测试目前仍由开发者按需 `cargo test -p <crate> --tests` 覆盖。
 */
export function testCommands(files) {
  const workspaceLevel = files.some((file) => WORKSPACE_LEVEL_FILES.has(file));
  const dirs = affectedCrateDirs(files);
  const shellChanged = shouldStageSidecar(files);
  if (workspaceLevel) {
    const args = ["test", "--workspace"];
    if (!shellChanged) {
      args.push("--exclude", "adlo");
    }
    args.push("--lib");
    return [args];
  }
  if (dirs.length === 0) {
    return [["test", "--workspace", "--exclude", "adlo", "--lib"]];
  }
  const commands = [];
  const crateDirs = dirs.filter((dir) => dir !== "src-tauri");
  if (crateDirs.length > 0) {
    commands.push(["test", ...crateDirs.flatMap((dir) => ["-p", packageNameOf(dir)]), "--lib"]);
  }
  if (dirs.includes("src-tauri")) {
    commands.push(["test", "-p", "adlo", "--bins"]);
  }
  return commands;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[check-rust] ${error.message}`);
    process.exit(1);
  }
  verbose = options.verbose;
  if (options.help) {
    console.log(
      "usage: node scripts/check-rust-changed.mjs [--base <ref>] [--all] [--skip-fmt] [--skip-test] [--verbose]",
    );
    return;
  }

  const base = resolveBase(options.base);
  // 用 `git diff <base>`（工作树 vs base）而不是 `<base>..HEAD`：
  // 否则未提交的 Rust 改动会被漏掉，日常 `check:changed` 里形同虚设。
  const tracked = git(["diff", "--name-only", base]).split(/\r?\n/);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/);
  const files = [...new Set([...tracked, ...untracked])].filter(Boolean);
  const rustFiles = files.filter(isRustPath);
  console.log(`[check-rust] base=${base} changed=${files.length} rust=${rustFiles.length > 0}`);

  if (!options.skipFmt) {
    run(cargo, ["fmt", "--all", "--", "--check"], "cargo fmt --all -- --check");
  }
  if (options.all || rustFiles.length > 0) {
    const args = clippyArgs(rustFiles);
    // 含壳层时先 stage sidecar：`src-tauri` 的 build script 会校验
    // `bundle.externalBin`（`src-tauri/binaries/adl-server-<triple>.exe`），
    // 干净工作树直接 clippy 会以「resource path ... doesn't exist」失败。
    // 与 `pnpm run cargo:build/check/clippy/test` 的前置步骤保持一致（pre-push 也不能漏）。
    // 判定直接来自受影响 crate（不要从 argv 反推：`--exclude adlo` 的值
    // 同样会被 `args.includes('adlo')` 命中）。
    const compilesShell = shouldStageSidecar(rustFiles);
    if (compilesShell && process.platform !== "win32") {
      console.error(
        "[check-rust] 含 src-tauri 改动：externalBin 校验依赖 Windows staging 脚本（scripts/build-stage-sidecar.ps1），" +
          "当前平台无法自动完成。请在 Windows 环境执行该推送，或在 Windows 上先跑 `pnpm run cargo:check` 再推送。",
      );
      process.exit(1);
    }
    if (compilesShell) {
      // 运行中的桌面实例会锁住 target/debug 下的 exe（app 与 adl-server），
      // 让 staging / clippy 在构建到一半时才以 PermissionDenied 失败。先探测并
      // 给出可执行的停止命令，避免把环境问题误判成代码问题。
      const locked = findLockedDevExecutables(implRoot);
      if (locked.length > 0) {
        console.error("[check-rust] 本工作树的桌面实例正在运行，构建产物被占用：");
        for (const file of locked) {
          console.error(`  - ${file}`);
        }
        console.error(`[check-rust] ${devStopHint()}。`);
        process.exit(1);
      }
      // 参数与 package.json#stage:sidecar 保持一致（-Profile debug）。
      run(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(implRoot, "scripts", "build-stage-sidecar.ps1"),
          "-Profile",
          "debug",
        ],
        "stage sidecar (shell build)",
      );
    }
    run(cargo, args, `cargo ${args.join(" ")}`);
    if (!options.skipTest) {
      for (const test of testCommands(rustFiles)) {
        run(cargo, test, `cargo ${test.join(" ")}`);
      }
    }
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
