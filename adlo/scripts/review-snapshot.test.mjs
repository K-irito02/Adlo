import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectClaimHints,
  findSuspiciousUntracked,
  parseArgs,
  safeSnapshotName,
  validateClaimAck,
  writeClaimAckTemplate,
} from "./review-snapshot.mjs";

test("rejects numeric and temp-looking untracked files", () => {
  assert.deepEqual(
    findSuspiciousUntracked([
      "adlo/frontend/11",
      "adlo/frontend/12",
      "adlo\\frontend\\13",
      "notes.log",
      "script.tmp",
      "debug.out",
    ]),
    [
      "adlo/frontend/11",
      "adlo/frontend/12",
      "adlo\\frontend\\13",
      "notes.log",
      "script.tmp",
      "debug.out",
    ],
  );
});

test("keeps normal new source and docs files", () => {
  assert.deepEqual(
    findSuspiciousUntracked([
      "adlo/frontend/src/feature/new.ts",
      "docs/adr/0014-example.md",
      ".review-diffs/tmp/check.txt",
    ]),
    [],
  );
});

test("parses the new escape hatches", () => {
  const options = parseArgs(["--rev", "3", "--allow-untracked", "--allow-claims"]);
  assert.equal(options.rev, 3);
  assert.equal(options.allowUntracked, true);
  assert.equal(options.allowClaims, true);
});

test("requires an [x] acknowledgement per claim", () => {
  const hints = [
    { file: "src/a.ts", line: 12, text: "// always true" },
    { file: "src/b.ts", line: 4, text: "// never changes" },
  ];

  assert.deepEqual(validateClaimAck("", hints).missing, hints);
  assert.deepEqual(validateClaimAck("- [ ] src/a.ts:12 — pending", hints).missing, hints);
  assert.deepEqual(
    validateClaimAck(
      ["- [x] src/a.ts:12 — verified by test", "- [x] src/b.ts:4 — reworded"].join("\n"),
      hints,
    ),
    { ok: true, missing: [] },
  );
  assert.deepEqual(validateClaimAck("- [x] src/a.ts:12 — verified by test", hints).missing, [
    hints[1],
  ]);
});

test("collects absolute and numeric claims with new-file line numbers", () => {
  const dir = mkdtempSync(join(tmpdir(), "adl-review-snapshot-"));
  const file = "adlo/frontend/src/foo.ts";
  try {
    writeFileSync(
      join(dir, `${safeSnapshotName(file)}-rev5.diff`),
      [
        "@@ -1,0 +10,3 @@",
        "+// 永远只刷新当前工作区",
        "+// 现在有 3 个入口",
        "+const value = 1;",
      ].join("\n"),
    );
    const result = collectClaimHints([file], dir, 5);
    assert.equal(result.count, 2);
    assert.deepEqual(
      result.hints.map((hit) => [hit.line, hit.kind]),
      [
        [10, "absolute"],
        [11, "numeric"],
      ],
    );
    const body = readFileSync(join(dir, "claims-rev5.md"), "utf8");
    assert.match(body, /绝对断言/);
    assert.match(body, /数字断言/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("clears stale claims and ack files when a regenerated rev has no claims", () => {
  const dir = mkdtempSync(join(tmpdir(), "adl-review-snapshot-"));
  const file = "adlo/frontend/src/foo.ts";
  try {
    writeFileSync(
      join(dir, `${safeSnapshotName(file)}-rev6.diff`),
      "@@ -1,0 +1,1 @@\n+const v = 1;",
    );
    writeFileSync(join(dir, "claims-rev6.md"), "stale");
    writeFileSync(join(dir, "claims-ack-rev6.md"), "stale");
    const result = collectClaimHints([file], dir, 6);
    assert.equal(result.count, 0);
    assert.equal(existsSync(join(dir, "claims-rev6.md")), false);
    assert.equal(existsSync(join(dir, "claims-ack-rev6.md")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ack template carries forward claims with identical text from a prior rev", () => {
  const dir = mkdtempSync(join(tmpdir(), "adl-review-snapshot-"));
  const ackPath = join(dir, "claims-ack-rev8.md");
  try {
    // 模拟上一 rev 的 ack：同文案被勾选、行号改过（代码插入行位移 +1）
    writeFileSync(
      join(dir, "claims-ack-rev7.md"),
      "# Claims ack — rev7\n\n- [x] src/a.ts:30 — // always follows through even off the happy path\n",
    );
    writeClaimAckTemplate(ackPath, 8, [
      {
        file: "src/a.ts",
        line: 31,
        text: "// always follows through even off the happy path",
      },
      { file: "src/b.ts", line: 4, text: "// 3 个入口" },
    ]);
    const text = readFileSync(ackPath, "utf8");
    assert.match(text, /\[x\] src\/a\.ts:31/);
    assert.match(text, /\[ \] src\/b\.ts:4/);
    assert.match(text, /carried over/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ack template appends newly collected claims without losing checked ones", () => {
  const dir = mkdtempSync(join(tmpdir(), "adl-review-snapshot-"));
  const ackPath = join(dir, "claims-ack-rev7.md");
  try {
    writeFileSync(ackPath, "# Claims ack — rev7\n\n- [x] src/a.ts:12 — verified by test\n");
    writeClaimAckTemplate(ackPath, 7, [
      { file: "src/a.ts", line: 12, text: "// always" },
      { file: "src/b.ts", line: 4, text: "// 3 个入口" },
    ]);
    const text = readFileSync(ackPath, "utf8");
    assert.match(text, /\[x\] src\/a\.ts:12/);
    assert.match(text, /\[ \] src\/b\.ts:4/);
    assert.equal(text.match(/src\/a\.ts:12/g)?.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
