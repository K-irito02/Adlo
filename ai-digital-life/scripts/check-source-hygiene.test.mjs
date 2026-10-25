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

test("ignores backtick inline-code examples inside comments", () => {
  // 注释里引用 CSS 分组语法（`.a,\n.b`）是合法示例，不应误报。
  assert.deepEqual(findLiteralEscapedNewlines("// 分组规则（`.a,\\n.b`）会整组返回"), []);
});

test("still flags a literal outside inline code on the same line", () => {
  const hits = findLiteralEscapedNewlines("// 真事故 \\n 后面还有 `.a` 示例");
  assert.equal(hits.length, 1);
});
