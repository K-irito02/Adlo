import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const monacoThemeSource = readFileSync(new URL("../../../../src/app/monacoTheme.ts", import.meta.url), "utf8");
const changesPanelSource = readFileSync(
  new URL("../../../../src/app/regions/right-panel/ChangesPanel.tsx", import.meta.url),
  "utf8"
);
const minimapOverlaySource = readFileSync(
  new URL("../../../../src/app/regions/right-panel/minimapVisualOverlay.ts", import.meta.url),
  "utf8"
);
const themeCss = readFileSync(new URL("../../../../src/styles/themes.css", import.meta.url), "utf8");
const regionsCss = readFileSync(new URL("../../../../src/styles/regions.css", import.meta.url), "utf8");

function extractThemeSection(css: string, marker: string, nextMarker: string | null) {
  const start = css.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = nextMarker ? css.indexOf(nextMarker, start + marker.length) : css.length;
  expect(end).toBeGreaterThan(start);
  return css.slice(start, end);
}

describe("changes preview highlight theming", () => {
  it("removes Monaco find-match borders so inline diff highlights do not fall back to yellow outlines", () => {
    expect(monacoThemeSource).toContain('colors["editor.findMatchBorder"] = "#00000000";');
    expect(monacoThemeSource).toContain('colors["editor.findMatchHighlightBorder"] = "#00000000";');
    expect(monacoThemeSource).toContain('colors["editor.findRangeHighlightBorder"] = "#00000000";');
  });

  it("uses accent-based find-match colors instead of warning yellow in both themes", () => {
    const lightTheme = extractThemeSection(themeCss, '[data-theme="light"] {', '[data-theme="dark"] {');
    const darkTheme = extractThemeSection(themeCss, '[data-theme="dark"] {', null);

    expect(lightTheme).toContain("--editor-findMatch: rgba(37, 99, 235, 0.18);");
    expect(lightTheme).toContain("--editor-findMatch-highlight: rgba(37, 99, 235, 0.1);");
    expect(lightTheme).not.toContain("--editor-findMatch: rgba(96, 165, 250, 0.2);");
    expect(lightTheme).not.toContain("--editor-findMatch: rgba(251, 191, 36, 0.24);");

    expect(darkTheme).toContain("--editor-findMatch: rgba(96, 165, 250, 0.2);");
    expect(darkTheme).toContain("--editor-findMatch-highlight: rgba(96, 165, 250, 0.12);");
    expect(darkTheme).not.toContain("--editor-findMatch: rgba(37, 99, 235, 0.18);");
    expect(darkTheme).not.toContain("--editor-findMatch: rgba(251, 191, 36, 0.24);");
  });

  it("preserves line-level diff backgrounds after border cleanup", () => {
    expect(themeCss).toContain("--editor-diff-insert-bg: rgba(22, 163, 74, 0.12);");
    expect(themeCss).toContain("--editor-diff-remove-bg: rgba(239, 68, 68, 0.12);");
    expect(themeCss).toContain("--editor-diff-insert-bg-strong: rgba(22, 163, 74, 0.18);");
    expect(themeCss).toContain("--editor-diff-remove-bg-strong: rgba(239, 68, 68, 0.18);");
    expect(themeCss).toContain("--editor-diff-insert-bg: rgba(74, 222, 128, 0.14);");
    expect(themeCss).toContain("--editor-diff-remove-bg: rgba(248, 113, 113, 0.14);");
    expect(themeCss).toContain("--editor-diff-insert-bg-strong: rgba(74, 222, 128, 0.2);");
    expect(themeCss).toContain("--editor-diff-remove-bg-strong: rgba(248, 113, 113, 0.2);");
  });

  it("keeps Monaco diff gutter backgrounds transparent so row highlights do not cover line numbers", () => {
    expect(monacoThemeSource).toContain('colors["diffEditorGutter.insertedLineBackground"] = "#00000000";');
    expect(monacoThemeSource).toContain('colors["diffEditorGutter.removedLineBackground"] = "#00000000";');
    expect(monacoThemeSource).not.toContain('colors["diffEditorGutter.insertedLineBackground"] = diffInsertBg;');
    expect(monacoThemeSource).not.toContain('colors["diffEditorGutter.removedLineBackground"] = diffRemoveBg;');
  });

  it("strips runtime find-match classes of fallback borders and shadows", () => {
    expect(regionsCss).toContain(".monaco-editor .findMatch,");
    expect(regionsCss).toContain(".monaco-editor .currentFindMatch,");
    expect(regionsCss).toContain(".monaco-editor .findScope {");
    expect(regionsCss).toContain("border: none !important;");
    expect(regionsCss).toContain("outline: none !important;");
    expect(regionsCss).toContain("box-shadow: none !important;");
  });

  it("keeps inline diff character decorations at Monaco-calculated width", () => {
    expect(regionsCss).toContain(".editor.modified .cdr.line-insert,");
    expect(regionsCss).toContain(".editor.modified .cdr.line-delete {");
    expect(regionsCss).not.toContain(".editor.modified .cdr {\n  width: 100% !important;");
  });

  it("removes duplicated inline character diff blocks in changes preview", () => {
    expect(regionsCss).toContain(".editor.modified .char-insert,");
    expect(regionsCss).toContain(".editor.modified .char-delete,");
    expect(regionsCss).toContain(".editor.modified .char-insert.diff-range-empty,");
    expect(regionsCss).toContain(".editor.modified .char-delete.diff-range-empty {");
    expect(regionsCss).toContain("background-color: transparent !important;");
    expect(regionsCss).toContain("display: none !important;");
  });

  it("keeps native async line diff backgrounds transparent after preview-owned rows render", () => {
    expect(regionsCss).toContain(".editor.modified .cdr.line-insert,");
    expect(regionsCss).toContain(".editor.modified .cdr.line-delete {");
    expect(regionsCss).toContain("background-color: transparent !important;");
  });

  it("uses preview-owned depth classes for inline diff row backgrounds", () => {
    expect(changesPanelSource).toContain("computePreviewDiffVisualRanges");
    expect(changesPanelSource).toContain("computePreviewDiffMinimapModel");
    expect(changesPanelSource).toContain("estimateEditorWrapColumn");
    expect(changesPanelSource).toContain("changePreviewMinimapOptions");
    expect(changesPanelSource).toContain("wrapColumn: wordWrapEnabled ? changePreviewWrapColumn : null");
    expect(changesPanelSource).toContain("displayOptionChange");
    expect(changesPanelSource).toContain("setChangePreviewWrapColumn(wordWrapEnabled ? estimateEditorWrapColumn(modifiedEditor) : null)");
    expect(changesPanelSource).toContain("adl-inline-diff-line--${range.tone}");
    expect(regionsCss).toContain(".adl-inline-diff-line--insert.adl-inline-diff-line--strong");
    expect(regionsCss).toContain("background-color: var(--editor-diff-insert-bg-strong) !important;");
    expect(regionsCss).toContain(".adl-inline-diff-line--delete.adl-inline-diff-line--strong");
    expect(regionsCss).toContain("background-color: var(--editor-diff-remove-bg-strong) !important;");
    expect(regionsCss).not.toContain("editor-diff-insert-accent");
    expect(regionsCss).not.toContain("editor-diff-remove-accent");
  });

  it("disables Monaco unicode warning boxes in changes preview", () => {
    expect(changesPanelSource).toContain("unicodeHighlight: {");
    expect(changesPanelSource).toContain("ambiguousCharacters: false");
    expect(changesPanelSource).toContain("invisibleCharacters: false");
    expect(changesPanelSource).toContain("nonBasicASCII: false");
    expect(regionsCss).toContain(".adl-tool-editor--changes .monaco-diff-editor .unicode-highlight {");
    expect(regionsCss).toContain("background-color: transparent !important;");
  });

  it("strips async Monaco diff decoration borders on every side", () => {
    expect(minimapOverlaySource).toContain('"border-top"');
    expect(minimapOverlaySource).toContain('"border-right"');
    expect(minimapOverlaySource).toContain('"border-bottom"');
    expect(minimapOverlaySource).toContain('"border-left"');
    expect(minimapOverlaySource).toContain('node.style.setProperty("border-color", "transparent", "important");');
    expect(minimapOverlaySource).toContain('node.style.setProperty("outline-color", "transparent", "important");');
  });
});
