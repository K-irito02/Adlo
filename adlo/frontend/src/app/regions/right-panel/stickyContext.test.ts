// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildStickyContextEntries,
  createStickyContextModel,
  scrollEditorToTop,
  SMOOTH_SCROLL_MAX_VIEWPORTS,
} from './editor-support/stickyContext';
import type { EditorRef } from '@stores/types';

function makeEditor(scrollTop: number, viewportHeight: number) {
  const calls: ({ smooth?: boolean } | { scrollTop: number })[] = [];
  const editor = {
    getScrollTop: () => scrollTop,
    getLayoutInfo: () => ({ height: viewportHeight }),
    scrollToTop: (options?: { smooth?: boolean }) => calls.push(options ?? {}),
    setScrollPosition: (position: { scrollTop: number }) => calls.push(position),
  } as unknown as EditorRef;
  return { editor, calls };
}

describe('stickyContext helpers', () => {
  it('always exposes a file-top entry and falls back to line text when no outline exists', () => {
    const entries = buildStickyContextEntries({
      content: ['alpha', '', 'beta', 'gamma', 'delta'].join('\n'),
      outline: [],
      visibleStartLine: 5,
      maxContextRows: 3,
    });

    expect(entries.map((entry) => entry.line)).toEqual([1, 3, 4]);
    expect(entries.map((entry) => entry.label)).toEqual(['alpha', 'beta', 'gamma']);
    expect(entries.every((entry) => entry.kind === 'line')).toBe(true);
  });

  it('prefers the most recent structural outline context for markdown and code files', () => {
    const entries = buildStickyContextEntries({
      content: [
        '# Overview',
        'intro',
        '## Details',
        'more',
        'function buildModel() {}',
        'tail',
      ].join('\n'),
      outline: [
        { id: 'h1', label: 'Overview', kind: 'heading', line: 1 },
        { id: 'h2', label: 'Details', kind: 'heading', line: 3 },
        { id: 'fn', label: 'buildModel', kind: 'function', line: 5 },
      ],
      visibleStartLine: 6,
      maxContextRows: 3,
    });

    expect(
      entries.map((entry) => ({ kind: entry.kind, label: entry.label, line: entry.line })),
    ).toEqual([
      { kind: 'heading', label: 'Overview', line: 1 },
      { kind: 'heading', label: 'Details', line: 3 },
      { kind: 'function', label: 'buildModel', line: 5 },
    ]);
  });

  it('marks diff-backed entries with change-aware tones from modified/current ranges', () => {
    const entries = buildStickyContextEntries({
      content: ['one', 'two', 'three', 'four'].join('\n'),
      outline: [],
      visibleStartLine: 4,
      maxContextRows: 3,
      diffRanges: [
        { startLine: 2, endLine: 2, type: 'insert', tone: 'strong', contentColumns: 3 },
        { startLine: 3, endLine: 3, type: 'delete', tone: 'base', contentColumns: 3 },
      ],
    });

    expect(entries.map((entry) => entry.tone)).toEqual(['context', 'insert', 'delete']);
  });

  it('creates a model whose navigation delegates to the provided line callback', () => {
    const visited: number[] = [];

    const model = createStickyContextModel({
      canScrollToTop: true,
      onNavigateLine: (line) => visited.push(line),
    });

    model.scrollToTop();

    expect(model.topEntry.kind).toBe('top');
    expect(model.showTopEntry).toBe(true);
    expect(visited).toEqual([1]);
  });

  it('hides the top row when the first real file line is already visible', () => {
    const model = createStickyContextModel({
      canScrollToTop: false,
      onNavigateLine: () => undefined,
    });

    expect(model.showTopEntry).toBe(false);
  });

  it('prefers an explicit scrollToTop callback over line navigation', () => {
    const visited: number[] = [];
    let topCalls = 0;
    const model = createStickyContextModel({
      canScrollToTop: true,
      onNavigateLine: (line) => visited.push(line),
      scrollToTop: () => {
        topCalls += 1;
      },
    });

    model.scrollToTop();

    expect(topCalls).toBe(1);
    expect(visited).toEqual([]);
  });

  it('smooth-scrolls short distances and jumps instantly beyond three viewports', () => {
    const smooth = makeEditor(200, 100);
    scrollEditorToTop(smooth.editor);
    expect(smooth.calls).toEqual([{ smooth: true }]);

    const instant = makeEditor(100 * SMOOTH_SCROLL_MAX_VIEWPORTS + 1, 100);
    scrollEditorToTop(instant.editor);
    expect(instant.calls).toEqual([{ smooth: false }]);
  });

  it('falls back to setScrollPosition when the adapter has no scrollToTop', () => {
    const positions: { scrollTop: number }[] = [];
    const editor = {
      getScrollTop: () => 500,
      getLayoutInfo: () => ({ height: 100 }),
      setScrollPosition: (position: { scrollTop: number }) => positions.push(position),
    } as unknown as EditorRef;

    scrollEditorToTop(editor);

    expect(positions).toEqual([{ scrollTop: 0 }]);
  });
});

describe('sticky context panel wiring', () => {
  const editorSurfaceShellSource = readFileSync(
    new URL('./EditorSurfaceShell.tsx', import.meta.url),
    'utf8',
  );
  const useStickyContextSource = readFileSync(
    new URL('./hooks/useStickyContext.ts', import.meta.url),
    'utf8',
  );

  it('renders sticky context above the files editor surface in both editor modes', () => {
    expect(editorSurfaceShellSource).toContain('StickyContext');
    expect(editorSurfaceShellSource).toContain('data-testid="files-sticky-context"');
    expect(editorSurfaceShellSource).toContain('setEditorMountVersion');
    expect(useStickyContextSource).toContain('buildStickyContextEntries');
    expect(useStickyContextSource).toContain('createStickyContextModel');
    expect(useStickyContextSource).toContain('editorMountVersion');
  });

  it('renders sticky context above the changes preview surface', () => {
    const diffEditorSectionSource = readFileSync(
      new URL('./panels/DiffEditorSection.tsx', import.meta.url),
      'utf8',
    );
    expect(diffEditorSectionSource).toContain('StickyContext');
    expect(diffEditorSectionSource).toContain('data-testid="changes-sticky-context"');
    expect(useStickyContextSource).toContain('buildStickyContextEntries');
    expect(useStickyContextSource).toContain('createStickyContextModel');
  });

  it('renders sticky context on preview surfaces (markdown / media / office)', () => {
    const previewRenderersSource = readFileSync(
      new URL('./FilePreviewRenderers.tsx', import.meta.url),
      'utf8',
    );
    expect(previewRenderersSource).toContain('files-preview-sticky-context');
    expect(editorSurfaceShellSource).toContain('usePreviewStickyContext');
    const diffEditorSectionSource = readFileSync(
      new URL('./panels/DiffEditorSection.tsx', import.meta.url),
      'utf8',
    );
    expect(diffEditorSectionSource).toContain('changes-preview-sticky-context');
    expect(diffEditorSectionSource).toContain('usePreviewStickyContext');
    // 面板接线：模型/回调 ref 必须真的传到预览面（删掉传参即红）。
    expect(editorSurfaceShellSource).toContain('stickyContextModel={previewStickyModel}');
    expect(editorSurfaceShellSource).toContain('editorSurfaceRef={setPreviewSurfaceRef}');
    expect(diffEditorSectionSource).toContain('stickyContextModel={mediaStickyModel}');
    expect(diffEditorSectionSource).toContain('editorSurfaceRef={setMediaSurfaceRef}');
    // 媒体变更重置键必须含媒体路径，且媒体预览按路径重挂：退回旧 resetKey 即红。
    expect(diffEditorSectionSource).toContain(
      "changePreview?.path ?? selectedChangePreviewPath ?? ''",
    );
    expect(diffEditorSectionSource).toContain('key={previewPath}');
  });
});
