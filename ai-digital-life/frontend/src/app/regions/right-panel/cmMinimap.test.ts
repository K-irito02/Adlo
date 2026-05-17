import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  computeMinimapContentTrackMetrics,
  computeMinimapFixedSliderHeight,
  computeMinimapScrollTopFromPointer,
  computeMinimapRenderMetrics,
  computeMinimapSliderMetrics,
  getMinimapDiffSegmentsForLine,
  measureMinimapContentMetrics,
  minimapHunksToDiffModel,
  toDomScrollTop,
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
      trackHeight: 600,
      sliderHeight: 150,
      contentScrollHeight: 1200,
      contentViewportHeight: 300,
    })).toBe(400);
  });

  it("measures content scroll geometry independently from editor breathing space", () => {
    expect(measureMinimapContentMetrics({
      scrollTop: 100,
      scrollHeight: 1400,
      clientHeight: 400,
      contentTopInset: 20,
      contentBottomInset: 100,
    })).toEqual({
      contentTopInset: 20,
      contentBottomInset: 100,
      contentScrollHeight: 1280,
      contentViewportHeight: 400,
      contentScrollTop: 80,
    });
  });

  it("maps slider size and position to the readable content area instead of raw scroll height", () => {
    expect(computeMinimapSliderMetrics({
      scrollTop: 100,
      scrollHeight: 1400,
      clientHeight: 400,
      trackHeight: 560,
      contentTopInset: 20,
      contentBottomInset: 100,
    })).toEqual({
      visible: true,
      top: 35,
      height: 175,
    });
  });

  it("converts content-space drag targets back into DOM scroll positions", () => {
    const contentScrollTop = computeMinimapScrollTopFromPointer({
      pointerY: 295,
      trackTop: 20,
      dragOffsetY: 50,
      trackHeight: 600,
      sliderHeight: 150,
      contentScrollHeight: 1280,
      contentViewportHeight: 400,
    });

    expect(contentScrollTop).toBe(440);
    expect(toDomScrollTop(contentScrollTop, {
      contentTopInset: 20,
      contentScrollHeight: 1280,
      contentViewportHeight: 400,
    })).toBe(460);
  });

  it("keeps the top drag position pinned to the actual DOM top instead of jumping into top padding", () => {
    expect(toDomScrollTop(0, {
      contentTopInset: 20,
      contentScrollHeight: 1280,
      contentViewportHeight: 380,
    })).toBe(0);
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

  it("scales the fixed minimap slider height with zoom while staying inside the viewport", () => {
    expect(computeMinimapFixedSliderHeight(400, 0.5)).toBe(48);
    expect(computeMinimapFixedSliderHeight(400, 1)).toBe(96);
    expect(computeMinimapFixedSliderHeight(400, 1.5)).toBe(144);
    expect(computeMinimapFixedSliderHeight(160, 2)).toBe(160);
  });

  it("expands the minimap content track for long files instead of crushing everything into the viewport", () => {
    expect(computeMinimapContentTrackMetrics({
      viewportHeight: 500,
      contentScrollHeight: 4000,
      contentViewportHeight: 500,
      contentScrollTop: 1750,
      fixedSliderHeight: 96,
      naturalContentHeight: 600,
    })).toEqual({
      contentHeight: 768,
      contentOffset: 134,
    });
  });

  it("keeps short files inside the viewport without inventing internal minimap scrolling", () => {
    expect(computeMinimapContentTrackMetrics({
      viewportHeight: 500,
      contentScrollHeight: 320,
      contentViewportHeight: 320,
      contentScrollTop: 0,
      fixedSliderHeight: 96,
      naturalContentHeight: 120,
    })).toEqual({
      contentHeight: 120,
      contentOffset: 0,
    });
  });

  it("lets zoom grow the minimap content track for scrollable files instead of only changing the slider", () => {
    expect(computeMinimapContentTrackMetrics({
      viewportHeight: 500,
      contentScrollHeight: 1200,
      contentViewportHeight: 500,
      contentScrollTop: 200,
      fixedSliderHeight: 48,
      naturalContentHeight: 900,
    })).toEqual({
      contentHeight: 900,
      contentOffset: 114,
    });
  });

  it("keeps medium files on their natural minimap height until the content itself exceeds the viewport", () => {
    expect(computeMinimapContentTrackMetrics({
      viewportHeight: 500,
      contentScrollHeight: 1200,
      contentViewportHeight: 500,
      contentScrollTop: 200,
      fixedSliderHeight: 48,
      naturalContentHeight: 480,
    })).toEqual({
      contentHeight: 480,
      contentOffset: 0,
    });
  });

  it("uses the visible minimap content height as the slider track when the content does not fill the viewport", () => {
    expect(computeMinimapSliderMetrics({
      scrollTop: 300,
      scrollHeight: 1200,
      clientHeight: 500,
      trackHeight: 480,
      sliderBehavior: "fixed",
      fixedHeight: 48,
    })).toEqual({
      visible: true,
      top: 185.14285714285714,
      height: 48,
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

  it("cleans up scroll listeners when the scroll host changes or the plugin is destroyed", () => {
    expect(cmMinimapSource).toContain('this.scrollElement.addEventListener("scroll", this.handleEditorScroll, { passive: true })');
    expect(cmMinimapSource).toContain('this.scrollElement.removeEventListener("scroll", this.handleEditorScroll);');
    expect(cmMinimapSource).toContain("private refreshScrollElement()");
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
    expect(cmMinimapSource).toContain("measureMinimapContentMetrics");
    expect(cmMinimapSource).toContain("toDomScrollTop");
  });

  it("limits slider travel to the actual rendered minimap content height", () => {
    expect(cmMinimapSource).toContain("private getTrackMetrics(scrollElement: HTMLElement = this.scrollElement)");
    expect(cmMinimapSource).toContain("trackHeight: trackMetrics.trackHeight");
    expect(cmMinimapSource).toContain('this.slider.style.top = `${trackMetrics.top + metrics.top}px`;');
    expect(cmMinimapSource).toContain("trackTop: rect.top + trackMetrics.top");
  });

  it("uses CodeMirror visual block metrics so word wrap changes minimap height mapping", () => {
    expect(cmMinimapSource).toContain("private getDocumentLineColumns()");
    expect(cmMinimapSource).toContain("estimateWrapColumn(this.view)");
    expect(cmMinimapSource).toContain("view.lineWrapping");
    expect(cmMinimapSource).toContain("const contentWidth = view.contentDOM.clientWidth");
  });

  it("shows mode-specific menu groups for minimap and standard scrollbar modes", () => {
    expect(cmMinimapSource).toContain("const modeSpecificItems");
    expect(cmMinimapSource).toContain('settings.scrollbarType === "minimap"');
    expect(cmMinimapSource).toContain('label: "渲染字符"');
    expect(cmMinimapSource).toContain('label: "100%"');
    expect(cmMinimapSource).toContain('label: "80px"');
    expect(cmMinimapSource).toContain('createModeButton("缩略图"');
    expect(cmMinimapSource).not.toContain('label: "滑块样式: 强"');
    expect(cmMinimapSource).not.toContain('label: "滑块: 按比例"');
    expect(cmMinimapSource).not.toContain('label: "滑块: 固定"');
  });

  it("uses a fixed minimap slider that scales with zoom and drives a taller content track for long files", () => {
    expect(cmMinimapSource).toContain("computeMinimapFixedSliderHeight");
    expect(cmMinimapSource).toContain("computeMinimapContentTrackMetrics");
    expect(cmMinimapSource).toContain("private getNaturalMinimapContentHeight(viewportHeight: number)");
    expect(cmMinimapSource).toContain("naturalContentHeight");
    expect(cmMinimapSource).toContain("contentOffset");
    expect(cmMinimapSource).not.toContain("fallbackContentHeight");
  });

  it("re-renders on editor reconfigure and content geometry changes so wrap toggles refresh immediately", () => {
    expect(cmMinimapSource).toContain("update.transactions.some(tr => tr.reconfigured)");
    expect(cmMinimapSource).toContain("this.resizeObserver.observe(this.scrollElement)");
    expect(cmMinimapSource).toContain("this.resizeObserver.observe(contentElement)");
  });

  it("adds separators between the requested minimap menu groups and uses group labels", () => {
    expect(cmMinimapSource).toContain("createSeparator()");
    expect(cmMinimapSource).toContain('label: "渲染字符"');
    expect(cmMinimapSource).toContain('label: "100px"');
    expect(cmMinimapSource).toContain('label: "滑块突出"');
    expect(cmMinimapSource).toContain('group: true');
  });

  it("keeps standard scrollbar geometry separate from minimap content-track geometry", () => {
    expect(cmMinimapSource).toContain("private getStandardTrackMetrics(scrollElement: HTMLElement = this.scrollElement)");
    expect(cmMinimapSource).toContain("private getMinimapTrackMetrics(scrollElement: HTMLElement = this.scrollElement)");
    expect(cmMinimapSource).toContain('return this.settings.scrollbarType === "standard"');
    expect(cmMinimapSource).toContain("trackHeight: viewportHeight");
    expect(cmMinimapSource).toContain("contentHeight: viewportHeight");
    expect(cmMinimapSource).toContain('return "proportional";');
  });

  it("keeps the standard rail width independent from the previous minimap width", () => {
    expect(cmMinimapSource).toContain('this.dom.style.width = `${width}px`;');
    expect(cmMinimapSource).toContain('this.dom.style.setProperty("--adl-cm-minimap-width"');
    expect(cmMinimapSource).toContain('wrapper.style.setProperty("--adl-editor-minimap-width"');
    expect(cmMinimapSource).toContain('void (wrapper ?? this.scrollElement).offsetHeight');
  });

  it("hides native scrollbars via CSS class when the minimap is active", () => {
    expect(cmMinimapSource).not.toContain('this.scrollElement.style.setProperty("scrollbar-width", "none");');
    expect(cmMinimapSource).toContain('this.scrollElement.classList.add("adl-cm-scroller--minimap-scrollbar");');
  });

  it("uses active class with ::before indicator instead of trailing checkmark", () => {
    expect(cmMinimapSource).not.toContain('label.className = "adl-cm-minimap-menu-item__label"');
    expect(cmMinimapSource).not.toContain('check.className = "adl-cm-minimap-menu-item__check"');
    expect(cmMinimapSource).not.toContain('check.textContent = item.checked ? "√" : ""');
    expect(cmMinimapSource).toContain('adl-cm-minimap-menu-item--active');
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
