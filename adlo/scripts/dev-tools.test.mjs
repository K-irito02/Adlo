import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs as parseReviewArgs, safeSnapshotName } from "./review-snapshot.mjs";
import {
  affectedCrateDirs,
  clippyArgs,
  isRustPath,
  parseArgs as parseRustArgs,
  shouldStageSidecar,
  testArgs,
} from "./check-rust-changed.mjs";
import { parseArgs as parseServeArgs } from "./serve-adl-server.mjs";

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
    allowClaims: false,
  });
  assert.deepEqual(parseReviewArgs(["--base", "origin/main", "--out", ".diffs", "--rev", "3"]), {
    base: "origin/main",
    out: ".diffs",
    rev: 3,
    help: false,
    allowUntracked: false,
    allowClaims: false,
  });
  assert.throws(() => parseReviewArgs(["--rev", "0"]), /positive integer/);
  assert.throws(() => parseReviewArgs(["--nope"]), /unknown argument/);
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
  assert.deepEqual(testArgs(["adlo/crates/download-source/src/lib.rs"]), [
    "test",
    "-p",
    "adl-download-source",
    "--lib",
  ]);
  assert.deepEqual(testArgs(["adlo/Cargo.lock"]), [
    "test",
    "--workspace",
    "--exclude",
    "adlo",
    "--lib",
  ]);
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
