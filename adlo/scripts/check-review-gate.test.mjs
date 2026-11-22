import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateArchiveGate,
  evaluateExitGate,
  evaluateR2Gate,
  hasP3P4Approval,
  latestR1Reports,
} from "./check-review-gate.mjs";

const report = (scope, rev, conclusion) => ({
  name: `${scope}-r1-rev${rev}-report.md`,
  text: `# Report\n\n## 结论\n\n- 需修复项：${conclusion}\n`,
});

const r2report = (scope, rev, conclusion) => ({
  name: `${scope}-r2-rev${rev}-report.md`,
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

describe("P4 exit gate", () => {
  it("passes only when both R1 and R2 latest rounds are zero", () => {
    const result = evaluateExitGate([
      report("favicon", 5, 0),
      report("notices", 5, 0),
      r2report("cleanup", 2, 0),
    ]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.r2.scopes, [{ scope: "cleanup", rev: 2 }]);
  });

  it("blocks when R2 was never dispatched", () => {
    const result = evaluateExitGate([report("favicon", 5, 0)]);
    assert.equal(result.ok, false);
    assert.equal(result.r1.ok, true);
    assert.equal(result.r2.ok, false);
    assert.deepEqual(result.r2.scopes, []);
  });

  it("blocks when the latest R2 round still has findings", () => {
    const result = evaluateExitGate([
      report("favicon", 5, 0),
      r2report("cleanup", 1, 3),
      r2report("cleanup", 2, 1),
    ]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.r2.failing, [{ scope: "cleanup", rev: 2 }]);
  });

  it("blocks when R1 regressed after the pre-R2 gate", () => {
    const result = evaluateExitGate([report("notices", 6, 2), r2report("cleanup", 1, 0)]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.r1.failing, [{ scope: "notices", rev: 6 }]);
  });

  it("ignores R1 report names when evaluating the R2 side", () => {
    const result = evaluateExitGate([report("favicon", 5, 0), r2report("cleanup", 1, 0)]);
    assert.deepEqual(result.r2.scopes, [{ scope: "cleanup", rev: 1 }]);
  });
});

describe("P6 archive gate", () => {
  it("passes when every latest R1/R2 report exists in the archive", () => {
    const snapshots = [report("favicon", 5, 0), r2report("cleanup", 2, 0)];
    const result = evaluateArchiveGate(snapshots, snapshots);
    assert.equal(result.ok, true);
    assert.deepEqual(result.missing, []);
  });

  it("fails when the archive is missing the latest rev", () => {
    const snapshots = [report("favicon", 6, 0), r2report("cleanup", 2, 0)];
    const archive = [report("favicon", 5, 0), r2report("cleanup", 2, 0)];
    const result = evaluateArchiveGate(snapshots, archive);
    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, ["favicon-r1-rev6-report.md"]);
  });

  it("falls back to the archive itself after .review-diffs is deleted", () => {
    const archive = [report("favicon", 5, 0), r2report("cleanup", 2, 0)];
    assert.equal(evaluateArchiveGate([], archive).ok, true);
    assert.equal(evaluateArchiveGate([], []).ok, false);
  });

  it("requires both an R1 and an R2 report in the archive", () => {
    const onlyR1 = [report("favicon", 5, 0)];
    assert.equal(evaluateArchiveGate([], onlyR1).ok, false);
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
