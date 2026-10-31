import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs as parseReviewArgs, safeSnapshotName } from "./review-snapshot.mjs";
import {
  affectedCrateDirs,
  clippyArgs,
  isRustPath,
  parseArgs as parseRustArgs,
  shouldStageSidecar,
} from "./check-rust-changed.mjs";
import { parseArgs as parseServeArgs } from "./serve-adl-server.mjs";

test("safeSnapshotName keeps paths readable but filesystem-safe", () => {
  assert.equal(
    safeSnapshotName("ai-digital-life/frontend/src/a.ts"),
    "ai-digital-life_frontend_src_a.ts",
  );
  assert.equal(safeSnapshotName("docs/a:b*c?.md"), "docs_a_b_c_.md");
  assert.equal(safeSnapshotName("C:\\x\\y.rs"), "C__x_y.rs");
});

test("review-snapshot parses base/out/rev and rejects invalid rev", () => {
  assert.deepEqual(parseReviewArgs([]), { base: null, out: ".review-diffs", rev: 1, help: false });
  assert.deepEqual(parseReviewArgs(["--base", "origin/main", "--out", ".diffs", "--rev", "3"]), {
    base: "origin/main",
    out: ".diffs",
    rev: 3,
    help: false,
  });
  assert.throws(() => parseReviewArgs(["--rev", "0"]), /positive integer/);
  assert.throws(() => parseReviewArgs(["--nope"]), /unknown argument/);
});

test("check-rust identifies Rust paths only", () => {
  for (const file of [
    "ai-digital-life/crates/download-source/src/lib.rs",
    "ai-digital-life/src-tauri/src/main.rs",
    "ai-digital-life/Cargo.toml",
    "ai-digital-life/Cargo.lock",
    "ai-digital-life/rustfmt.toml",
    "ai-digital-life/clippy.toml",
    "ai-digital-life/.cargo/config.toml",
  ]) {
    assert.equal(isRustPath(file), true, file);
  }
  for (const file of [
    "ai-digital-life/frontend/src/app/App.tsx",
    "ai-digital-life/scripts/dev-port.mjs",
    "docs/architecture/x.md",
    "GLOSSARY.md",
  ]) {
    assert.equal(isRustPath(file), false, file);
  }
});

test("affectedCrateDirs extracts only crate directories", () => {
  assert.deepEqual(
    affectedCrateDirs([
      "ai-digital-life/crates/download-source/src/lib.rs",
      "ai-digital-life/frontend/src/app/App.tsx",
      "ai-digital-life/Cargo.lock",
    ]),
    ["crates/download-source"],
  );
  assert.deepEqual(
    affectedCrateDirs([
      "ai-digital-life/src-tauri/src/main.rs",
      "ai-digital-life/src-tauri/tauri.conf.json",
    ]),
    ["src-tauri"],
  );
  assert.deepEqual(affectedCrateDirs(["ai-digital-life/Cargo.toml"]), []);
});

test("clippyArgs scopes to changed crates and excludes the shell when it did not change", () => {
  assert.deepEqual(clippyArgs(["ai-digital-life/crates/download-source/src/lib.rs"]), [
    "clippy",
    "-p",
    "adl-download-source",
    "--all-targets",
    "--",
    "-D",
    "warnings",
  ]);
  assert.deepEqual(clippyArgs(["ai-digital-life/Cargo.lock"]), [
    "clippy",
    "--workspace",
    "--exclude",
    "ai-digital-life",
    "--all-targets",
    "--",
    "-D",
    "warnings",
  ]);
  assert.deepEqual(clippyArgs(["ai-digital-life/src-tauri/src/main.rs"]), [
    "clippy",
    "-p",
    "ai-digital-life",
    "--all-targets",
    "--",
    "-D",
    "warnings",
  ]);
});

test("shouldStageSidecar only when clippy compiles the shell", () => {
  // 壳层文件变更 → 需要 staging。
  assert.equal(shouldStageSidecar(["ai-digital-life/src-tauri/src/main.rs"]), true);
  // 工作区级文件 + 壳层同时变更 → 需要 staging。
  assert.equal(
    shouldStageSidecar(["ai-digital-life/Cargo.lock", "ai-digital-life/src-tauri/tauri.conf.json"]),
    true,
  );
  // 只改 crates/** → 不需要（clippy 只 -p 该 crate）。
  assert.equal(shouldStageSidecar(["ai-digital-life/crates/download-source/src/lib.rs"]), false);
  // 只改工作区文件 → clippy 走 --workspace --exclude ai-digital-life，不编译壳层。
  assert.equal(shouldStageSidecar(["ai-digital-life/Cargo.lock"]), false);
  assert.equal(shouldStageSidecar([]), false);
});

test("check-rust parses --all/--skip-fmt/--base", () => {
  assert.deepEqual(parseRustArgs([]), {
    base: null,
    all: false,
    skipFmt: false,
    help: false,
  });
  assert.deepEqual(parseRustArgs(["--all", "--skip-fmt", "--base", "HEAD~2"]), {
    base: "HEAD~2",
    all: true,
    skipFmt: true,
    help: false,
  });
  assert.throws(() => parseRustArgs(["--base"]), /missing value/);
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
