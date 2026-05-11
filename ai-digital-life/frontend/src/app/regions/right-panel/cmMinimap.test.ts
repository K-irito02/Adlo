import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  computeMinimapScrollTopFromPointer,
  computeMinimapRenderMetrics,
  computeMinimapSliderMetrics,
  getMinimapDiffSegmentsForLine,
  minimapHunksToDiffModel,
  type CmMinimapDiffModel,
} from "./cmMinimap";

const cmMinimapSource = readFileSync(new URL("../../../../src/app/regions/right-panel/cmMinimap.ts", import.meta.url), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cm minimap geometry", () => {
  it("pins the minimap frame to the editor surface viewport instead of content width", () => {
    expect(cmMinimapSource).toContain("syncFrameToHost");
    expect(cmMinimapSource).toContain("findRightEdgeHost");
    expect(cmMinimapSource).toContain("findFrameHost");
    expect(cmMinimapSource).toContain("findFixedContainBlock");
    expect(cmMinimapSource).toContain('this.dom.style.position = "fixed"');
    expect(cmMinimapSource).toContain('this.dom.style.right = "0"');
    expect(cmMinimapSource).toContain("ResizeObserver");
    expect(cmMinimapSource).toContain('el.classList.contains("adl-tool-surface")');
    expect(cmMinimapSource).toContain('el.classList.contains("adl-tool-editor")');
  });

  it("keeps the slider proportional to the visible scroll range", () => {
    expect(computeMinimapSliderMetrics({
      scrollTop: 200,
      scrollHeight: 1000,
      clientHeight: 250,
      trackHeight: 500,
    })).toEqual({
      visible: true,
      top: 100,
      height: 125,
    });
  });

  it("keeps fixed sliders the same size across short and long scroll ranges", () => {
    const shortDocument = computeMinimapSliderMetrics({
      scrollTop: 100,
      scrollHeight: 900,
      clientHeight: 300,
      trackHeight: 600,
      sliderBehavior: "fixed",
      fixedHeight: 96,
    });
    const longDocument = computeMinimapSliderMetrics({
      scrollTop: 100,
      scrollHeight: 3000,
      clientHeight: 300,
      trackHeight: 600,
      sliderBehavior: "fixed",
      fixedHeight: 96,
    });

    expect(shortDocument.height).toBe(96);
    expect(longDocument.height).toBe(96);
  });

  it("maps fixed slider travel to the real editor scroll range", () => {
    expect(computeMinimapSliderMetrics({
      scrollTop: 600,
      scrollHeight: 900,
      clientHeight: 300,
      trackHeight: 600,
      sliderBehavior: "fixed",
      fixedHeight: 96,
    })).toEqual({
      visible: true,
      top: 504,
      height: 96,
    });
  });

  it("preserves the pointer offset while dragging the slider", () => {
    expect(computeMinimapScrollTopFromPointer({
      pointerY: 270,
      trackTop: 20,
      dragOffsetY: 50,
      scrollHeight: 1200,
      clientHeight: 300,
      trackHeight: 600,
      sliderHeight: 150,
    })).toBe(400);
  });

  it("does not stretch short documents to the full minimap height", () => {
    expect(computeMinimapRenderMetrics({
      lineCount: 5,
      containerHeight: 500,
      maxLineHeight: 2,
    })).toEqual({
      lineHeight: 2,
      renderHeight: 10,
    });
  });

  it("fits long documents into the available minimap height", () => {
    expect(computeMinimapRenderMetrics({
      lineCount: 1000,
      containerHeight: 500,
      maxLineHeight: 2,
    })).toEqual({
      lineHeight: 0.5,
      renderHeight: 500,
    });
  });
});

describe("cm minimap settings", () => {
  it("migrates legacy native scrollbar settings to the app-owned standard rail", async () => {
    const storage = new Map<string, string>([
      ["adl-minimap-settings", JSON.stringify({ scrollbarType: "native" })],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });

    const { loadMinimapSettings } = await import("./cmMinimap");

    expect(loadMinimapSettings().scrollbarType).toBe("standard");
  });

  it("keeps a right-click target when standard scrollbar mode is selected", () => {
    expect(cmMinimapSource).toContain('this.dom.addEventListener("contextmenu", this.handleContextMenu)');
    expect(cmMinimapSource).toContain("adl-cm-minimap--standard");
    expect(cmMinimapSource).not.toContain('this.dom.style.display = "none"');
  });

  it("keeps the context menu singleton instead of stacking duplicate cards", () => {
    expect(cmMinimapSource).toContain("closeActiveMinimapMenu()");
    expect(cmMinimapSource).toContain('const MINIMAP_MENU_ROOT_ID = "adl-cm-minimap-context-menu-root"');
    expect(cmMinimapSource).toContain("activeMinimapMenuCleanup");
  });

  it("supports scoped minimap settings for independent editor surfaces", () => {
    expect(cmMinimapSource).toContain("scopeId?: string");
    expect(cmMinimapSource).toContain("loadMinimapSettings(this.options.scopeId)");
    expect(cmMinimapSource).toContain("saveMinimapSettings(this.settings, this.options.scopeId)");
  });

  it("uses renderCharacters and slider prominence settings in rendering and styling", () => {
    expect(cmMinimapSource).toContain("this.settings.renderCharacters");
    expect(cmMinimapSource).toContain("this.settings.sliderProminence");
    expect(cmMinimapSource).toContain("adl-cm-minimap-slider--");
  });

  it("shows mode-specific menu groups for minimap and standard scrollbar modes", () => {
    expect(cmMinimapSource).toContain("const modeSpecificItems");
    expect(cmMinimapSource).toContain('settings.scrollbarType === "minimap"');
    expect(cmMinimapSource).toContain('label: "渲染字符"');
    expect(cmMinimapSource).toContain('label: "缩放: 100%"');
    expect(cmMinimapSource).toContain('label: "宽度: 80px"');
    expect(cmMinimapSource).toContain('createModeButton("滑动条: Minimap"');
    expect(cmMinimapSource).not.toContain('label: "滑块样式: 强"');
  });

  it("adds separators between the requested minimap menu groups", () => {
    expect(cmMinimapSource).toContain("createSeparator()");
    expect(cmMinimapSource).toContain('label: "渲染字符"');
    expect(cmMinimapSource).toContain('label: "滑块: 按比例"');
    expect(cmMinimapSource).toContain('label: "宽度: 100px"');
    expect(cmMinimapSource).toContain('label: "滑块样式: 标准"');
  });

  it("renders the checkmark in a fixed trailing slot instead of prefixing the label", () => {
    expect(cmMinimapSource).toContain('label.className = "adl-cm-minimap-menu-item__label"');
    expect(cmMinimapSource).toContain('check.className = "adl-cm-minimap-menu-item__check"');
    expect(cmMinimapSource).toContain('check.textContent = item.checked ? "√" : ""');
  });

  it("keeps the menu open after toggling an option and refreshes its contents in place", () => {
    expect(cmMinimapSource).toContain("const renderMenuContent = () => {");
    expect(cmMinimapSource).toContain("menu.replaceChildren();");
    expect(cmMinimapSource).toContain("renderMenuContent();");
    expect(cmMinimapSource).toContain('menu.addEventListener("click", (event) => {');
    expect(cmMinimapSource).toContain("event.stopPropagation();");
    expect(cmMinimapSource).not.toContain('el.addEventListener("click", () => {\n          item.onClick();\n          menu.remove();');
    expect(cmMinimapSource).not.toContain('button.addEventListener("click", () => {\n          onClick();\n          menu.remove();');
  });
});

describe("cm minimap diff model", () => {
  it("keeps red and green segments on the same visual line", () => {
    const model: CmMinimapDiffModel = {
      totalLines: 3,
      lineColumns: [4, 14, 4],
      ranges: [
        { startLine: 2, endLine: 2, type: "insert", tone: "strong", contentColumns: 14 },
        { startLine: 2, endLine: 2, type: "delete", tone: "strong", contentColumns: 9 },
      ],
    };

    expect(getMinimapDiffSegmentsForLine(model, 2)).toEqual([
      { type: "delete", tone: "strong", contentColumns: 9, lane: 0, laneCount: 2 },
      { type: "insert", tone: "strong", contentColumns: 14, lane: 1, laneCount: 2 },
    ]);
  });

  it("converts legacy hunk decorations into a complete minimap model", () => {
    expect(minimapHunksToDiffModel([
      { startLine: 1, endLine: 2, changeKind: "added", decision: "pending", hunkId: "a" },
      { startLine: 4, endLine: 4, changeKind: "modified", decision: "pending", hunkId: "m" },
      { startLine: 5, endLine: 5, changeKind: "deleted", decision: "pending", hunkId: "d" },
    ], 8)).toEqual({
      totalLines: 8,
      lineColumns: undefined,
      ranges: [
        { startLine: 1, endLine: 2, type: "insert", tone: "base", contentColumns: 1 },
        { startLine: 4, endLine: 4, type: "insert", tone: "strong", contentColumns: 1 },
        { startLine: 4, endLine: 4, type: "delete", tone: "strong", contentColumns: 1 },
        { startLine: 5, endLine: 5, type: "delete", tone: "base", contentColumns: 1 },
      ],
    });
  });
});
