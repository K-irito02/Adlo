import test from "node:test";
import assert from "node:assert/strict";
import { findSuspiciousUntracked, parseArgs, validateClaimAck } from "./review-snapshot.mjs";

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
