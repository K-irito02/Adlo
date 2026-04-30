import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const regionsCss = readFileSync(new URL("../../../../src/styles/regions.css", import.meta.url), "utf8");

function getRuleBody(selector: string) {
  const selectorStart = regionsCss.indexOf(selector);
  expect(selectorStart, `Missing CSS rule for selector: ${selector}`).toBeGreaterThanOrEqual(0);
  const blockStart = regionsCss.indexOf("{", selectorStart);
  const blockEnd = regionsCss.indexOf("}", blockStart);
  expect(blockStart).toBeGreaterThan(selectorStart);
  expect(blockEnd).toBeGreaterThan(blockStart);
  return regionsCss.slice(blockStart + 1, blockEnd);
}

describe("changes preview gutter spacing", () => {
  it("keeps the original pane near the center divider without clipping inline or modified line numbers", () => {
    const sharedRule = getRuleBody(".adl-tool-editor--changes .monaco-editor .margin-view-overlays .line-numbers");
    const originalRule = getRuleBody(
      ".adl-tool-editor--changes .monaco-diff-editor.side-by-side .monaco-editor.original-in-monaco-diff-editor .margin-view-overlays .line-numbers"
    );
    const modifiedInlineRule = getRuleBody(
      ".adl-tool-editor--changes .monaco-diff-editor.side-by-side .monaco-editor.modified-in-monaco-diff-editor .margin-view-overlays .line-numbers,\n.adl-tool-editor--changes .monaco-diff-editor:not(.side-by-side) .margin-view-overlays .line-numbers"
    );

    expect(sharedRule).toContain("box-sizing: border-box;");
    expect(sharedRule).toContain("width: 100% !important;");
    expect(sharedRule).toContain("transform: none !important;");
    expect(sharedRule).not.toContain("text-align: right !important;");

    expect(originalRule).toContain("text-align: right !important;");
    expect(originalRule).toContain("padding-right: 10px !important;");

    expect(modifiedInlineRule).toContain("display: flex !important;");
    expect(modifiedInlineRule).toContain("justify-content: flex-start !important;");
    expect(modifiedInlineRule).toContain("padding-left: 8px !important;");
    expect(modifiedInlineRule).toContain("padding-right: 12px !important;");
    expect(modifiedInlineRule).toContain("text-align: left !important;");
    expect(modifiedInlineRule).toContain("overflow: visible !important;");

    expect(regionsCss).toContain(".original-in-monaco-diff-editor .margin-view-overlays .line-numbers");
    expect(regionsCss).toContain(".modified-in-monaco-diff-editor .margin-view-overlays .line-numbers");
    expect(regionsCss).toContain(".monaco-diff-editor:not(.side-by-side) .margin-view-overlays .line-numbers");
  });

  it("keeps the inline minimap visible with a taller slider rail", () => {
    const inlineMinimapRule = getRuleBody(
      ".adl-tool-editor--changes .monaco-diff-editor:not(.side-by-side) .editor.modified .minimap"
    );
    const inlineScrollbarRule = getRuleBody(
      ".adl-tool-editor--changes .monaco-diff-editor:not(.side-by-side) .editor.modified .scrollbar.vertical"
    );
    const inlineSliderRule = getRuleBody(
      ".adl-tool-editor--changes .monaco-diff-editor:not(.side-by-side) .editor.modified .minimap-slider"
    );

    expect(inlineMinimapRule).toContain("right: 0 !important;");
    expect(inlineMinimapRule).toContain("background: var(--editor-bg) !important;");
    expect(inlineMinimapRule).not.toContain("border-left");
    expect(inlineMinimapRule).toContain("inset -1px 0 0 rgba(0, 0, 0, 0.18)");
    expect(inlineMinimapRule).toContain("-2px 2px 6px rgba(0, 0, 0, 0.08)");
    expect(inlineMinimapRule).not.toContain("filter:");
    expect(inlineScrollbarRule).toContain("right: 0 !important;");
    expect(inlineScrollbarRule).toContain("left: auto");

    const inlineDarkRule = getRuleBody(
      '[data-theme="dark"] .adl-tool-editor--changes .monaco-diff-editor:not(.side-by-side) .editor.modified .minimap'
    );
    expect(inlineDarkRule).toContain("inset -1px 0 0 rgba(0, 0, 0, 0.80)");

    expect(inlineSliderRule).toContain("left: 0 !important;");
    expect(inlineSliderRule).toContain("min-height: 40px !important;");
    expect(inlineSliderRule).toContain("max-height: 40% !important;");
    expect(inlineSliderRule).toContain("background: var(--surface-hover) !important;");
  });

  it("keeps the standard editor minimap visible with a consistent slider rail", () => {
    const standardMinimapRule = getRuleBody(
      ".adl-tool-editor:not(.adl-tool-editor--changes) .monaco-editor .minimap"
    );
    const standardScrollbarRule = getRuleBody(
      ".adl-tool-editor:not(.adl-tool-editor--changes) .monaco-editor .scrollbar.vertical"
    );
    const standardSliderRule = getRuleBody(
      ".adl-tool-editor:not(.adl-tool-editor--changes) .monaco-editor .minimap-slider"
    );

    expect(standardMinimapRule).toContain("width: 84px !important;");
    expect(standardMinimapRule).toContain("background: var(--editor-bg) !important;");
    expect(standardMinimapRule).not.toContain("border-left");
    expect(standardMinimapRule).toContain("inset -1px 0 0 rgba(0, 0, 0, 0.18)");
    expect(standardMinimapRule).toContain("-2px 2px 6px rgba(0, 0, 0, 0.08)");
    expect(standardMinimapRule).not.toContain("filter:");
    expect(standardMinimapRule).not.toContain("right:");
    expect(standardScrollbarRule).toContain("right: 0 !important;");

    const standardDarkRule = getRuleBody(
      '[data-theme="dark"] .adl-tool-editor:not(.adl-tool-editor--changes) .monaco-editor .minimap'
    );
    expect(standardDarkRule).toContain("inset -1px 0 0 rgba(0, 0, 0, 0.80)");

    expect(standardSliderRule).toContain("width: 84px !important;");
    expect(standardSliderRule).toContain("min-height: 40px !important;");
    expect(standardSliderRule).toContain("max-height: 40% !important;");
    expect(standardSliderRule).toContain("background: var(--surface-hover) !important;");
  });

  it("constrains diff editor width in changes panel", () => {
    const diffEditorRule = getRuleBody(".adl-tool-editor--changes .monaco-diff-editor:not(.side-by-side)");

    expect(diffEditorRule).toContain("width: 100%");
  });
});
