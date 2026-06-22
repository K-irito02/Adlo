// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editorSurfaceShellSource = readFileSync(
  new URL('./EditorSurfaceShell.tsx', import.meta.url),
  'utf8'
);
const useWrapColumnSource = readFileSync(
  new URL('./hooks/useWrapColumn.ts', import.meta.url),
  'utf8'
);

describe('files panel editor options', () => {
  it('uses CodeMirror editor with agent decoration extensions', () => {
    expect(editorSurfaceShellSource).toContain('CodeEditor');
    expect(editorSurfaceShellSource).toContain('getAgentDecorationExtensions');
  });

  it('uses the shared custom CodeMirror fold gutter marker and tooltip overlay', () => {
    const codeEditorSource = readFileSync(
      new URL('../../features/editor/CodeEditor.tsx', import.meta.url),
      'utf8'
    );

    expect(codeEditorSource).toContain('createFoldGutterExtension');
    expect(codeEditorSource).toContain('FoldTooltipOverlay');
    expect(codeEditorSource).not.toContain('foldGutter()');
  });

  it('computes diff wrapping from the active editor layout', () => {
    expect(useWrapColumnSource).toContain('estimateWrapColumn');
    expect(editorSurfaceShellSource).toContain('useWrapColumn');
  });

  it('passes collapseUnchanged to file diffs', () => {
    expect(editorSurfaceShellSource).toContain('collapseUnchanged');
  });

  it('does not use Monaco editor', () => {
    expect(editorSurfaceShellSource).not.toContain('@monaco-editor/react');
    expect(editorSurfaceShellSource).not.toContain('minimap:');
    expect(editorSurfaceShellSource).not.toContain('scrollbar:');
  });
});
