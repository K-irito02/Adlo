import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const regionsCss = readFileSync(new URL("../../../../src/styles/regions.css", import.meta.url), "utf8");

function getRuleBody(selector: string) {
  const normalizedCss = regionsCss.replace(/\r\n/g, "\n");
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+");
  const selectorPattern = new RegExp(`${escapedSelector}\\s*\\{`);
  const match = selectorPattern.exec(normalizedCss);
  const selectorStart = match?.index ?? -1;
  expect(selectorStart, `Missing CSS rule for selector: ${selector}`).toBeGreaterThanOrEqual(0);
  const blockStart = normalizedCss.indexOf("{", selectorStart);
  const blockEnd = normalizedCss.indexOf("}", blockStart);
  expect(blockStart).toBeGreaterThan(selectorStart);
  expect(blockEnd).toBeGreaterThan(blockStart);
  return normalizedCss.slice(blockStart + 1, blockEnd);
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

  it("keeps the inline minimap visible with the same rail width as files", () => {
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
    expect(inlineMinimapRule).toContain("--adl-minimap-slider-visual-height: 48px;");
    expect(inlineMinimapRule).toContain("width: 84px !important;");
    expect(inlineMinimapRule).toContain("max-width: 84px !important;");
    expect(inlineMinimapRule).toContain("overflow: hidden !important;");
    expect(inlineMinimapRule).toContain("background: var(--editor-bg) !important;");
    expect(inlineMinimapRule).not.toContain("border-left");
    expect(inlineMinimapRule).toContain("inset -1px 0 0 rgba(0, 0, 0, 0.18)");
    expect(inlineMinimapRule).toContain("-2px 2px 6px rgba(0, 0, 0, 0.08)");
    expect(inlineMinimapRule).not.toContain("filter:");
    expect(inlineScrollbarRule).toContain("display: none !important;");
    expect(inlineScrollbarRule).toContain("width: 0 !important;");

    const inlineDarkRule = getRuleBody(
      '[data-theme="dark"] .adl-tool-editor--changes .monaco-diff-editor:not(.side-by-side) .editor.modified .minimap'
    );
    expect(inlineDarkRule).toContain("inset -1px 0 0 rgba(0, 0, 0, 0.80)");

    expect(inlineSliderRule).toContain("left: 0 !important;");
    expect(inlineSliderRule).toContain("right: 0 !important;");
    expect(inlineSliderRule).toContain("width: 100% !important;");
    expect(inlineSliderRule).not.toContain("min-height:");
    expect(inlineSliderRule).not.toContain("max-height:");
    expect(inlineSliderRule).toContain("background:");
    expect(inlineSliderRule).toContain("transparent");
    expect(regionsCss).toContain(".adl-minimap-slider-visual");
    expect(regionsCss).toContain(".adl-minimap-slider-visual--dragging");
    expect(regionsCss).toContain("cursor: grabbing");
    expect(regionsCss).toContain("z-index: 4;");
    expect(regionsCss).toContain("cursor: grab;");
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
    expect(standardMinimapRule).toContain("--adl-minimap-slider-visual-height: 48px;");
    expect(standardMinimapRule).toContain("overflow: hidden !important;");
    expect(standardMinimapRule).toContain("background: var(--editor-bg) !important;");
    expect(standardMinimapRule).not.toContain("border-left");
    expect(standardMinimapRule).toContain("inset -1px 0 0 rgba(0, 0, 0, 0.18)");
    expect(standardMinimapRule).toContain("-2px 2px 6px rgba(0, 0, 0, 0.08)");
    expect(standardMinimapRule).not.toContain("filter:");
    expect(standardMinimapRule).toContain("right: 0 !important;");
    expect(standardScrollbarRule).toContain("display: none !important;");
    expect(standardScrollbarRule).toContain("width: 0 !important;");

    const standardDarkRule = getRuleBody(
      '[data-theme="dark"] .adl-tool-editor:not(.adl-tool-editor--changes) .monaco-editor .minimap'
    );
    expect(standardDarkRule).toContain("inset -1px 0 0 rgba(0, 0, 0, 0.80)");

    expect(standardSliderRule).toContain("width: 84px !important;");
    expect(standardSliderRule).not.toContain("min-height:");
    expect(standardSliderRule).not.toContain("max-height:");
    expect(standardSliderRule).toContain("background: transparent !important;");
    expect(standardSliderRule).toContain("pointer-events: none !important;");
  });

  it("constrains diff editor width in changes panel", () => {
    const diffEditorRule = getRuleBody(".adl-tool-editor--changes .monaco-diff-editor:not(.side-by-side)");

    expect(diffEditorRule).toContain("width: 100%");
  });

  it("fills inline modified editor internal elements to full width", () => {
    const modifiedInnerRule = getRuleBody(
      ".adl-tool-editor--changes .monaco-diff-editor:not(.side-by-side) .editor.modified .monaco-editor.modified-in-monaco-diff-editor"
    );
    const overflowGuardRule = getRuleBody(
      ".adl-tool-editor--changes .monaco-diff-editor:not(.side-by-side) .editor.modified .overflow-guard"
    );
    const scrollableElementRule = getRuleBody(
      ".adl-tool-editor--changes .monaco-diff-editor:not(.side-by-side) .editor.modified .monaco-scrollable-element"
    );

    expect(modifiedInnerRule).toContain("width: 100% !important;");
    expect(overflowGuardRule).toContain("width: 100% !important;");
    expect(scrollableElementRule).toContain("width: 100% !important;");
  });

  it("uses immediate preview-owned line backgrounds instead of delayed native diff rows", () => {
    const previewLineRule = getRuleBody(
      ".adl-tool-editor--changes .monaco-diff-editor:not(.side-by-side) .editor.modified .view-overlays .adl-inline-diff-line"
    );
    const insertRule = getRuleBody(
      ".adl-tool-editor--changes .monaco-diff-editor:not(.side-by-side) .editor.modified .view-overlays .adl-inline-diff-line--insert"
    );
    const deleteRule = getRuleBody(
      ".adl-tool-editor--changes .monaco-diff-editor:not(.side-by-side) .editor.modified .view-overlays .adl-inline-diff-line--delete"
    );
    const nativeLineRule = getRuleBody(
      ".adl-tool-editor--changes .monaco-diff-editor:not(.side-by-side) .editor.modified .cdr.line-insert,\n.adl-tool-editor--changes .monaco-diff-editor:not(.side-by-side) .editor.modified .cdr.line-delete"
    );

    expect(previewLineRule).toContain("left: 0 !important;");
    expect(previewLineRule).toContain("width: 100% !important;");
    expect(previewLineRule).toContain("right: 0 !important;");
    expect(insertRule).toContain("background-color: var(--editor-diff-insert-bg) !important;");
    expect(deleteRule).toContain("background-color: var(--editor-diff-remove-bg) !important;");
    expect(nativeLineRule).toContain("background-color: transparent !important;");
    expect(nativeLineRule).not.toContain("width: 100% !important;");
  });
});
