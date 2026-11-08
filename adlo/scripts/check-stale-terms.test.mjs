import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scanText, STALE_TERMS } from "./check-stale-terms.mjs";

describe("check-stale-terms", () => {
  it("flags every removed identifier in the denylist", () => {
    for (const { term } of STALE_TERMS) {
      const violations = scanText(`const x = ${term};`, "sample.ts");
      assert.ok(
        violations.some((violation) => violation.term === term),
        `${term} should be flagged`,
      );
    }
  });

  it("flags string keys as well as identifiers", () => {
    const violations = scanText(`persist("adl:browser.tabFolders", []);`, "sample.ts");
    assert.equal(violations[0].term, "adl:browser.tabFolders");
    assert.match(violations[0].hint, /bookmarkFolders/);
  });

  it("passes clean code through", () => {
    const violations = scanText(
      `const folders = state.browserBookmarkFolders; const entry: BookmarkEntry = { id, url, title };`,
      "sample.ts",
    );
    assert.deepEqual(violations, []);
  });

  it("honours the per-line opt-out", () => {
    const violations = scanText(`// old name was TabFolderState (stale-term-allow)`, "sample.ts");
    assert.deepEqual(violations, []);
  });

  it("reports the 1-based line number", () => {
    const violations = scanText(`line1\nline2\nconst y = BookmarkTabItem;`, "sample.ts");
    assert.equal(violations[0].line, 3);
  });
});
