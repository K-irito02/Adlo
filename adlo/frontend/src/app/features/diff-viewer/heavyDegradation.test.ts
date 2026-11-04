// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 重型差异降级渲染接线守卫（方案A）。
 * 5.6MB 级删除型变更曾直挂全量 MergeView（字符标记/合并按钮/语法高亮全开），
 * 阻塞主线程致最小化还原黑屏、缩放卡顿。以下接线缺一即回退，测试锁死。
 */
const inlineSource = readFileSync(new URL('./InlineDiffViewer.tsx', import.meta.url), 'utf8');
const sideBySideSource = readFileSync(
  new URL('./SideBySideDiffViewer.tsx', import.meta.url),
  'utf8',
);
const foldHookSource = readFileSync(
  new URL('../editor/useFoldMarkerAutoHide.ts', import.meta.url),
  'utf8',
);
const diffSectionSource = readFileSync(
  new URL('../../regions/right-panel/panels/DiffEditorSection.tsx', import.meta.url),
  'utf8',
);

describe('heavy diff degradation wiring (方案A)', () => {
  it('inline：重型关字符标记 / gutter / 删除块着色，只读下关合并按钮', () => {
    expect(inlineSource).toContain('highlightChanges: !isHeavy');
    expect(inlineSource).toContain('gutter: !isHeavy');
    expect(inlineSource).toContain('syntaxHighlightDeletions: !isHeavy');
    expect(inlineSource).toContain('isHeavyDiffContent');
  });

  it('inline：重型跳过语言包加载（不解析巨型文档）', () => {
    expect(inlineSource).toMatch(/isHeavy \? \[\] : getLanguageExtensionSync/);
  });

  it('side-by-side：重型同样降级（双 pane 双倍成本）', () => {
    expect(sideBySideSource).toContain('highlightChanges: !isHeavy');
    expect(sideBySideSource).toContain('gutter: !isHeavy');
    expect(sideBySideSource).toContain('isHeavyDiffContent');
  });

  it('side-by-side：重型跳过整篇 forceParsing（2000ms 主线程块）', () => {
    expect(sideBySideSource).toMatch(/if \(!editorViewB \|\| isHeavy\)/);
  });

  it('两处 viewer：容器 ResizeObserver 驱动重测量（修最大化/还原陈旧尺寸）', () => {
    expect(inlineSource).toContain('new ResizeObserver');
    expect(inlineSource).toContain('requestMeasure');
    expect(sideBySideSource).toContain('new ResizeObserver');
    expect(sideBySideSource).toContain('requestMeasure');
  });

  it('DiffEditorSection：透传 fileKey（杀 11MB original+modified 拼接）+ 差异门文案', () => {
    expect(diffSectionSource).toContain('fileKey={changePreview.path}');
    expect(diffSectionSource).toContain('heavyPreviewHintDiff');
  });

  it('DiffEditorSection：重型确认后走 plain 分 pane（不挂 MergeView）', () => {
    expect(diffSectionSource).toContain('getHeavyPreviewPanes');
    expect(diffSectionSource).toContain('language="plaintext"');
  });

  it('大纲双跳过（重型不解析 5.6MB 生成大纲，与开文件重型跳过同例）', () => {
    expect(diffSectionSource).toContain('isHeavyDiffContent');
    const filtersSource = readFileSync(
      new URL(
        '../../regions/right-panel/panels/ChangesPanel/useChangesFilters.ts',
        import.meta.url,
      ),
      'utf8',
    );
    expect(filtersSource).toContain('isHeavyDiffContent');
  });

  it('两处 viewer：重型关闭 fold 标记轮询（100ms×60 forceParsing+重配风暴）', () => {
    expect(foldHookSource).toContain('disabled');
    expect(inlineSource).toMatch(/useFoldMarkerAutoHide\([\s\S]*?isHeavy[\s\S]*?\)/);
    expect(sideBySideSource).toMatch(/useFoldMarkerAutoHide\([\s\S]*?isHeavy[\s\S]*?\)/);
  });

  it('两处 viewer：ResizeObserver 回节流（拖拽缩放不风暴重测量）', () => {
    expect(inlineSource).toContain('cancelAnimationFrame');
    expect(sideBySideSource).toContain('cancelAnimationFrame');
  });

  it('CodeEditor：plaintext 自动禁用 fold 轮询（复审 H1，重型 plain 主路径）', () => {
    const codeEditorSource = readFileSync(
      new URL('../editor/CodeEditor.tsx', import.meta.url),
      'utf8',
    );
    expect(codeEditorSource).toMatch(/useFoldMarkerAutoHide\([\s\S]*?language === 'plaintext'/);
  });

  it('SearchSettingsDialog：陈旧选中 id 走可见性派生回退（复审 M2）', () => {
    const dialogSource = readFileSync(
      new URL('../../regions/right-panel/SearchSettingsDialog.tsx', import.meta.url),
      'utf8',
    );
    expect(dialogSource).toContain('validActiveWorkspaceId');
    expect(dialogSource).toMatch(/visibleWorkspaces\.some\(\(w\) => w\.id === activeWorkspaceId\)/);
  });

  it('gitSnapshotActions：pending 预览在途时让路（复审 H2）', () => {
    const gitSnapshotSource = readFileSync(
      new URL('../../stores/actions/gitSnapshotActions.ts', import.meta.url),
      'utf8',
    );
    expect(gitSnapshotSource).toContain('pendingChangePreviewPath');
  });
});
