import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scanDiffText } from "./check-no-new-any.mjs";

const diff = (...lines) =>
  ["diff --git a/x.test.ts b/x.test.ts", "--- a/x.test.ts", "+++ b/x.test.ts", ...lines].join("\n");

describe("check-no-new-any", () => {
  it("flags an added `as any` cast", () => {
    const violations = scanDiffText(diff("+const s = (get() as any).browserTabs;"));
    assert.equal(violations.length, 1);
    assert.equal(violations[0].file, "x.test.ts");
  });

  it("flags an added `as unknown as` cast", () => {
    const violations = scanDiffText(diff("+const s = state as unknown as StoreState;"));
    assert.equal(violations.length, 1);
  });

  it("ignores removed lines and context lines", () => {
    const violations = scanDiffText(diff("-const old = (get() as any).x;", " const keep = 1;"));
    assert.deepEqual(violations, []);
  });

  it("honours the per-line opt-out", () => {
    const violations = scanDiffText(diff("+const s = (get() as any).x; // no-new-any-allow"));
    assert.deepEqual(violations, []);
  });

  it("passes clean additions", () => {
    const violations = scanDiffText(
      diff("+const patch: Partial<StoreState> = { browserTabs: [] };"),
    );
    assert.deepEqual(violations, []);
  });
});
