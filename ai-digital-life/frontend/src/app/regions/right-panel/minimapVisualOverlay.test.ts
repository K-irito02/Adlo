import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach, beforeAll, afterAll } from "vitest";

import {
  computeMinimapVisualFrame,
  computeScrollRatio,
  loadMinimapSettings,
  saveMinimapSettings,
  MINIMAP_DEFAULTS,
  SLIDER_INTENSITY_RANGE
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
    const custom = { ...MINIMAP_DEFAULTS, renderCharacters: false, scale: 2, sliderIntensity: 30 };
    saveMinimapSettings(custom);
    const loaded = loadMinimapSettings();
    expect(loaded.renderCharacters).toBe(false);
    expect(loaded.scale).toBe(2);
    expect(loaded.sliderIntensity).toBe(30);
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

describe("contextmenu capture phase", () => {
  it("uses capture phase on contextmenu to intercept before Monaco", () => {
    expect(minimapOverlaySource).toContain('root.addEventListener("contextmenu", handleContextMenu, true)');
    expect(minimapOverlaySource).toContain('root.removeEventListener("contextmenu", handleContextMenu, true)');
  });
});

describe("sliderIntensity setting", () => {
  it("includes sliderIntensity in MinimapSettings defaults", () => {
    expect(MINIMAP_DEFAULTS.sliderIntensity).toBe(50);
  });

  it("provides intensity range bounds", () => {
    expect(SLIDER_INTENSITY_RANGE.min).toBe(5);
    expect(SLIDER_INTENSITY_RANGE.max).toBe(100);
  });

  it("renders range slider in context menu", () => {
    expect(minimapOverlaySource).toContain("createSliderControl");
    expect(minimapOverlaySource).toContain('.type = "range"');
    expect(minimapOverlaySource).toContain("SLIDER_INTENSITY_RANGE");
  });

  it("applies slider intensity via CSS custom property", () => {
    expect(minimapOverlaySource).toContain("--adl-slider-intensity");
  });

  it("supports manual numeric input alongside range slider", () => {
    expect(minimapOverlaySource).toContain("__slider-value");
    expect(minimapOverlaySource).toContain("__slider-unit");
    expect(minimapOverlaySource).toContain('.type = "text"');
    expect(minimapOverlaySource).toContain('addEventListener("blur"');
    expect(minimapOverlaySource).toContain("Enter");
  });

  it("separates input event (visual only) from change event (persist)", () => {
    expect(minimapOverlaySource).toContain("rangeInput.addEventListener(\"input\"");
    expect(minimapOverlaySource).toContain("rangeInput.addEventListener(\"change\"");
    expect(minimapOverlaySource).not.toContain("onChange(val);");
  });

  it("updates overlay CSS variable directly without React on drag", () => {
    expect(minimapOverlaySource).toContain("applyVisualIntensity");
    expect(minimapOverlaySource).toContain('style.setProperty("--adl-slider-intensity"');
  });

  it("adds separator between render characters and minimap size", () => {
    const checkItemIdx = minimapOverlaySource.indexOf("createCheckItem");
    const separatorIdx = minimapOverlaySource.indexOf("createSeparator", checkItemIdx);
    const radioGroupIdx = minimapOverlaySource.indexOf("createRadioGroup", separatorIdx);
    expect(checkItemIdx).toBeGreaterThanOrEqual(0);
    expect(separatorIdx).toBeGreaterThan(checkItemIdx);
    expect(radioGroupIdx).toBeGreaterThan(separatorIdx);
  });
});

describe("slider visual CSS", () => {
  it("uses square corners without border and fills full width", () => {
    expect(regionsCss).toContain("border-radius: 0;");
    const visualRuleStart = regionsCss.indexOf(".adl-minimap-slider-visual {");
    expect(visualRuleStart).toBeGreaterThanOrEqual(0);
    const visualRuleEnd = regionsCss.indexOf("}", visualRuleStart);
    const visualRule = regionsCss.slice(visualRuleStart, visualRuleEnd);
    expect(visualRule).not.toContain("border:");
    expect(visualRule).not.toContain("box-shadow:");
    expect(visualRule).not.toContain("margin:");
  });

  it("uses color-mix for intensity-based visibility control", () => {
    expect(regionsCss).toContain("--adl-slider-intensity");
    expect(regionsCss).toContain("color-mix(in srgb, var(--text-primary)");
  });

  it("has no hover intensity boost (removed per user request)", () => {
    const visualRuleStart = regionsCss.indexOf(".adl-minimap-slider-visual {");
    const visualRuleEnd = regionsCss.indexOf("}", visualRuleStart);
    const visualRule = regionsCss.slice(visualRuleStart, visualRuleEnd + 1);
    expect(visualRule).not.toContain(".adl-minimap-slider-visual:hover");
  });

  it("retains dragging state for cursor change only", () => {
    const activeStart = regionsCss.indexOf(".adl-minimap-slider-visual--dragging");
    expect(activeStart).toBeGreaterThanOrEqual(0);
  });
});

describe("context menu range slider CSS", () => {
  it("includes slider control styles", () => {
    expect(regionsCss).toContain(".adl-minimap-context-menu__slider");
    expect(regionsCss).toContain(".adl-minimap-context-menu__slider-header");
    expect(regionsCss).toContain(".adl-minimap-context-menu__slider-track-wrap");
    expect(regionsCss).toContain(".adl-minimap-context-menu__slider-fill");
    expect(regionsCss).toContain(".adl-minimap-context-menu__slider-range");
    expect(regionsCss).toContain(".adl-minimap-context-menu__slider-value");
    expect(regionsCss).toContain(".adl-minimap-context-menu__slider-value-group");
    expect(regionsCss).toContain(".adl-minimap-context-menu__slider-unit");
  });

  it("styles the range input thumb for webkit and mozilla", () => {
    expect(regionsCss).toContain("::-webkit-slider-thumb");
    expect(regionsCss).toContain("::-moz-range-thumb");
  });

  it("input box blends with menu background by default, no borders", () => {
    const valueStart = regionsCss.indexOf(".adl-minimap-context-menu__slider-value {");
    expect(valueStart).toBeGreaterThanOrEqual(0);
    const valueEnd = regionsCss.indexOf("}", valueStart);
    const valueRule = regionsCss.slice(valueStart, valueEnd + 1);
    expect(valueRule).toContain("background: transparent");
    expect(valueRule).toContain("border: none");
    expect(valueRule).toContain("outline: none !important");
    expect(valueRule).toContain("box-shadow: none !important");
    expect(valueRule).toContain("text-align: center");
    expect(valueRule).not.toContain("border-color:");
  });

  it("input and percent sign are wrapped in a zero-gap container", () => {
    expect(minimapOverlaySource).toContain("__slider-value-group");
    expect(regionsCss).toContain("__slider-value-group");
    expect(regionsCss).toContain("gap: 0");
  });

  it("MutationObserver skips overlay style changes to prevent race conditions", () => {
    expect(minimapOverlaySource).toContain("target.classList?.contains(OVERLAY_CLASS)");
    expect(minimapOverlaySource).toContain("continue");
  });

  it("liveIntensity bridges direct visual updates with getSettings so syncAll uses correct value", () => {
    expect(minimapOverlaySource).toContain("let liveIntensity: number | undefined;");
    expect(minimapOverlaySource).toContain("liveIntensity = clamped;");
    expect(minimapOverlaySource).toContain("liveIntensity !== undefined");
    expect(minimapOverlaySource).toContain("sliderIntensity: liveIntensity");
    expect(minimapOverlaySource).toContain("liveIntensity = undefined");
  });

  it("input shows subtle background only on hover/focus", () => {
    const focusRule = regionsCss.indexOf(".adl-minimap-context-menu__slider-value:hover,");
    expect(focusRule).toBeGreaterThanOrEqual(0);
    const focusEnd = regionsCss.indexOf("}", focusRule);
    const focusContent = regionsCss.slice(focusRule, focusEnd + 1);
    expect(focusContent).toContain("background:");
  });

  it("focus state force-removes all browser default focus rings", () => {
    const focusVisibleStart = regionsCss.indexOf(".adl-minimap-context-menu__slider-value:focus-visible");
    expect(focusVisibleStart).toBeGreaterThanOrEqual(0);
    const focusVisibleEnd = regionsCss.indexOf("}", focusVisibleStart);
    const focusRule = regionsCss.slice(focusVisibleStart, focusVisibleEnd);
    expect(focusRule).toContain("outline: none !important");
    expect(focusRule).toContain("box-shadow: none !important");
    expect(focusRule).toContain("border: none !important");
  });
});
