import test from "node:test";
import assert from "node:assert/strict";
import { preferredDevPort } from "./dev-port.mjs";

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

test("branch-named worktrees fall back to auto selection", () => {
  assert.equal(preferredDevPort("fix-scroll-state"), undefined);
  assert.equal(preferredDevPort("settings-panel-fix"), undefined);
});

test("out-of-range slot suffixes fall back to auto selection", () => {
  assert.equal(preferredDevPort("slot-0"), undefined);
  assert.equal(preferredDevPort("slot-999"), undefined);
});
