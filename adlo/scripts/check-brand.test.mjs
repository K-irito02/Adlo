import assert from "node:assert/strict";
import test from "node:test";
import { scanText } from "./check-brand.mjs";

test("flags legacy brand names", () => {
  const violations = scanText(
    "const ua = 'AIDigitalLife/1.0';\nconst name = 'Kora';\n欢迎可燃",
    "x.md",
  );
  assert.deepEqual(
    violations.map((violation) => violation.term),
    ["AIDigitalLife", "Kora", "可燃"],
  );
});

test("ignores allowed lines and allowed files", () => {
  assert.deepEqual(scanText("Kora // brand-allow: historical", "x.md"), []);
  assert.deepEqual(scanText("<!-- brand-allow-file: historical -->\nKora\n可燃", "x.md"), []);
});

test("reports the file and 1-based line", () => {
  const [violation] = scanText("clean\nAIDigitalLife", "docs/current.md");
  assert.equal(violation.file, "docs/current.md");
  assert.equal(violation.line, 2);
});
