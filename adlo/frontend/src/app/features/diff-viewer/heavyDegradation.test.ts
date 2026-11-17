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
    expect(inlineSource).toContain('highlightChanges: !isHeavy && !isDegraded');
    expect(inlineSource).toContain('gutter: !isHeavy');
    expect(inlineSource).toContain('syntaxHighlightDeletions: !isHeavy');
    expect(inlineSource).toContain('classifyDiffTier');
  });

  it('inline：重型跳过语言包加载（不解析巨型文档）', () => {
    expect(inlineSource).toMatch(/isHeavy \? \[\] : getLanguageExtensionSync/);
  });

  it('side-by-side：重型同样降级（双 pane 双倍成本）', () => {
    expect(sideBySideSource).toContain('highlightChanges: !isHeavy && !isDegraded');
    expect(sideBySideSource).toContain('gutter: !isHeavy');
    expect(sideBySideSource).toContain('classifyDiffTier');
  });

  it('side-by-side：重型跳过整篇 forceParsing（2000ms 主线程块）', () => {
    expect(sideBySideSource).toMatch(/if \(!editorViewB \|\| isHeavy \|\| isDegraded\)/);
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
    expect(diffSectionSource).toContain('costTier');
    const filtersSource = readFileSync(
      new URL(
        '../../regions/right-panel/panels/ChangesPanel/useChangesFilters.ts',
        import.meta.url,
      ),
      'utf8',
    );
    // 面板与侧栏同源判定；三元档语义由 diffCost.test.ts 的 shouldSkipChangeOutline 用例锁定。
    expect(filtersSource).toMatch(/shouldSkipChangeOutline\(/);
  });

  it('两处 viewer：关闭 fold 标记轮询（100ms×12 forceParsing+重配风暴）', () => {
    expect(foldHookSource).toContain('disabled');
    expect(inlineSource).toMatch(/useFoldMarkerAutoHide\([\s\S]*?isHeavy[\s\S]*?\)/);
    expect(sideBySideSource).toMatch(/useFoldMarkerAutoHide\([\s\S]*?isHeavy[\s\S]*?\)/);
    // 事项1 根因：无语法加载器的语言（plaintext 等）不产生折叠标记，必须禁用轮询。
    expect(inlineSource).toMatch(/isHeavy \|\| isDegraded \|\| !languageSupportsFolding/);
    expect(sideBySideSource).toMatch(/isHeavy \|\| isDegraded \|\| !languageSupportsFolding/);
  });

  it('DiffEditorSection：heavy 档同时跳过 diff ranges 与大纲，且确认门/plain 双栏共用同一判定', () => {
    expect(diffSectionSource.match(/costTier === 'heavy'/g)).toHaveLength(3);
    expect(diffSectionSource).toContain("const isHeavyPreview = costTier === 'heavy'");
    expect(diffSectionSource).toContain('!isHeavyPreviewConfirmed');
    expect(diffSectionSource).toMatch(/isHeavyPreview &&\s+isHeavyPreviewConfirmed/);
  });

  it('两处 viewer：ResizeObserver 回节流（拖拽缩放不风暴重测量）', () => {
    expect(inlineSource).toContain('cancelAnimationFrame');
    expect(sideBySideSource).toContain('cancelAnimationFrame');
  });

  it('CodeEditor：无语法加载器的语言自动禁用 fold 轮询（复审 H1）', () => {
    const codeEditorSource = readFileSync(
      new URL('../editor/CodeEditor.tsx', import.meta.url),
      'utf8',
    );
    expect(codeEditorSource).toMatch(/useFoldMarkerAutoHide\([\s\S]*?!languageSupportsFolding/);
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
