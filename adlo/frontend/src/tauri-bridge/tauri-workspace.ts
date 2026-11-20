import type { WorkspaceBridge } from '../shared/ipc';
import type { WorkspaceFileChangedEvent } from '@adlo/kernel';
import { invokeIpc, subscribeChannel } from './tauri-shared';

/**
 * Tauri system-shell workspace capabilities (Task 10). The desktop keeps only
 * the three capabilities with NO ad-server HTTP route on Tauri invoke/channel:
 * the native folder dialog, the OS file-manager reveal, and the file-change
 * channel subscription. Every other `workspace.*` RPC runs over httpBridge.
 */
export function createTauriWorkspaceBridge(): Pick<
  WorkspaceBridge,
  'pickDirectory' | 'revealInFileManager' | 'openInDefaultApp' | 'onFileChanged'
> {
  return {
    pickDirectory: async () => {
      const result = await invokeIpc<string | null>('workspace_pick_directory');
      return result.ok ? { ok: true, data: result.data ?? undefined } : result;
    },
    revealInFileManager: (workspacePath: string) =>
      invokeIpc<boolean>('workspace_reveal_in_file_manager', { path: workspacePath }),
    // 系统默认程序打开（mkv/avi 等内置解码器不支持的编码）：纯壳体能力，
    // 浏览器模式无对应语义 → HTTP/preview 桥返回 NOT_SUPPORTED。
    openInDefaultApp: (workspacePath: string, relativePath: string) =>
      invokeIpc<boolean>('workspace_open_in_default_app', { workspacePath, relativePath }),
    onFileChanged: (listener: (event: WorkspaceFileChangedEvent) => void) =>
      subscribeChannel<WorkspaceFileChangedEvent>(
        'digital-life://workspace-file-changed',
        listener,
      ),
  };
}
