import type { WorkspaceBridge } from '../shared/ipc';
import type { WorkspaceFileChangedEvent } from '@adlo/kernel';
import { invokeIpc, subscribeChannel } from './tauri-shared';

/**
 * Tauri system-shell workspace capabilities (Task 10). The desktop keeps only
 * the capabilities with NO ad-server HTTP route on Tauri invoke/channel:
 * the native folder dialog, the OS file-manager reveal, the OS default app
 * opener, and the file-change channel subscription. Every other `workspace.*`
 * RPC runs over httpBridge.
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
    // 系统默认程序打开（mkv/avi 等内置解码器不支持的编码/文档）：桌面走 Tauri invoke；
    // 浏览器预览由 preview-bridge 把同方法指向预览服务 `/system/open-file`。
    openInDefaultApp: (workspacePath: string, relativePath: string) =>
      invokeIpc<boolean>('workspace_open_in_default_app', { workspacePath, relativePath }),
    onFileChanged: (listener: (event: WorkspaceFileChangedEvent) => void) =>
      subscribeChannel<WorkspaceFileChangedEvent>(
        'digital-life://workspace-file-changed',
        listener,
      ),
  };
}
