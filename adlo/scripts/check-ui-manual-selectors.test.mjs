import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractAriaSelectors,
  extractClassTokens,
  problemKey,
  repoRoot,
  splitByBaseline,
} from "./check-ui-manual-selectors.mjs";

test("extractClassTokens finds adl classes with line numbers", () => {
  const tokens = extractClassTokens("a\n| 容器 | `.adl-titlebar__left` |\n| 其它 | `.other` |");
  assert.deepEqual(
    tokens.map((token) => [token.name, token.line]),
    [["adl-titlebar__left", 2]],
  );
});

test("extractAriaSelectors distinguishes exact and prefix selectors", () => {
  const selectors = extractAriaSelectors('button[aria-label="通知"]\nbutton[aria-label*="语言"]');
  assert.deepEqual(
    selectors.map((item) => [item.label, item.exact, item.line]),
    [
      ["通知", true, 1],
      ["语言", false, 2],
    ],
  );
});

test("problemKey is line-independent and uses repo-relative path", () => {
  const key = problemKey({
    file: `${repoRoot}/docs/x.md`,
    line: 12,
    message: 'class ".adl-x" does not exist in frontend/src',
  });
  assert.equal(key, 'docs/x.md :: class ".adl-x" does not exist in frontend/src');
});

test("splitByBaseline separates fresh problems from known drift", () => {
  const problems = [
    { file: "docs/a.md", line: 1, message: 'class ".adl-a" does not exist in frontend/src' },
    { file: "docs/b.md", line: 2, message: 'class ".adl-b" does not exist in frontend/src' },
  ];
  const { fresh, baselined } = splitByBaseline(problems, [
    'docs/a.md :: class ".adl-a" does not exist in frontend/src',
  ]);
  assert.deepEqual(
    fresh.map((problem) => problem.file),
    ["docs/b.md"],
  );
  assert.deepEqual(
    baselined.map((problem) => problem.file),
    ["docs/a.md"],
  );
});
