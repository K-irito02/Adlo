import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("store outline wiring", () => {
  const storeSource = readFileSync(new URL("./slicedStore.ts", import.meta.url), "utf8");

  it("builds file outlines from loaded content through the shared parser", () => {
    expect(storeSource).toContain('from "../shared/outline"');
    expect(storeSource).toContain("const nextOutline = buildOutlineFromContent(fileResult.data.content, relativePath)");
    expect(storeSource).toContain("const nextOutline = buildOutlineFromContent(result.data.content, relativePath)");
  });
});
