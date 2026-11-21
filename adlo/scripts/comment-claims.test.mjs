import test from "node:test";
import assert from "node:assert/strict";
import {
  claimKind,
  isCommentLine,
  parseDiffClaims,
  scanFileClaims,
  splitDiffByFile,
} from "./comment-claims.mjs";

test("only comment lines are considered", () => {
  assert.equal(isCommentLine("// 注释"), true);
  assert.equal(isCommentLine("  /// 文档注释"), true);
  assert.equal(isCommentLine(" * 块注释"), true);
  assert.equal(isCommentLine("<!-- html -->"), true);
  assert.equal(isCommentLine("# toml 注释"), true);
  assert.equal(isCommentLine("const label = '唯一入口';"), false);
});

test("classifies absolute and numeric claims", () => {
  assert.equal(claimKind("// 这是唯一入口"), "absolute");
  assert.equal(claimKind("// 永远不要这样做"), "absolute");
  assert.equal(claimKind("// 覆盖 3 个用例"), "numeric");
  assert.equal(claimKind("// 上限 50"), "numeric");
  assert.equal(claimKind("// 普通说明"), null);
});

test("claim-allow suppresses the line", () => {
  assert.equal(claimKind("// 唯一入口 claim-allow: 由 router 单点构造"), null);
});

test("diff parsing keeps final-file line numbers", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -10,0 +11,2 @@",
    "+// 这是唯一入口",
    "+const x = 1;",
    "@@ -20,1 +23,1 @@",
    "-// old",
    "+// 覆盖 4 个用例",
  ].join("\n");
  assert.deepEqual(parseDiffClaims(diff, "src/a.ts"), [
    { file: "src/a.ts", line: 11, text: "// 这是唯一入口", kind: "absolute" },
    { file: "src/a.ts", line: 23, text: "// 覆盖 4 个用例", kind: "numeric" },
  ]);
});

test("non-comment additions are ignored", () => {
  const diff = [
    "--- a/a.rs",
    "+++ b/a.rs",
    "@@ -0,0 +1,2 @@",
    '+let s = "唯一";',
    "+// 正常注释",
  ].join("\n");
  assert.deepEqual(parseDiffClaims(diff, "a.rs"), []);
});

test("untracked file scan reports 1-based lines", () => {
  assert.deepEqual(scanFileClaims("let a = 1;\n// 唯一入口\n", "new.ts"), [
    { file: "new.ts", line: 2, text: "// 唯一入口", kind: "absolute" },
  ]);
});

test("splits a multi-file diff into per-file chunks", () => {
  const diff = [
    "diff --git a/adlo/a.ts b/adlo/a.ts",
    "index 111..222 100644",
    "--- a/adlo/a.ts",
    "+++ b/adlo/a.ts",
    "@@ -0,0 +1 @@",
    "+// 唯一入口",
    "diff --git a/adlo/b.rs b/adlo/b.rs",
    "--- a/adlo/b.rs",
    "+++ b/adlo/b.rs",
    "@@ -0,0 +1 @@",
    "+// 覆盖 2 个用例",
    "",
  ].join("\n");
  const chunks = splitDiffByFile(diff);
  assert.deepEqual(
    chunks.map((chunk) => chunk.file),
    ["adlo/a.ts", "adlo/b.rs"],
  );
  assert.deepEqual(parseDiffClaims(chunks[0].text, chunks[0].file), [
    { file: "adlo/a.ts", line: 1, text: "// 唯一入口", kind: "absolute" },
  ]);
});

test("splitDiffByFile ignores the preamble and deletion targets", () => {
  const diff = [
    "diff --git a/gone.ts b/gone.ts",
    "deleted file mode 100644",
    "--- a/gone.ts",
    "+++ /dev/null",
  ].join("\n");
  assert.deepEqual(splitDiffByFile(diff), []);
});
