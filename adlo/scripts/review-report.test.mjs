import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createReport,
  resolveReportPath,
  validateReport,
  validateReportFile,
} from "./review-report.mjs";

const validReport = (count = 0) =>
  `## 范围\n\n- test\n\n## 上轮问题关闭情况\n\n- 无\n\n## 新增发现\n\n- 无\n\n## 结论\n\n- 需修复项：${count}\n`;

test("creates a valid report skeleton with the exact zero conclusion", () => {
  const dir = mkdtempSync(join(tmpdir(), "adl-review-report-"));
  try {
    const path = join(dir, "nested", "scope-r1-rev1-report.md");
    const text = createReport(path, { scope: "scope", phase: "r1", rev: 1 });
    assert.match(text, /^## 范围$/m);
    assert.match(text, /^## 结论$/m);
    assert.match(text, /^- 需修复项：0$/m);
    assert.equal(readFileSync(path, "utf8"), text);
    assert.deepEqual(validateReport(text), { ok: true, errors: [], count: 0 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("accepts an exact non-zero conclusion", () => {
  assert.deepEqual(validateReport(validReport(2)), { ok: true, errors: [], count: 2 });
});

test("rejects malformed counts that merely start with zero", () => {
  for (const count of ["0.5", "0/1", "0abc", "0（说明）", "00"]) {
    const result = validateReport(validReport(count));
    assert.equal(result.ok, false, `expected ${count} to fail`);
    assert.ok(result.errors.some((error) => error.includes("需修复项")));
  }
});

test("names the near-miss conclusion line in the error", () => {
  const result = validateReport(validReport("0（说明）"));
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes("需修复项") && error.includes("0（说明）")),
    "error should quote the offending line so the fix is obvious",
  );
});

test("resolves report paths against the repo root, not the caller cwd", () => {
  const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
  assert.equal(
    resolveReportPath(".review-diffs/scope-r1-rev1-report.md"),
    join(repoRoot, ".review-diffs", "scope-r1-rev1-report.md"),
  );
  // 绝对路径原样保留，供测试与临时目录使用。
  const absolute = join(tmpdir(), "already-absolute.md");
  assert.equal(resolveReportPath(absolute), absolute);
});

test("reports missing required sections", () => {
  const result = validateReport("## 结论\n\n- 需修复项：0\n");
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("范围")));
  assert.ok(result.errors.some((error) => error.includes("新增发现")));
});

test("refuses to overwrite an existing report unless forced", () => {
  const dir = mkdtempSync(join(tmpdir(), "adl-review-report-"));
  try {
    const path = join(dir, "scope-r1-rev1-report.md");
    createReport(path, { scope: "scope", phase: "r1", rev: 1 });
    assert.throws(
      () => createReport(path, { scope: "scope", phase: "r1", rev: 1 }),
      /already exists/,
    );
    assert.match(
      createReport(path, { scope: "scope", phase: "r1", rev: 1, force: true }),
      /需修复项：0/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validates a report file and reports missing files", () => {
  const dir = mkdtempSync(join(tmpdir(), "adl-review-report-"));
  try {
    const path = join(dir, "scope-r1-rev1-report.md");
    createReport(path, { scope: "scope", phase: "r1", rev: 1 });
    assert.deepEqual(validateReportFile(path), { ok: true, errors: [], count: 0 });
    assert.equal(validateReportFile(join(dir, "missing.md")).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
