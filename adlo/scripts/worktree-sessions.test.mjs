import assert from "node:assert/strict";
import test from "node:test";

import { parseArgs, parseDuration } from "./worktree-sessions.mjs";

test("parseDuration accepts days and hours", () => {
  assert.equal(parseDuration("3d"), 3 * 24 * 60 * 60 * 1000);
  assert.equal(parseDuration("48h"), 48 * 60 * 60 * 1000);
  assert.throws(() => parseDuration("3w"), /invalid duration/);
  assert.throws(() => parseDuration(""), /invalid duration/);
});

test("parseArgs defaults to a 3-day listing without reaping", () => {
  const options = parseArgs([]);
  assert.equal(options.reap, false);
  assert.equal(options.staleOnly, false);
  assert.equal(options.olderThanMs, 3 * 24 * 60 * 60 * 1000);
});

test("parseArgs reads --older-than and --reap", () => {
  const options = parseArgs(["--reap", "--older-than", "7d", "--stale-only"]);
  assert.equal(options.reap, true);
  assert.equal(options.staleOnly, true);
  assert.equal(options.olderThanMs, 7 * 24 * 60 * 60 * 1000);
  assert.throws(() => parseArgs(["--older-than"]), /needs a value/);
  assert.throws(() => parseArgs(["--older-than", "3w"]), /invalid duration/);
});
