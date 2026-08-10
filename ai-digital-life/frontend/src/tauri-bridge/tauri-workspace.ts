import type { WorkspaceBridge } from '../shared/ipc';
import type { WorkspaceFileChangedEvent } from '@ai-digital-life/kernel';
import { invokeIpc, subscribeChannel } from './tauri-shared';

/**
 * Tauri system-shell workspace capabilities (Task 10). The desktop keeps only
 * the three capabilities with NO ad-server HTTP route on Tauri invoke/channel:
 * the native folder dialog, the OS file-manager reveal, and the file-change
 * channel subscription. Every other `workspace.*` RPC runs over httpBridge.
 */
export function createTauriWorkspaceBridge(): Pick<
  WorkspaceBridge,
  'pickDirectory' | 'revealInFileManager' | 'onFileChanged'
> {
  return {
    pickDirectory: async () => {
      const result = await invokeIpc<string | null>('workspace_pick_directory');
      return result.ok ? { ok: true, data: result.data ?? undefined } : result;
    },
    revealInFileManager: (workspacePath: string) =>
      invokeIpc<boolean>('workspace_reveal_in_file_manager', { path: workspacePath }),
    onFileChanged: (listener: (event: WorkspaceFileChangedEvent) => void) =>
      subscribeChannel<WorkspaceFileChangedEvent>(
        'digital-life://workspace-file-changed',
        listener,
      ),
  };
}
