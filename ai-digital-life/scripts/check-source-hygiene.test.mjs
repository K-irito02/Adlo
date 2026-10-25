import test from "node:test";
import assert from "node:assert/strict";
import { findLiteralEscapedNewlines } from "./check-source-hygiene.mjs";

test("flags literal backslash-n inside comment lines", () => {
  const text = [
    "// 第一行\\n        // 第二行",
    "/// rustdoc \\n/// 续行",
    " * 块注释 \\n 续行",
    "let x = 1;",
  ].join("\n");
  assert.deepEqual(
    findLiteralEscapedNewlines(text).map((hit) => hit.line),
    [1, 2, 3],
  );
});

test("ignores string literals, normal comments and the allow marker", () => {
  const text = [
    'const tab = "a\\nb";',
    "// normal comment",
    "// hygiene-allow: intentional \\n mention",
    "# heading",
  ].join("\n");
  assert.deepEqual(findLiteralEscapedNewlines(text), []);
});

test("reports the offending line text for quick location", () => {
  const [hit] = findLiteralEscapedNewlines("  // broken \\n comment");
  assert.equal(hit.line, 1);
  assert.match(hit.text, /broken/);
});
