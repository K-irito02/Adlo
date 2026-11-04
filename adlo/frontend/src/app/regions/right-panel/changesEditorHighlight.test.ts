// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const changesPanelSource = readFileSync(
  new URL('../../../../src/app/regions/right-panel/panels/ChangesPanel.tsx', import.meta.url),
  'utf8',
);
const themeCss = readFileSync(
  new URL('../../../../src/styles/themes.css', import.meta.url),
  'utf8',
);

function extractThemeSection(css: string, marker: string, nextMarker: string | null) {
  const start = css.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = nextMarker ? css.indexOf(nextMarker, start + marker.length) : css.length;
  expect(end).toBeGreaterThan(start);
  return css.slice(start, end);
}

describe('changes preview highlight theming', () => {
  it('uses accent-based find-match colors instead of warning yellow in both themes', () => {
    const lightTheme = extractThemeSection(
      themeCss,
      "[data-theme='light'] {",
      "[data-theme='dark'] {",
    );
    const darkTheme = extractThemeSection(themeCss, "[data-theme='dark'] {", null);

    expect(lightTheme).toContain('--editor-findMatch: rgba(37, 99, 235, 0.18);');
    expect(lightTheme).toContain('--editor-findMatch-highlight: rgba(37, 99, 235, 0.1);');
    expect(lightTheme).not.toContain('--editor-findMatch: rgba(96, 165, 250, 0.2);');
    expect(lightTheme).not.toContain('--editor-findMatch: rgba(251, 191, 36, 0.24);');

    expect(darkTheme).toContain('--editor-findMatch: rgba(96, 165, 250, 0.2);');
    expect(darkTheme).toContain('--editor-findMatch-highlight: rgba(96, 165, 250, 0.12);');
    expect(darkTheme).not.toContain('--editor-findMatch: rgba(37, 99, 235, 0.18);');
    expect(darkTheme).not.toContain('--editor-findMatch: rgba(251, 191, 36, 0.24);');
  });

  it('does not contain any Monaco imports or references', () => {
    expect(changesPanelSource).not.toContain('@monaco-editor/react');
    expect(changesPanelSource).not.toContain('monacoTheme');
    expect(changesPanelSource).not.toContain('monacoTypes');
    expect(changesPanelSource).not.toContain('minimapVisualOverlay');
    expect(changesPanelSource).not.toContain('inlineMinimapLayout');
    expect(changesPanelSource).not.toContain('deltaDecorations');
    expect(changesPanelSource).not.toContain('from "@monaco-editor/react"');
    expect(changesPanelSource).not.toContain('handleMonacoBeforeMount');
    expect(changesPanelSource).not.toContain('MonacoEditorRef');
    expect(changesPanelSource).not.toContain('MonacoNamespace');
    expect(changesPanelSource).not.toContain('getMonacoFromWindow');
  });
});
