import test from "node:test";
import assert from "node:assert/strict";
import { parseTargets } from "./push-both.mjs";

test("parseTargets ignores the pnpm argument separator", () => {
  assert.deepEqual(parseTargets(["--", "main", "slot-1", "slot-2"]), ["main", "slot-1", "slot-2"]);
  assert.deepEqual(parseTargets([]), []);
  assert.deepEqual(parseTargets(["main"]), ["main"]);
});
