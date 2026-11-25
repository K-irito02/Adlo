import test from "node:test";
import assert from "node:assert/strict";
import { lintSource } from "./check-script-lint.mjs";

test("lintSource accepts clean tooling code", () => {
  const messages = lintSource(
    'const options = { theme: "", focus: "" };\nswitch (arg) { case "--a": break; default: break; }\n',
  );
  assert.deepEqual(messages, []);
});

test("lintSource rejects duplicate switch cases", () => {
  const messages = lintSource(
    'switch (arg) { case "--theme": break; case "--theme": break; default: break; }\n',
  );
  assert.equal(messages.length, 1);
  assert.equal(messages[0].ruleId, "no-duplicate-case");
});

test("lintSource rejects duplicate object keys", () => {
  const messages = lintSource('const options = { theme: "", theme: "dark" };\n');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].ruleId, "no-dupe-keys");
});
