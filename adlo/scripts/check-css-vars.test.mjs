import test from "node:test";
import assert from "node:assert/strict";
import {
  collectCssDefinitions,
  collectScriptDefinitions,
  findUndefinedVars,
  stripCssComments,
} from "./check-css-vars.mjs";

test("ignores definitions and usages inside CSS comments", () => {
  const text = "/* var(--missing) */ .a { color: var(--real); }";
  assert.equal(stripCssComments(text).includes("missing"), false);
  assert.deepEqual([...collectCssDefinitions(text)], []);
});

test("collects declarations and @property definitions", () => {
  const text = `:root { --text-primary: #222; }
@property --angle { syntax: "<angle>"; }
.a { --local: 1px; }`;
  assert.deepEqual([...collectCssDefinitions(text)].sort(), [
    "--angle",
    "--local",
    "--text-primary",
  ]);
});

test("collects dynamic variables written from scripts", () => {
  const text = `el.style.setProperty('--adl-scrollbar-width', '8px');
const style = { '--pane-tile-color': color } as CSSProperties;`;
  assert.deepEqual([...collectScriptDefinitions(text)].sort(), [
    "--adl-scrollbar-width",
    "--pane-tile-color",
  ]);
});

test("reports undefined vars but accepts fallbacks", () => {
  const defined = new Set(["--ok"]);
  const text = `.a { color: var(--ok); background: var(--missing); border: var(--fallback, red); }`;
  assert.deepEqual(findUndefinedVars(text, defined), [{ name: "--missing", line: 1 }]);
});

test("reports the correct line number", () => {
  const violations = findUndefinedVars(`.a {\n  color: var(--missing);\n}`, new Set());
  assert.deepEqual(violations, [{ name: "--missing", line: 2 }]);
});
