import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach, beforeAll, afterAll } from "vitest";

import {
  computeMinimapVisualFrame,
  computeScrollRatio,
  loadMinimapSettings,
  saveMinimapSettings,
  MINIMAP_DEFAULTS
} from "./minimapVisualOverlay";

const minimapOverlaySource = readFileSync(
  new URL("../../../../src/app/regions/right-panel/minimapVisualOverlay.ts", import.meta.url),
  "utf8"
);
const regionsCss = readFileSync(new URL("../../../../src/styles/regions.css", import.meta.url), "utf8");

describe("computeMinimapVisualFrame", () => {
  it("scrollRatio 0 positions overlay at top", () => {
    expect(
      computeMinimapVisualFrame({
        minimapHeight: 600,
        scrollRatio: 0,
        visualHeight: 48
      })
    ).toEqual({ top: 0, height: 48 });
  });

  it("scrollRatio 1 positions overlay at bottom", () => {
    expect(
      computeMinimapVisualFrame({
        minimapHeight: 600,
        scrollRatio: 1,
        visualHeight: 48
      })
    ).toEqual({ top: 552, height: 48 });
  });

  it("scrollRatio 0.5 positions overlay at center", () => {
    expect(
      computeMinimapVisualFrame({
        minimapHeight: 600,
        scrollRatio: 0.5,
        visualHeight: 48
      })
    ).toEqual({ top: 276, height: 48 });
  });

  it("shrinks height when minimap is smaller than visual size", () => {
    expect(
      computeMinimapVisualFrame({
        minimapHeight: 30,
        scrollRatio: 0.5,
        visualHeight: 48
      })
    ).toEqual({ top: 0, height: 30 });
  });

  it("clamps scrollRatio to [0, 1]", () => {
    const over = computeMinimapVisualFrame({
      minimapHeight: 600,
      scrollRatio: 1.5,
      visualHeight: 48
    });
    expect(over.top).toBe(552);

    const under = computeMinimapVisualFrame({
      minimapHeight: 600,
      scrollRatio: -0.5,
      visualHeight: 48
    });
    expect(under.top).toBe(0);
  });

  it("returns zero frame when minimap height is zero", () => {
    expect(
      computeMinimapVisualFrame({
        minimapHeight: 0,
        scrollRatio: 0.5,
        visualHeight: 48
      })
    ).toEqual({ top: 0, height: 0 });
  });
});

describe("computeScrollRatio", () => {
  it("returns 0 when no scrollable content", () => {
    expect(
      computeScrollRatio({ scrollTop: 0, scrollHeight: 500, clientHeight: 500 })
    ).toBe(0);
  });

  it("returns 1 at bottom of document", () => {
    expect(
      computeScrollRatio({ scrollTop: 1000, scrollHeight: 2000, clientHeight: 1000 })
    ).toBe(1);
  });

  it("returns 0.5 at middle of document", () => {
    expect(
      computeScrollRatio({ scrollTop: 500, scrollHeight: 2000, clientHeight: 1000 })
    ).toBe(0.5);
  });

  it("clamps negative scrollTop to 0", () => {
    expect(
      computeScrollRatio({ scrollTop: -10, scrollHeight: 2000, clientHeight: 1000 })
    ).toBe(0);
  });

  it("returns 0 when content is shorter than viewport", () => {
    expect(
      computeScrollRatio({ scrollTop: 0, scrollHeight: 200, clientHeight: 500 })
    ).toBe(0);
  });
});

describe("minimap overlay removes Monaco diff-strip borders", () => {
  it("contains the stripDiffBorders helper that removes Monaco diff borders", () => {
    expect(minimapOverlaySource).toContain("const stripDiffBorders = () =>");
    expect(minimapOverlaySource).toContain("border-right");
    expect(minimapOverlaySource).toContain("border-bottom");
    expect(minimapOverlaySource).toContain("border-left");
  });
});

describe("MinimapSettings persistence", () => {
  const store = new Map<string, string>();

  beforeAll(() => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
      get length() { return store.size; },
      key: (index: number) => [...store.keys()][index] ?? null,
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaults when no stored settings", () => {
    const settings = loadMinimapSettings();
    expect(settings).toEqual(MINIMAP_DEFAULTS);
  });

  it("persists and loads settings", () => {
    const custom = { ...MINIMAP_DEFAULTS, renderCharacters: false, scale: 2 };
    saveMinimapSettings(custom);
    const loaded = loadMinimapSettings();
    expect(loaded.renderCharacters).toBe(false);
    expect(loaded.scale).toBe(2);
  });

  it("merges partial stored settings with defaults", () => {
    localStorage.setItem("adl-minimap-settings", JSON.stringify({ scale: 1 }));
    const loaded = loadMinimapSettings();
    expect(loaded.scale).toBe(1);
    expect(loaded.renderCharacters).toBe(MINIMAP_DEFAULTS.renderCharacters);
  });

  it("handles corrupt stored data gracefully", () => {
    localStorage.setItem("adl-minimap-settings", "not-json");
    const loaded = loadMinimapSettings();
    expect(loaded).toEqual(MINIMAP_DEFAULTS);
  });
});

describe("minimap context menu CSS", () => {
  it("includes context menu styles", () => {
    expect(regionsCss).toContain(".adl-minimap-context-menu {");
    expect(regionsCss).toContain(".adl-minimap-context-menu__item");
    expect(regionsCss).toContain(".adl-minimap-context-menu__separator");
    expect(regionsCss).toContain(".adl-minimap-context-menu__group");
    expect(regionsCss).toContain(".adl-minimap-context-menu__option");
    expect(regionsCss).toContain(".adl-minimap-context-menu__option.is-selected");
  });
});
