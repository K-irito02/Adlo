import test from "node:test";
import assert from "node:assert/strict";
import {
  findLegacyCompatibility,
  findLiteralEscapedNewlines,
  findMojibake,
  findReplacementChars,
  hasBom,
  isCompatibilityScope,
} from "./check-source-hygiene.mjs";

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

test("flags U+FFFD replacement characters and allows explicit samples", () => {
  const bad = `ok\n坏\uFFFD字`; // hygiene-allow: sample
  assert.deepEqual(
    findReplacementChars(bad).map((hit) => hit.line),
    [2],
  );
  assert.deepEqual(findReplacementChars(`// hygiene-allow: \uFFFD`), []);
});

test("detects a UTF-8 BOM", () => {
  assert.equal(hasBom("\uFEFF# heading"), true);
  assert.equal(hasBom("# heading"), false);
  assert.equal(hasBom(""), false);
});

test("flags common CJK mojibake markers", () => {
  assert.deepEqual(
    findMojibake(`ok\n\u951f\u65a4\u62f7`).map((hit) => hit.line),
    [2],
  );
  assert.deepEqual(findMojibake(`// hygiene-allow: \u70eb\u70eb\u70eb`), []);
});

test("flags unreleased compatibility wording and honors compat-allow", () => {
  assert.equal(findLegacyCompatibility("// 兼容历史逗号分隔").length, 1); // compat-allow: test fixture
  assert.deepEqual(
    findLegacyCompatibility("// compat-allow: OS NO_PROXY uses commas"), // compat-allow: test fixture
    [],
  );
  assert.equal(findLegacyCompatibility("// legacy format support").length, 1); // compat-allow: test fixture
});

test("compatibility scope excludes historical plans but covers product sources", () => {
  assert.equal(isCompatibilityScope("adlo/crates/x/src/lib.rs"), true);
  assert.equal(isCompatibilityScope("GLOSSARY.md"), true);
  assert.equal(isCompatibilityScope("docs/design-system/components/components.md"), true);
  assert.equal(isCompatibilityScope("docs/plans/2026-01-old.md"), false);
  assert.equal(isCompatibilityScope(".workbuddy/memory/old.md"), false);
});
