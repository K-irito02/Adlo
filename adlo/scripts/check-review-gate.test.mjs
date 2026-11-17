import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateR2Gate, hasP3P4Approval, latestR1Reports } from "./check-review-gate.mjs";

const report = (scope, rev, conclusion) => ({
  name: `${scope}-r1-rev${rev}-report.md`,
  text: `# Report\n\n## 结论\n\n- 需修复项：${conclusion}\n`,
});

describe("check-review-gate", () => {
  it("picks the numeric-latest rev per scope (rev10 > rev9)", () => {
    const latest = latestR1Reports([
      { name: "tree-menus-r1-rev9-report.md", text: "" },
      { name: "tree-menus-r1-rev10-report.md", text: "" },
      { name: "favicon-r1-rev2-report.md", text: "" },
    ]);
    assert.deepEqual(
      latest.map(({ scope, rev }) => `${scope}@${rev}`),
      ["favicon@2", "tree-menus@10"],
    );
  });

  it("passes only when every scope's latest report says 需修复项：0", () => {
    const result = evaluateR2Gate([
      report("favicon", 7, 0),
      report("tree-menus", 7, "0（本轮零问题）"),
    ]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.failing, []);
  });

  it("fails when one scope's latest report is non-zero", () => {
    const result = evaluateR2Gate([report("favicon", 7, 0), report("tree-menus", 7, 2)]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.failing, [{ scope: "tree-menus", rev: 7 }]);
  });

  it("ignores older revs when the latest is zero", () => {
    const result = evaluateR2Gate([report("favicon", 6, 3), report("favicon", 7, 0)]);
    assert.equal(result.ok, true);
  });

  it("fails with no reports (nothing to prove R1 is zero)", () => {
    const result = evaluateR2Gate([]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.scopes, []);
  });

  it("only accepts R1 report names; the old <scope>-rev name is ignored", () => {
    const result = evaluateR2Gate([{ name: "core-rev3-report.md", text: "需修复项：0" }]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.scopes, []);
  });
});

describe("P3→P4 approval gate", () => {
  it("accepts the explicit approval marker", () => {
    assert.equal(hasP3P4Approval("# 进度\n\n- P3→P4 用户批准：是（2026-11-17）\n"), true);
  });

  it("accepts an explicit direct-to-close authorization", () => {
    assert.equal(hasP3P4Approval("- P3→P4 用户批准：不需要（用户已授权直接收尾）"), true);
  });

  it("rejects pending / missing markers", () => {
    assert.equal(hasP3P4Approval("- P3→P4 用户批准：待定"), false);
    assert.equal(hasP3P4Approval("# 进度\n\n- 状态：进行中\n"), false);
  });
});
