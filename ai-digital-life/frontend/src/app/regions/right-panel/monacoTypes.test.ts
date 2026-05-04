import { describe, it, expect } from "vitest";
import { createMonacoRange, cssColorToHex } from "./monacoTypes";

describe("createMonacoRange", () => {
  it("creates a range when Monaco exposes a valid Range constructor", () => {
    class FakeRange {
      constructor(
        public startLineNumber: number,
        public startColumn: number,
        public endLineNumber: number,
        public endColumn: number
      ) {}
    }

    const range = createMonacoRange({ Range: FakeRange }, 1, 2, 3, 4);

    expect(range).toEqual({
      startLineNumber: 1,
      startColumn: 2,
      endLineNumber: 3,
      endColumn: 4,
    });
  });

  it("throws when Monaco does not expose a Range constructor", () => {
    expect(() => createMonacoRange({}, 1, 1, 1, 1)).toThrowError(
      "Monaco Range constructor is unavailable"
    );
  });

  it("throws when Range exists but is not a constructor", () => {
    expect(() =>
      createMonacoRange({ Range: 42 as unknown as never }, 1, 1, 1, 1)
    ).toThrowError("Monaco Range constructor is unavailable");
  });
});

describe("cssColorToHex", () => {
  it("passes through hex colors unchanged", () => {
    expect(cssColorToHex("#FF0000")).toBe("#FF0000");
    expect(cssColorToHex("#FF000080")).toBe("#FF000080");
    expect(cssColorToHex("#F00")).toBe("#F00");
    expect(cssColorToHex("#F00A")).toBe("#F00A");
  });

  it("converts rgba() to #RRGGBBAA hex format", () => {
    expect(cssColorToHex("rgba(22, 163, 74, 0.35)")).toBe("#16a34a59");
    expect(cssColorToHex("rgba(239, 68, 68, 0.35)")).toBe("#ef444459");
    expect(cssColorToHex("rgba(74, 222, 128, 0.35)")).toBe("#4ade8059");
    expect(cssColorToHex("rgba(248, 113, 113, 0.35)")).toBe("#f8717159");
  });

  it("converts rgba() with full opacity to #RRGGBBFF", () => {
    expect(cssColorToHex("rgba(255, 0, 0, 1)")).toBe("#ff0000ff");
  });

  it("converts rgba() with zero opacity to #RRGGBB00", () => {
    expect(cssColorToHex("rgba(0, 0, 0, 0)")).toBe("#00000000");
  });

  it("converts rgb() to #RRGGBB hex format (implicit alpha=1)", () => {
    expect(cssColorToHex("rgb(22, 163, 74)")).toBe("#16a34a");
    expect(cssColorToHex("rgb(255, 255, 255)")).toBe("#ffffff");
  });

  it("handles spaces in rgba/rgb format", () => {
    expect(cssColorToHex("rgba( 22 , 163 , 74 , 0.5 )")).toBe("#16a34a80");
    expect(cssColorToHex("rgb( 22 , 163 , 74 )")).toBe("#16a34a");
  });

  it("returns input unchanged for unrecognized formats", () => {
    expect(cssColorToHex("red")).toBe("red");
    expect(cssColorToHex("hsl(120, 100%, 50%)")).toBe("hsl(120, 100%, 50%)");
  });

  it("handles the exact minimap-diff-insert-bg CSS variable value", () => {
    // Dark theme: rgba(22, 163, 74, 0.35)
    const darkInsert = cssColorToHex("rgba(22, 163, 74, 0.35)");
    expect(darkInsert).toBe("#16a34a59");
    // Must start with # for Monaco's Color.fromHex() to parse
    expect(darkInsert.startsWith("#")).toBe(true);
    // Must be 9 chars (#RRGGBBAA) for alpha support
    expect(darkInsert.length).toBe(9);
  });

  it("handles the exact minimap-diff-remove-bg CSS variable value", () => {
    // Dark theme: rgba(239, 68, 68, 0.35)
    const darkRemove = cssColorToHex("rgba(239, 68, 68, 0.35)");
    expect(darkRemove).toBe("#ef444459");
    expect(darkRemove.startsWith("#")).toBe(true);
    expect(darkRemove.length).toBe(9);
  });

  it("handles light theme CSS variable values", () => {
    // Light theme: rgba(74, 222, 128, 0.35)
    const lightInsert = cssColorToHex("rgba(74, 222, 128, 0.35)");
    expect(lightInsert).toBe("#4ade8059");
    // Light theme: rgba(248, 113, 113, 0.35)
    const lightRemove = cssColorToHex("rgba(248, 113, 113, 0.35)");
    expect(lightRemove).toBe("#f8717159");
  });

  it("handles alpha value of 1.0 correctly", () => {
    expect(cssColorToHex("rgba(100, 100, 100, 1)")).toBe("#646464ff");
  });

  it("converts fallback colors used in ChangesPanel.tsx", () => {
    expect(cssColorToHex("rgba(22, 163, 74, 0.5)")).toBe("#16a34a80");
    expect(cssColorToHex("rgba(239, 68, 68, 0.5)")).toBe("#ef444480");
  });
});
