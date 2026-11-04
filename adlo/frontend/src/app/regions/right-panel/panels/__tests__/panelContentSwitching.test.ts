// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('事项1：文件/变更面板内容区无文件时留空（无文字提示）', () => {
  it('FilesPanel 内容区不渲染会话恢复提示', () => {
    const source = readSource('../FilesPanel.tsx');
    expect(source).not.toContain('sessionLastFileMissing');
  });

  it('FilesPanel 内容区无 hint 文本行', () => {
    const source = readSource('../FilesPanel.tsx');
    expect(source).not.toContain('adl-tool-hint');
  });

  it('DiffEditorSection 内容区无空态文字（无文件/无变更时直接留空）', () => {
    const source = readSource('../DiffEditorSection.tsx');
    expect(source).not.toContain('ChangesEmptyState');
  });
});

describe('事项3：文件树编辑态圆点为中性色小圆点', () => {
  it('fileTree 脏圆点保持图标体系尺寸（缩放走 CSS）', () => {
    const source = readSource('../../../../features/file-tree/fileTree.tsx');
    expect(source).toContain('adl-filetree__dirty-dot');
    expect(source).toContain('<IconCircle size={12}');
  });

  it('脏圆点样式走中性色小圆点（禁用 accent 蓝）', () => {
    const css = readSource('../../../../../styles/regions/rightpanel/files-navigator.css');
    const ruleStart = css.indexOf('.adl-filetree__dirty-dot');
    expect(ruleStart).toBeGreaterThanOrEqual(0);
    const ruleEnd = css.indexOf('}', ruleStart);
    const rule = css.slice(ruleStart, ruleEnd);
    expect(rule).toContain('var(--text-secondary)');
    expect(rule).not.toContain('var(--accent)');
    expect(rule).toContain('width: 6px');
    expect(rule).toContain('height: 6px');
  });
});

describe('事项4：切换提速（懒 chunk 预热 + 骨架反馈）', () => {
  it('预热模块暴露右面板编辑器预热入口', () => {
    const source = readSource('../../../../components/warmRightPanelEditors.ts');
    expect(source).toContain('export function warmRightPanelEditors');
  });

  it('FilesPanel 挂载时预热编辑器 chunk', () => {
    const source = readSource('../FilesPanel.tsx');
    expect(source).toContain('warmRightPanelEditors');
  });

  it('ChangesPanel 挂载时预热编辑器 chunk', () => {
    const source = readSource('../ChangesPanel.tsx');
    expect(source).toContain('warmRightPanelEditors');
  });

  it('DiffEditorSection 无空白 fallback（加载期给骨架）', () => {
    const source = readSource('../DiffEditorSection.tsx');
    expect(source).not.toContain('fallback={null}');
  });

  it('EditorSurfaceShell 无空白 fallback（加载期给骨架）', () => {
    const source = readSource('../../EditorSurfaceShell.tsx');
    expect(source).not.toContain('fallback={null}');
  });
});

describe('事项5：工作区切换后悬空选中文件被对账', () => {
  it('openWorkspace 在 bootstrap 后追加切换对账', () => {
    const source = readSource('../../../../stores/actions/workspaceLifecycleActions.ts');
    expect(source).toContain('reconcileSelectedFileAfterWorkspaceSwitch');
  });

  it('worktree 替换移除源后清空其变更预览', () => {
    const source = readSource('../../../../stores/actions/gitBranchActions.ts');
    expect(source).toContain('clearChangePreviewForWorkspace');
  });
});

describe('事项4 Round1：大纲去重 + hover 预取', () => {
  it('共享大纲模块暴露 preview 级去重入口', () => {
    const source = readSource('../../../../../shared/outline/index.ts');
    expect(source).toContain('outlineForChangePreview');
  });

  it('useChangesFilters 大纲走去重入口（不再直调全文 walk）', () => {
    const source = readSource('../ChangesPanel/useChangesFilters.ts');
    expect(source).toContain('outlineForChangePreview');
  });

  it('DiffEditorSection 大纲走去重入口', () => {
    const source = readSource('../DiffEditorSection.tsx');
    expect(source).toContain('outlineForChangePreview');
  });

  it('FileTree 暴露 hover 文件回调', () => {
    const source = readSource('../../../../features/file-tree/fileTree.utils.ts');
    expect(source).toContain('onHoverFile');
  });

  it('变更树三层透传 hover 预取回调', () => {
    for (const file of [
      '../../../../features/workspace-changes-tree/WorkspaceChangesEntry.tsx',
      '../../../../features/workspace-changes-tree/MultiWorkspaceChangesTree.tsx',
      '../ChangesTreePanel.tsx',
    ]) {
      expect(readSource(file)).toContain('onHoverChangePreview');
    }
  });

  it('useChangesActions 实现 hover 意图预取（防抖 + 预取动作）', () => {
    const source = readSource('../ChangesPanel/useChangesActions.ts');
    expect(source).toContain('prefetchChangePreviewForWorkspace');
  });
});
