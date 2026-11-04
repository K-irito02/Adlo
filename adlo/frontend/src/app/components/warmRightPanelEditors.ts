/**
 * 右面板编辑器 chunk 预热（事项4）
 *
 * 文件树点击切换的首切代价部分来自按需加载的代码块；面板挂载后空闲即预取，
 * 点击时 chunk 已就绪。幂等：重复调用仅复用模块缓存，无额外开销。
 */

export function importDiffEditorSection() {
  return import('@regions/right-panel/panels/DiffEditorSection').then((m) => ({
    default: m.DiffEditorSection,
  }));
}

export function importEditorSurfaceShell() {
  return import('@regions/right-panel/EditorSurfaceShell').then((m) => ({
    default: m.EditorSurfaceShell,
  }));
}

export function importGitVisualizationView() {
  return import('@features/git-visualization').then((m) => ({
    default: m.GitVisualizationView,
  }));
}

export function warmRightPanelEditors(): void {
  void importDiffEditorSection().catch(() => {});
  void importEditorSurfaceShell().catch(() => {});
  void importGitVisualizationView().catch(() => {});
  void import('@features/editor').catch(() => {});
  void import('@features/diff-viewer').catch(() => {});
}
