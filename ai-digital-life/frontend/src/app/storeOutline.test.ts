import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("store outline wiring", () => {
  const storeSource = readFileSync(new URL("./stores/slicedStore.ts", import.meta.url), "utf8");

  it("builds file outlines from loaded content through the shared parser", () => {
    expect(storeSource).toContain('from "../../shared/outline"');
    const outlineOccurrences = (storeSource.match(/buildOutlineFromContent/g) ?? []).length;
    expect(outlineOccurrences).toBeGreaterThanOrEqual(3);
  });
});