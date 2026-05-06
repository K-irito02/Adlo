import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cmThemeSource = readFileSync(new URL("../../../../src/app/regions/right-panel/cmTheme.ts", import.meta.url), "utf8");
const codeEditorSource = readFileSync(new URL("../../../../src/app/regions/right-panel/CodeEditor.tsx", import.meta.url), "utf8");
const diffViewerSource = readFileSync(new URL("../../../../src/app/regions/right-panel/DiffViewer.tsx", import.meta.url), "utf8");
const regionsCssSource = readFileSync(new URL("../../../../src/styles/regions.css", import.meta.url), "utf8");

describe("CodeMirror preview styling", () => {
  it("uses the custom theme as the only syntax highlight source", () => {
    expect(codeEditorSource).toContain("getThemeExtension(theme)");
    expect(diffViewerSource).toContain("getThemeExtension(theme)");
    expect(codeEditorSource).not.toContain("defaultHighlightStyle");
    expect(diffViewerSource).not.toContain("defaultHighlightStyle");
  });

  it("renders diff state with quiet line backgrounds instead of vertical status rails", () => {
    expect(cmThemeSource).toContain(".cm-deletedLine");
    expect(cmThemeSource).toContain(".cm-insertedLine");
    expect(cmThemeSource).toContain(".cm-changedLine");
    expect(diffViewerSource).toContain("gutter: false");
    expect(diffViewerSource).not.toContain("gutter: true");
    expect(cmThemeSource).not.toContain("inset 3px 0 0");
    expect(regionsCssSource).not.toContain("inset 3px 0 0");
  });

  it("keeps CodeMirror editor and diff surfaces independent from legacy Monaco selectors", () => {
    expect(regionsCssSource).toContain(".adl-cm-diff-viewer .cm-insertedLine");
    expect(regionsCssSource).toContain(".adl-markdown-preview .adl-md-code-header + pre.hljs");
    expect(regionsCssSource).not.toContain(".monaco-diff-editor");
    expect(regionsCssSource).not.toContain(".monaco-editor");
  });

  it("keeps agent annotations in the content area without an extra gutter column", () => {
    expect(regionsCssSource).not.toContain(".adl-tool-editor .adl-agent-gutter");
    expect(regionsCssSource).not.toContain(".adl-agent-gutter-marker");
    expect(cmThemeSource).not.toContain("AGENT_GUTTER_INSERT_CLASS");
    expect(cmThemeSource).toContain('borderRight: "none"');
    expect(cmThemeSource).toContain('paddingRight: "0"');
    expect(cmThemeSource).toContain('outline: "none"');
  });
});
