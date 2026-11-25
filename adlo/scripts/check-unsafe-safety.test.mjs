import assert from "node:assert/strict";
import test from "node:test";
import {
  addedLineNumbers,
  findUnsafeStarts,
  hasSafetyComment,
  stripRustComments,
} from "./check-unsafe-safety.mjs";

test("findUnsafeStarts ignores comments and reports 1-based lines", () => {
  const text = [
    "// unsafe { not a block }",
    "/* unsafe { also not } */",
    "fn a() {",
    "    // SAFETY: ok",
    "    unsafe { call(); }",
    "}",
  ].join("\n");
  assert.deepEqual(findUnsafeStarts(text), [5]);
});

test("hasSafetyComment accepts same-line, previous-line, blank line and attributes", () => {
  assert.equal(hasSafetyComment("let x = unsafe { f() }; // SAFETY: checked above", 1), true);
  assert.equal(hasSafetyComment("// SAFETY: invariants\nunsafe { f() }", 2), true);
  assert.equal(hasSafetyComment("// SAFETY: invariants\n\nunsafe { f() }", 3), true);
  assert.equal(hasSafetyComment("// SAFETY: invariants\n#[cfg(windows)]\nunsafe { f() }", 3), true);
  assert.equal(hasSafetyComment("// just a comment\nunsafe { f() }", 2), false);
  assert.equal(hasSafetyComment("let x = 1;\nunsafe { f() }", 2), false);
});

test("stripRustComments preserves line numbers", () => {
  const stripped = stripRustComments("a\n/* b\nc */\nd // e\nf");
  assert.equal(stripped.split("\n").length, 5);
  assert.ok(!stripped.includes("b"));
  assert.ok(!stripped.includes("e"));
});

test("addedLineNumbers follows hunk offsets", () => {
  const diff = [
    "@@ -1,2 +1,3 @@",
    " context",
    "+added-one",
    " context-2",
    "@@ -10,0 +20,2 @@",
    "+added-two",
    "+added-three",
  ].join("\n");
  assert.deepEqual([...addedLineNumbers(diff)], [2, 20, 21]);
});
