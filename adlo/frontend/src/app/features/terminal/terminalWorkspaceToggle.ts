/**
 * 终端目录行切换的下一值（事项 3 根因修复）：从未记录时按渲染初态取默认 ——
 * "默认终端目录"（`__independent__`，见 MultiWorkspaceTerminal / TerminalPanel
 * 的同名常量）无记录即渲染展开，首点收起；普通工作区行无记录即渲染折叠，
 * 首点展开。调用方传入对应行的默认展开态。
 *
 * 单独成模块：含组件的文件只允许导出组件（react-refresh/only-export-components）。
 */
export function nextTerminalWorkspaceToggleValue(
  current: boolean | undefined,
  defaultExpanded: boolean,
): boolean {
  return !(current ?? defaultExpanded);
}
