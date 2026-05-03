import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach, beforeAll, afterAll } from "vitest";

import {
  computeMinimapVisualFrame,
  computeMinimapLineHeight,
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

  it("constrains slider to contentHeight when content is shorter than minimap", () => {
    // Short file: content only fills 120px of a 600px minimap
    const frame = computeMinimapVisualFrame({
      minimapHeight: 600,
      scrollRatio: 0,
      visualHeight: 48,
      contentHeight: 120
    });
    expect(frame.height).toBe(48);
    expect(frame.top).toBe(0);
    // Slider should NOT be able to travel beyond 120 - 48 = 72px
    const frameAtBottom = computeMinimapVisualFrame({
      minimapHeight: 600,
      scrollRatio: 1,
      visualHeight: 48,
      contentHeight: 120
    });
    expect(frameAtBottom.top).toBe(72); // 120 - 48
    expect(frameAtBottom.height).toBe(48);
  });

  it("slider covers entire content when content is shorter than visualHeight", () => {
    // Very short file: content only 30px, visualHeight is 48px
    const frame = computeMinimapVisualFrame({
      minimapHeight: 600,
      scrollRatio: 0,
      visualHeight: 48,
      contentHeight: 30
    });
    expect(frame.top).toBe(0);
    expect(frame.height).toBe(30); // Clamped to contentHeight
  });

  it("slider cannot move when content height equals visual height", () => {
    const frame = computeMinimapVisualFrame({
      minimapHeight: 600,
      scrollRatio: 1,
      visualHeight: 48,
      contentHeight: 48
    });
    expect(frame.top).toBe(0); // travelRange = 48 - 48 = 0
    expect(frame.height).toBe(48);
  });

  it("behaves identically to no contentHeight when content fills minimap", () => {
    const withContent = computeMinimapVisualFrame({
      minimapHeight: 600,
      scrollRatio: 0.5,
      visualHeight: 48,
      contentHeight: 800 // Content taller than minimap → clamped to minimapHeight
    });
    const withoutContent = computeMinimapVisualFrame({
      minimapHeight: 600,
      scrollRatio: 0.5,
      visualHeight: 48
    });
    expect(withContent).toEqual(withoutContent);
  });

  it("medium file: slider at midpoint within content area", () => {
    const frame = computeMinimapVisualFrame({
      minimapHeight: 600,
      scrollRatio: 0.5,
      visualHeight: 48,
      contentHeight: 300
    });
    // effectiveHeight = 300, travelRange = 300 - 48 = 252
    expect(frame.top).toBe(126); // 0.5 * 252
    expect(frame.height).toBe(48);
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

describe("computeMinimapLineHeight", () => {
  it("returns 2 for scale 1", () => {
    expect(computeMinimapLineHeight(1)).toBe(2);
  });

  it("returns 3 for scale 1.5", () => {
    expect(computeMinimapLineHeight(1.5)).toBe(3);
  });

  it("returns 4 for scale 2", () => {
    expect(computeMinimapLineHeight(2)).toBe(4);
  });

  it("returns minimum of 2 for very small scale", () => {
    expect(computeMinimapLineHeight(0.5)).toBe(2);
  });

  it("rounds non-integer scales", () => {
    expect(computeMinimapLineHeight(1.3)).toBe(3);
    expect(computeMinimapLineHeight(1.7)).toBe(3);
  });
});

describe("getMinimapContentHeight with lineCount", () => {
  it("accepts lineCount, scale, and size parameters", () => {
    expect(minimapOverlaySource).toContain("function getMinimapContentHeight(");
    expect(minimapOverlaySource).toContain("lineCount?: number | null");
    expect(minimapOverlaySource).toContain("scale?: number");
    expect(minimapOverlaySource).toContain('size?: "proportional" | "fill"');
  });

  it("computes content height from lineCount when content fits viewport", () => {
    expect(minimapOverlaySource).toContain("computeMinimapLineHeight(effectiveScale)");
    expect(minimapOverlaySource).toContain("lineCount * minimapLineHeight");
  });

  it("returns 0 for empty file (0 lines)", () => {
    expect(minimapOverlaySource).toContain("if (lineCount === 0) return 0");
  });

  it("returns minimapHeight in fill mode regardless of line count", () => {
    expect(minimapOverlaySource).toContain('if (size === "fill") return minimapHeight');
  });

  it("falls back to scroll-ratio formula when lineCount is null", () => {
    expect(minimapOverlaySource).toContain("minimapHeight * contentRatio");
    expect(minimapOverlaySource).toContain("scrollState.scrollHeight / Math.max(1, scrollState.clientHeight)");
  });

  it("returns full minimap height when content is scrollable (maxScroll > 0)", () => {
    expect(minimapOverlaySource).toContain("return minimapHeight;");
  });

  it("reads canvas height from DOM as primary method regardless of maxScroll", () => {
    expect(minimapOverlaySource).toContain("canvas.minimap-decorations-layer");
    expect(minimapOverlaySource).toContain("canvas.getBoundingClientRect().height");
  });

  it("uses canvas height when available, before checking lineCount", () => {
    const canvasCheckIdx = minimapOverlaySource.indexOf("const canvas = minimap.querySelector");
    const lineCountCheckIdx = minimapOverlaySource.indexOf("if (lineCount != null");
    expect(canvasCheckIdx).toBeLessThan(lineCountCheckIdx);
  });

  it("returns canvas height clamped to minimapHeight", () => {
    expect(minimapOverlaySource).toContain("Math.min(canvasHeight, minimapHeight)");
  });

  it("only uses contentRatio fallback when maxScroll <= 0 and contentRatio < 1", () => {
    expect(minimapOverlaySource).toContain("if (maxScroll <= 0)");
    expect(minimapOverlaySource).toContain("if (contentRatio < 1)");
  });

  it("estimates content height from native slider dimensions as fallback", () => {
    expect(minimapOverlaySource).toContain("sliderHeight * scrollState.scrollHeight / scrollState.clientHeight");
  });

  it("only uses slider estimation when canvas and lineCount are unavailable", () => {
    const sliderEstIdx = minimapOverlaySource.indexOf("sliderHeight * scrollState.scrollHeight");
    const canvasIdx = minimapOverlaySource.indexOf("const canvas = minimap.querySelector");
    const lineCountIdx = minimapOverlaySource.indexOf("if (lineCount != null");
    expect(canvasIdx).toBeLessThan(lineCountIdx);
    expect(lineCountIdx).toBeLessThan(sliderEstIdx);
  });
});

describe("full-height overlay blocks Monaco native slider", () => {
  it("sets overlay to cover full minimap height via CSS", () => {
    const overlayRuleStart = regionsCss.indexOf(".adl-minimap-slider-visual {");
    expect(overlayRuleStart).toBeGreaterThanOrEqual(0);
    const overlayRuleEnd = regionsCss.indexOf("}", overlayRuleStart);
    const overlayRule = regionsCss.slice(overlayRuleStart, overlayRuleEnd);
    expect(overlayRule).toContain("top: 0");
    expect(overlayRule).toContain("height: 100%");
    expect(overlayRule).toContain("background: transparent");
  });

  it("uses ::before pseudo-element for slider visual highlight", () => {
    expect(regionsCss).toContain(".adl-minimap-slider-visual::before");
    const pseudoStart = regionsCss.indexOf(".adl-minimap-slider-visual::before");
    const pseudoEnd = regionsCss.indexOf("}", pseudoStart);
    const pseudoRule = regionsCss.slice(pseudoStart, pseudoEnd);
    expect(pseudoRule).toContain("--adl-slider-top");
    expect(pseudoRule).toContain("--adl-slider-height");
    expect(pseudoRule).toContain("pointer-events: none");
  });

  it("sets --adl-slider-top and --adl-slider-height CSS custom properties", () => {
    expect(minimapOverlaySource).toContain('"--adl-slider-top"');
    expect(minimapOverlaySource).toContain('"--adl-slider-height"');
  });

  it("does not use clip-path for content boundary", () => {
    expect(minimapOverlaySource).not.toContain("clipPath");
  });

  it("no separate content boundary DOM element", () => {
    expect(minimapOverlaySource).not.toContain("CONTENT_BOUNDARY_CLASS");
    expect(minimapOverlaySource).not.toContain("getOrCreateContentBoundary");
    expect(minimapOverlaySource).not.toContain("adl-minimap-content-boundary");
  });
});

describe("syncMinimapOverlay reads from native slider", () => {
  it("reads slider height from native slider element", () => {
    expect(minimapOverlaySource).toContain("sliderRect.height");
  });

  it("reads slider top position from native slider element", () => {
    expect(minimapOverlaySource).toContain("sliderRect.top - minimapRect.top");
  });

  it("sets --adl-slider-top from native slider position", () => {
    expect(minimapOverlaySource).toContain('"--adl-slider-top"');
    expect(minimapOverlaySource).toContain("sliderTop");
  });

  it("sets --adl-slider-height from native slider height", () => {
    expect(minimapOverlaySource).toContain('"--adl-slider-height"');
    expect(minimapOverlaySource).toContain("sliderHeight");
  });
});

describe("attachOverlayInteraction uses native slider metrics", () => {
  it("defines getSliderMetrics function to read native slider", () => {
    expect(minimapOverlaySource).toContain("const getSliderMetrics = ");
    expect(minimapOverlaySource).toContain("SLIDER_SELECTOR");
  });

  it("calculates contentHeight from slider height and scroll state", () => {
    expect(minimapOverlaySource).toContain("sliderHeight / state.clientHeight");
    expect(minimapOverlaySource).toContain("* state.scrollHeight");
  });

  it("uses sliderHeight for scroll calculation instead of fixed visualHeight", () => {
    const scrollToPointerIdx = minimapOverlaySource.indexOf("const scrollToPointer = ");
    const scrollToPointerEnd = minimapOverlaySource.indexOf("};", scrollToPointerIdx);
    const scrollToPointerBlock = minimapOverlaySource.slice(scrollToPointerIdx, scrollToPointerEnd);
    expect(scrollToPointerBlock).toContain("sliderHeight");
    expect(scrollToPointerBlock).not.toContain("visualHeight");
  });

  it("rejects pointerdown events outside content area", () => {
    expect(minimapOverlaySource).toContain("if (relativeY > metrics.contentHeight) return");
  });

  it("continues dragging even when pointer moves outside content area", () => {
    const scrollToPointerIdx = minimapOverlaySource.indexOf("const scrollToPointer = ");
    const scrollToPointerEnd = minimapOverlaySource.indexOf("};", scrollToPointerIdx);
    const scrollToPointerBlock = minimapOverlaySource.slice(scrollToPointerIdx, scrollToPointerEnd);
    expect(scrollToPointerBlock).toContain("Math.min(clientY - minimapRect.top, contentHeight)");
  });

  it("adds over-slider class when pointer is over slider", () => {
    expect(minimapOverlaySource).toContain("OVER_SLIDER_CLASS");
    expect(minimapOverlaySource).toContain("isOverSlider");
  });

  it("reads slider position from CSS custom properties for hover detection", () => {
    expect(minimapOverlaySource).toContain("getOverlaySliderMetrics");
    expect(minimapOverlaySource).toContain("--adl-slider-top");
    expect(minimapOverlaySource).toContain("--adl-slider-height");
  });

  it("removes over-slider class on pointer leave", () => {
    expect(minimapOverlaySource).toContain("handlePointerLeave");
    expect(minimapOverlaySource).toContain('overlay.removeEventListener("pointerleave"');
  });
});

describe("getLineCount callback integration", () => {
  it("MinimapOverlayOptions includes getLineCount", () => {
    expect(minimapOverlaySource).toContain("getLineCount?: () => number | null");
  });

  it("syncMinimapOverlay reads getSettings from options", () => {
    expect(minimapOverlaySource).toContain("const { getScrollState, getSettings, getLineCount } = options ?? {}");
  });

  it("syncMinimapOverlay reads from native slider instead of computing", () => {
    expect(minimapOverlaySource).toContain("sliderRect.height");
    expect(minimapOverlaySource).toContain("sliderRect.top - minimapRect.top");
  });

  it("overlayOptions forwards getLineCount from caller", () => {
    expect(minimapOverlaySource).toContain("getLineCount: options?.getLineCount");
  });

  it("computeContentHeight helper uses getLineCount", () => {
    expect(minimapOverlaySource).toContain("const computeContentHeight = ");
    expect(minimapOverlaySource).toContain("options?.getLineCount?.()");
  });

  it("attachOverlayInteraction receives getContentHeight closure (now unused)", () => {
    expect(minimapOverlaySource).toContain("_getContentHeight: () => number");
  });
});

describe("scrollToPointer uses native slider metrics", () => {
  it("calls setScrollTop with calculated ratio", () => {
    expect(minimapOverlaySource).toContain("setScrollTop(ratio * maxScroll)");
  });
});
