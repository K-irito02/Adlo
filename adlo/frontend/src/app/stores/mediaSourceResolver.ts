import type { IpcResult, WorkspaceMediaSource } from '@adlo/kernel';
import type { StoreState } from './StoreState';

/**
 * 媒体/办公预览的工作区根解析（权威实现）。
 *
 * `workspaceId` 缺省时取当前工作区；给出时严格按 id 查找（`recentWorkspaces` →
 * `externalFileRoots`），找不到返回 `null`，**不回退**到当前工作区——否则会把另一个
 * 工作区的同名相对路径拼成本工作区的文件（跨工作区串读）。
 *
 * 拿到权威 `workspacePath` 的调用点（如 `editorActions` 对账）可直接用它拼源，
 * 不必再经这里解析。
 */
export function resolveWorkspaceRootForMedia(
  state: StoreState,
  workspaceId?: string,
): string | null {
  if (!workspaceId) {
    const current = state.appInfo?.currentWorkspace;
    return current?.rootPath ?? current?.path ?? null;
  }
  const entry = state.recentWorkspaces?.find((workspace) => workspace.id === workspaceId);
  if (entry?.rootPath || entry?.path) {
    return entry.rootPath ?? entry.path ?? null;
  }
  // 运行时键查表必须走自有属性：`constructor` / `__proto__` 会沿原型链命中函数。
  const externalRoots = state.externalFileRoots;
  if (externalRoots && Object.hasOwn(externalRoots, workspaceId)) {
    return externalRoots[workspaceId] ?? null;
  }
  return null;
}

/**
 * 解析媒体来源（HEAD 探测 + Range URL）。根不可解析时返回结构化错误，
 * 调用方按普通打开失败处理（错误视图 + 重试）。
 */
export function requestMediaSource(
  state: StoreState,
  workspaceId: string | undefined,
  relativePath: string,
): Promise<IpcResult<WorkspaceMediaSource>> {
  const root = resolveWorkspaceRootForMedia(state, workspaceId);
  if (!root) {
    return Promise.resolve({
      ok: false,
      error: {
        code: 'WORKSPACE_ERROR',
        message: `workspace root not resolvable for media preview: ${relativePath}`,
      },
    });
  }
  return window.digitalLife.workspace.mediaSource(root, relativePath);
}
