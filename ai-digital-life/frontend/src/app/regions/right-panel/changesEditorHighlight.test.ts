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

describe("changes preview highlight theming", () => {
  it("removes Monaco find-match borders so inline diff highlights do not fall back to yellow outlines", () => {
    expect(monacoThemeSource).toContain('colors["editor.findMatchBorder"] = "#00000000";');
    expect(monacoThemeSource).toContain('colors["editor.findMatchHighlightBorder"] = "#00000000";');
    expect(monacoThemeSource).toContain('colors["editor.findRangeHighlightBorder"] = "#00000000";');
  });

  it("uses accent-based find-match colors instead of warning yellow in both themes", () => {
    expect(themeCss).toContain("--editor-findMatch: rgba(37, 99, 235, 0.18);");
    expect(themeCss).toContain("--editor-findMatch-highlight: rgba(37, 99, 235, 0.1);");
    expect(themeCss).toContain("--editor-findMatch: rgba(96, 165, 250, 0.2);");
    expect(themeCss).toContain("--editor-findMatch-highlight: rgba(96, 165, 250, 0.12);");
    expect(themeCss).not.toContain("--editor-findMatch: rgba(251, 191, 36, 0.24);");
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
