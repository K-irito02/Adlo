import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("comment claims and fast checks run before the slow legs in check:changed", () => {
  const text = readFileSync(
    new URL("../frontend/scripts/check-changed.mjs", import.meta.url),
    "utf8",
  );
  // 2026-11-21 retro：措辞类失败必须排在 Rust / vitest 之前，避免整条门禁重跑。
  const rustLeg = text.indexOf("run('rust (affected crates)'");
  assert.ok(rustLeg > 0, "rust leg must be identifiable in check:changed");
  for (const fast of ["check-comment-claims.mjs", "check-i18n-coverage.ts", "check-glossary.ts"]) {
    const fastAt = text.indexOf(fast);
    assert.ok(fastAt > 0, `${fast} must be wired into check:changed`);
    assert.ok(fastAt < rustLeg, `${fast} must run before the Rust leg (fast checks first)`);
  }
});

test("push:both pushes both remotes and verifies the resulting SHAs", () => {
  assert.equal(pkg.scripts["push:both"], "node ./scripts/push-both.mjs");
  const text = readFileSync(new URL("./push-both.mjs", import.meta.url), "utf8");
  assert.match(text, /origin/);
  assert.match(text, /gitee/);
  assert.match(text, /ls-remote/);
});

test("check:all includes the full frontend gate (static + tests)", () => {
  assert.match(pkg.scripts["check:all"], /frontend:check:full/);
  assert.equal(pkg.scripts["frontend:check:full"], "pnpm --dir frontend run check:full");
});

test("check:all still runs the cargo gates", () => {
  for (const gate of ["cargo:fmt:check", "cargo:clippy", "cargo:check", "cargo:test"]) {
    assert.match(pkg.scripts["check:all"], new RegExp(gate));
  }
});

test("daily check:changed wires affected Rust tests and accepts --base", () => {
  const text = readFileSync(
    new URL("../frontend/scripts/check-changed.mjs", import.meta.url),
    "utf8",
  );
  assert.match(text, /check-rust-changed\.mjs/);
  assert.match(text, /--base/);
  // 中间审查轮次可只跑 lint/format/typecheck；落盘前的最终门禁仍必须跑测试。
  assert.match(text, /--skip-tests/);
  assert.match(text, /tests skipped \(--skip-tests\)/);
});

test("known flaky tests are registered and excluded from check:changed", () => {
  const frontendPkg = JSON.parse(
    readFileSync(new URL("../frontend/package.json", import.meta.url), "utf8"),
  );
  assert.equal(frontendPkg.scripts["test:flaky"], "node scripts/run-flaky-tests.mjs");
  const flaky = JSON.parse(
    readFileSync(new URL("../frontend/scripts/flaky-tests.json", import.meta.url), "utf8"),
  );
  assert.ok(Array.isArray(flaky.tests), "flaky-tests.json must expose a tests array");
  const changedGate = readFileSync(
    new URL("../frontend/scripts/check-changed.mjs", import.meta.url),
    "utf8",
  );
  assert.match(changedGate, /flaky-tests\.json/);
  assert.match(changedGate, /--exclude/);
});

test("check:all and pre-push share the repo-level gate (check:repo)", () => {
  // 曾经的缝隙：check:all 不含 scripts:format:check / e2e:typecheck，合并门禁全绿后
  // 仍会在 pre-push 被拦下。两处必须引用同一个聚合脚本，否则组合会再次漂移。
  const repo = pkg.scripts["check:repo"];
  assert.equal(typeof repo, "string", "package.json 缺少 check:repo");
  for (const gate of [
    "check:css-globals",
    "check:css-vars",
    "test:scripts",
    "scripts:format:check",
    "e2e:typecheck",
  ]) {
    assert.match(repo, new RegExp(gate));
  }
  assert.match(pkg.scripts["check:all"], /check:repo/);

  const hook = readFileSync(new URL("../../.githooks/pre-push", import.meta.url), "utf8");
  assert.match(hook, /pnpm run check:repo/);
});
