import test from "node:test";
import assert from "node:assert/strict";
import {
  hasHostFlag,
  hasPortFlag,
  hostFromArgs,
  parsePortEnv,
  portFromArgs,
  preferredDevPort,
  reachableHost,
  stripServerArgs,
} from "./dev-port.mjs";

// 每个工作树的 dev 端口默认值：主工作树保持 5173，slot-N 顺延到 5173+N。
// 被占时启动脚本会自动顺延（findOpenPort），因此这里只锁"首选值"的稳定性。
test("main worktree prefers the base port", () => {
  assert.equal(preferredDevPort(null), 5173);
  assert.equal(preferredDevPort(""), 5173);
});

test("slot worktrees get a stable per-slot port", () => {
  assert.equal(preferredDevPort("slot-1"), 5174);
  assert.equal(preferredDevPort("slot-2"), 5175);
  assert.equal(preferredDevPort("slot-12"), 5185);
});

test("only slot-N gets a derived port; other numeric suffixes could collide", () => {
  // 任意 -数字 后缀会与槽位端口撞车（session-2 → 5175 与 slot-2 相同），必须回退自动挑。
  for (const name of ["session-2", "pr-42", "adl-1", "fix-scroll-state", "settings-panel-fix"]) {
    assert.equal(preferredDevPort(name), undefined, name);
  }
});

test("out-of-range slot suffixes fall back to auto selection", () => {
  assert.equal(preferredDevPort("slot-0"), undefined);
  assert.equal(preferredDevPort("slot-999"), undefined);
});

test("parses explicit --port in both space and equals form", () => {
  assert.equal(portFromArgs(["--port", "6000"]), 6000);
  assert.equal(portFromArgs(["--port=6000"]), 6000);
  assert.equal(portFromArgs(["--log-level", "trace", "--port", "6123", "x"]), 6123);
  assert.equal(portFromArgs(["--port", "not-a-number"]), undefined);
  assert.equal(portFromArgs([]), undefined);
});

test("parses explicit --host in both space and equals form", () => {
  assert.equal(hostFromArgs(["--host", "0.0.0.0"]), "0.0.0.0");
  assert.equal(hostFromArgs(["--host=localhost"]), "localhost");
  assert.equal(hostFromArgs(["--host"]), undefined);
});

test("strips --port/--host so the launcher can inject a single value", () => {
  assert.deepEqual(stripServerArgs(["--port", "6000", "--log-level", "trace"]), [
    "--log-level",
    "trace",
  ]);
  assert.deepEqual(stripServerArgs(["--port=6000", "--host=0.0.0.0", "x"]), ["x"]);
  assert.deepEqual(stripServerArgs(["--log-level", "trace"]), ["--log-level", "trace"]);
});

test("detects a bare --port flag even when its value is missing or invalid", () => {
  assert.equal(hasPortFlag(["--port", "6000"]), true);
  assert.equal(hasPortFlag(["--port=abc"]), true);
  assert.equal(hasPortFlag(["--port"]), true);
  assert.equal(hasPortFlag(["--log-level", "trace"]), false);
  assert.equal(portFromArgs(["--port", "--host", "0.0.0.0"]), undefined);
  assert.equal(portFromArgs(["--port", "70000"]), undefined);
});

test("does not swallow the next flag as a value", () => {
  assert.deepEqual(stripServerArgs(["--host", "--port", "6000"]), []);
  assert.equal(hostFromArgs(["--host", "--port", "6000"]), undefined);
  assert.equal(hostFromArgs(["--host", "0.0.0.0", "--port", "6000"]), "0.0.0.0");
});

test("parses env ports strictly and normalizes the bind host", () => {
  assert.equal(parsePortEnv(undefined), undefined);
  assert.equal(parsePortEnv(""), undefined);
  assert.equal(parsePortEnv("5174"), 5174);
  assert.throws(() => parsePortEnv("abc"), /Invalid port/);
  assert.throws(() => parsePortEnv("70000"), /Invalid port/);
  assert.equal(reachableHost("0.0.0.0"), "127.0.0.1");
  assert.equal(reachableHost("::"), "127.0.0.1");
  assert.equal(reachableHost(""), "127.0.0.1");
  assert.equal(reachableHost("localhost"), "localhost");
});

test("detects a bare --host flag so a missing value fails loudly", () => {
  assert.equal(hasHostFlag(["--host", "0.0.0.0"]), true);
  assert.equal(hasHostFlag(["--host"]), true);
  assert.equal(hasHostFlag(["--host="]), true);
  assert.equal(hasHostFlag(["--port", "6000"]), false);
  assert.equal(hostFromArgs(["--host="]), undefined);
});
