import { describe, expect, it } from "vitest";

import {
  computeInlineMinimapRailWidth,
  DEFAULT_INLINE_MINIMAP_WIDTH,
  getLongestLineColumn,
  INLINE_MINIMAP_GUTTER_WIDTH,
  INLINE_MINIMAP_MAX_COLUMN
} from "./inlineMinimapLayout";

describe("inline minimap width", () => {
  it("keeps Monaco's configured width when content metrics are unavailable", () => {
    expect(computeInlineMinimapRailWidth({ configuredWidth: 72 })).toBe(72);
    expect(computeInlineMinimapRailWidth({ configuredWidth: 0 })).toBe(DEFAULT_INLINE_MINIMAP_WIDTH);
  });

  it("shrinks the rail to the rendered content width for short files", () => {
    expect(
      computeInlineMinimapRailWidth({
        configuredWidth: 84,
        minimapCharWidth: 1,
        longestLineColumn: 17
      })
    ).toBe(INLINE_MINIMAP_GUTTER_WIDTH + 17);
  });

  it("caps the rail at Monaco's configured minimap width for long files", () => {
    expect(
      computeInlineMinimapRailWidth({
        configuredWidth: 84,
        minimapCharWidth: 1,
        longestLineColumn: INLINE_MINIMAP_MAX_COLUMN + 40
      })
    ).toBe(84);
  });

  it("reads the longest logical line from preview content", () => {
    expect(getLongestLineColumn("short\nlongest-line\nmid")).toBe("longest-line".length);
    expect(getLongestLineColumn("")).toBe(0);
    expect(getLongestLineColumn("single")).toBe(6);
  });
});
