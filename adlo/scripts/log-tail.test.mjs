import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./log-tail.mjs", import.meta.url));

function runLogTail(lines, args = []) {
  const dir = mkdtempSync(join(tmpdir(), "adl-log-tail-"));
  const file = join(dir, "session.log");
  try {
    writeFileSync(file, lines.join("\n"), "utf8");
    return spawnSync(process.execPath, [script, "--file", file, ...args], {
      encoding: "utf8",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("keeps short log lines unchanged", () => {
  const result = runLogTail(["plain line", "第二行"], ["--max-line-chars", "20"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^1: plain line$/m);
  assert.match(result.stdout, /^2: 第二行$/m);
});

test("truncates long ASCII lines while preserving prefix and suffix", () => {
  const result = runLogTail(["abcdefghijklmnopqrstuvwxyz"], ["--max-line-chars", "20"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^1: abcdefghij…rstuvwxyz$/m);
});

test("bounds long UTF-8 log lines by code units", () => {
  const line = `开始${"日志内容".repeat(80)}结束`;
  const result = runLogTail([line], ["--max-line-chars", "40"]);
  assert.equal(result.status, 0);
  const outputLine = result.stdout.split(/\r?\n/)[0];
  const content = outputLine.slice(outputLine.indexOf(":") + 2);
  assert.ok(content.length <= 40, `expected <= 40 code units, got ${content.length}`);
  assert.ok(content.startsWith("开始"));
  assert.ok(content.endsWith("结束"));
  assert.ok(content.includes("…"));
});

test("defaults to an 800-character bound", () => {
  const result = runLogTail(["x".repeat(1_000)]);
  assert.equal(result.status, 0);
  const outputLine = result.stdout.split(/\r?\n/)[0];
  const content = outputLine.slice(outputLine.indexOf(":") + 2);
  assert.equal(content.length, 800);
});

test("rejects non-positive or fractional line limits", () => {
  for (const value of ["0", "-1", "1.5", "nope"]) {
    const result = runLogTail(["line"], ["--max-line-chars", value]);
    assert.notEqual(result.status, 0, `expected ${value} to fail`);
    assert.match(result.stderr, /--max-line-chars must be a positive integer/);
  }
});
