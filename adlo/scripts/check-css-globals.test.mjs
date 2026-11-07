import test from "node:test";
import assert from "node:assert/strict";
import { findDuplicateGlobals } from "./check-css-globals.mjs";

test("detects duplicate top-level class definitions", () => {
  const duplicates = findDuplicateGlobals([
    { file: "a.css", content: ".adl-btn {\n  color: red;\n}\n" },
    { file: "b.css", content: ".adl-btn {\n  color: blue;\n}\n" },
  ]);
  assert.deepEqual(duplicates, [{ cls: "adl-btn", files: ["a.css", "b.css"] }]);
});

test("ignores indented @media rules and scoped selectors", () => {
  const duplicates = findDuplicateGlobals([
    { file: "a.css", content: "@media (min-width: 1px) {\n  .adl-btn {\n  }\n}\n" },
    { file: "b.css", content: ".adl-shell .adl-btn {\n}\n" },
  ]);
  assert.deepEqual(duplicates, []);
});
