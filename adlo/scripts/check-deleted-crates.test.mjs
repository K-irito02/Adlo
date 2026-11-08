import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scanText, DELETED_TERMS } from "./check-deleted-crates.mjs";

describe("check-deleted-crates", () => {
  it("flags every deleted crate identifier in the denylist", () => {
    for (const { term } of DELETED_TERMS) {
      const violations = scanText(`we once used ${term} here`, "doc.md");
      assert.ok(
        violations.some((violation) => violation.term === term),
        `${term} should be flagged`,
      );
    }
  });

  it("passes current names through", () => {
    const violations = scanText(
      "current code: crates/harness-version, crates/adl-hosted, crates/adl-env",
      "doc.md",
    );
    assert.deepEqual(violations, []);
  });

  it("honours the per-line opt-out", () => {
    const violations = scanText(
      "the pre-2026-10 layout used dsh-bundle (stale-term-allow)",
      "doc.md",
    );
    assert.deepEqual(violations, []);
  });

  it("reports the 1-based line number", () => {
    const violations = scanText(`line1\nline2\nsee dsh-version now`, "doc.md");
    assert.equal(violations[0].line, 3);
  });
});
