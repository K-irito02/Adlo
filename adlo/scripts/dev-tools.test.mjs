import assert from "node:assert/strict";
import test from "node:test";
import {
  isDocsArtifact,
  parseArgs as parseReviewArgs,
  safeSnapshotName,
} from "./review-snapshot.mjs";
import {
  affectedCrateDirs,
  clippyArgs,
  isRustPath,
  parseArgs as parseRustArgs,
  shouldStageSidecar,
  testCommands,
} from "./check-rust-changed.mjs";
import { parseArgs as parseServeArgs } from "./serve-adl-server.mjs";
import { isCrashWithoutOutput } from "./e2e-typecheck.mjs";

test("safeSnapshotName keeps paths readable but filesystem-safe", () => {
  assert.equal(safeSnapshotName("adlo/frontend/src/a.ts"), "adlo_frontend_src_a.ts");
  assert.equal(safeSnapshotName("docs/a:b*c?.md"), "docs_a_b_c_.md");
  assert.equal(safeSnapshotName("C:\\x\\y.rs"), "C__x_y.rs");
});

test("review-snapshot parses base/out/rev and rejects invalid rev", () => {
  assert.deepEqual(parseReviewArgs([]), {
    base: null,
    out: ".review-diffs",
    rev: 1,
    help: false,
    allowUntracked: false,
    allowUnowned: false,
    allowClaims: false,
    excludeGenerated: false,
    includeDocs: false,
    progress: null,
    scopes: null,
  });
  assert.deepEqual(parseReviewArgs(["--base", "origin/main", "--out", ".diffs", "--rev", "3"]), {
    base: "origin/main",
    out: ".diffs",
    rev: 3,
    help: false,
    allowUntracked: false,
    allowUnowned: false,
    allowClaims: false,
    excludeGenerated: false,
    includeDocs: false,
    progress: null,
    scopes: null,
  });
  assert.deepEqual(parseReviewArgs(["--rev", "2", "--progress", "docs/p.md"]), {
    base: null,
    out: ".review-diffs",
    rev: 2,
    help: false,
    allowUntracked: false,
    allowUnowned: false,
    allowClaims: false,
    excludeGenerated: false,
    includeDocs: false,
    progress: "docs/p.md",
    scopes: null,
  });
  assert.equal(parseReviewArgs(["--include-docs"]).includeDocs, true);
  assert.throws(() => parseReviewArgs(["--rev", "0"]), /positive integer/);
  assert.throws(() => parseReviewArgs(["--nope"]), /unknown argument/);
});

test("review-snapshot excludes docs by default but keeps code and config", () => {
  for (const file of [
    "docs/design-system/a.md",
    "docs/root-cause-to-close/2026-11/progress-x.md",
    ".agents/rules/dev-rules.md",
    ".opencode/skills/x/SKILL.md",
    ".trae/rules/codebase-map.md",
    "GLOSSARY.md",
    "AGENTS.md",
    "CONTEXT.md",
    "adlo/README.md",
  ]) {
    assert.equal(isDocsArtifact(file), true, file);
  }
  for (const file of [
    "adlo/frontend/src/a.ts",
    "adlo/crates/workspace/src/fs.rs",
    "adlo/frontend/src/styles/a.css",
    "adlo/package.json",
  ]) {
    assert.equal(isDocsArtifact(file), false, file);
  }
});

test("check-rust identifies Rust paths only", () => {
  for (const file of [
    "adlo/crates/download-source/src/lib.rs",
    "adlo/src-tauri/src/main.rs",
    "adlo/Cargo.toml",
    "adlo/Cargo.lock",
    "adlo/rustfmt.toml",
    "adlo/clippy.toml",
    "adlo/.cargo/config.toml",
  ]) {
    assert.equal(isRustPath(file), true, file);
  }
  for (const file of [
    "adlo/frontend/src/app/App.tsx",
    "adlo/scripts/dev-port.mjs",
    "docs/architecture/x.md",
    "GLOSSARY.md",
  ]) {
    assert.equal(isRustPath(file), false, file);
  }
});

test("affectedCrateDirs extracts only crate directories", () => {
  assert.deepEqual(
    affectedCrateDirs([
      "adlo/crates/download-source/src/lib.rs",
      "adlo/frontend/src/app/App.tsx",
      "adlo/Cargo.lock",
    ]),
    ["crates/download-source"],
  );
  assert.deepEqual(
    affectedCrateDirs(["adlo/src-tauri/src/main.rs", "adlo/src-tauri/tauri.conf.json"]),
    ["src-tauri"],
  );
  assert.deepEqual(affectedCrateDirs(["adlo/Cargo.toml"]), []);
});

test("clippyArgs scopes to changed crates and excludes the shell when it did not change", () => {
  assert.deepEqual(clippyArgs(["adlo/crates/download-source/src/lib.rs"]), [
    "clippy",
    "-p",
    "adl-download-source",
    "--all-targets",
    "--",
    "-D",
    "warnings",
  ]);
  assert.deepEqual(clippyArgs(["adlo/Cargo.lock"]), [
    "clippy",
    "--workspace",
    "--exclude",
    "adlo",
    "--all-targets",
    "--",
    "-D",
    "warnings",
  ]);
  assert.deepEqual(clippyArgs(["adlo/src-tauri/src/main.rs"]), [
    "clippy",
    "-p",
    "adlo",
    "--all-targets",
    "--",
    "-D",
    "warnings",
  ]);
});

test("shouldStageSidecar only when clippy compiles the shell", () => {
  // 壳层文件变更 → 需要 staging。
  assert.equal(shouldStageSidecar(["adlo/src-tauri/src/main.rs"]), true);
  // 工作区级文件 + 壳层同时变更 → 需要 staging。
  assert.equal(shouldStageSidecar(["adlo/Cargo.lock", "adlo/src-tauri/tauri.conf.json"]), true);
  // 只改 crates/** → 不需要（clippy 只 -p 该 crate）。
  assert.equal(shouldStageSidecar(["adlo/crates/download-source/src/lib.rs"]), false);
  // 只改工作区文件 → clippy 走 --workspace --exclude adlo，不编译壳层。
  assert.equal(shouldStageSidecar(["adlo/Cargo.lock"]), false);
  assert.equal(shouldStageSidecar([]), false);
});

test("check-rust parses --all/--skip-fmt/--skip-test/--base/--verbose", () => {
  assert.deepEqual(parseRustArgs([]), {
    base: null,
    all: false,
    skipFmt: false,
    skipTest: false,
    verbose: false,
    help: false,
  });
  assert.deepEqual(
    parseRustArgs(["--all", "--skip-fmt", "--skip-test", "--base", "HEAD~2", "--verbose"]),
    {
      base: "HEAD~2",
      all: true,
      skipFmt: true,
      skipTest: true,
      verbose: true,
      help: false,
    },
  );
  assert.throws(() => parseRustArgs(["--base"]), /missing value/);
});

test("check-rust scopes affected-crate unit tests", () => {
  assert.deepEqual(testCommands(["adlo/crates/download-source/src/lib.rs"]), [
    ["test", "-p", "adl-download-source", "--lib"],
  ]);
  assert.deepEqual(testCommands(["adlo/Cargo.lock"]), [
    ["test", "--workspace", "--exclude", "adlo", "--lib"],
  ]);
  // 工作区级变更 + 壳层改动：`--workspace --lib` 会静默跳过 bin-only 的 adlo，
  // 必须补一条 `--bins`，否则壳层单测在推送门禁里漏跑。
  assert.deepEqual(testCommands(["adlo/Cargo.lock", "adlo/src-tauri/src/commands/browser.rs"]), [
    ["test", "--workspace", "--lib"],
    ["test", "-p", "adlo", "--bins"],
  ]);
  // 外壳 crate 是 bin-only：`-p adlo --lib` 会报 no library targets，必须跑 bins。
  assert.deepEqual(testCommands(["adlo/src-tauri/src/commands/browser.rs"]), [
    ["test", "-p", "adlo", "--bins"],
  ]);
  // 混合受影响：普通 crate 跑 lib，外壳单独跑 bins（两条命令）。
  assert.deepEqual(
    testCommands([
      "adlo/src-tauri/src/commands/browser.rs",
      "adlo/crates/download-source/src/lib.rs",
    ]),
    [
      ["test", "-p", "adl-download-source", "--lib"],
      ["test", "-p", "adlo", "--bins"],
    ],
  );
});

test("e2e typecheck wrapper only retries crashes without output", () => {
  // 真实类型错误一定带诊断输出 → 不重试、原样失败。
  assert.equal(isCrashWithoutOutput(0, ""), false);
  assert.equal(isCrashWithoutOutput(1, "src/x.ts(1,1): error TS2322: bad type"), false);
  // 进程级崩溃的特征：非零退出 + 完全无输出。
  assert.equal(isCrashWithoutOutput(3221226505, ""), true);
  assert.equal(isCrashWithoutOutput(1, "  \n"), true);
});

test("serve-adl-server parses flags and validates the port", () => {
  assert.deepEqual(parseServeArgs([]), {
    noBuild: false,
    dataDir: null,
    port: 0,
    keep: false,
    help: false,
  });
  assert.deepEqual(parseServeArgs(["--no-build", "--keep", "--port", "5173", "--data-dir", "x"]), {
    noBuild: true,
    dataDir: "x",
    port: 5173,
    keep: true,
    help: false,
  });
  assert.throws(() => parseServeArgs(["--port", "70000"]), /between 0 and 65535/);
  assert.throws(() => parseServeArgs(["--data-dir"]), /missing value/);
});
