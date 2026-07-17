import type { RetrievalBridge } from '../shared/ipc/retrieval';
import type { IpcResult, RepoMapNode, RetrievalSnapshot } from '@ai-digital-life/kernel';
import { invokeIpc } from './tauri-shared';
import { repoMapEntriesToTree } from '../shared/repoMapFromEntries';

export function createTauriRetrievalBridge(): RetrievalBridge {
  return {
    getStatus: () => invokeIpc<RetrievalSnapshot | undefined>('retrieval_get_status'),
    getRepoMap: async (): Promise<IpcResult<RepoMapNode[]>> => {
      const snapshot = await invokeIpc<RetrievalSnapshot | undefined>('retrieval_get_status');
      if (!snapshot.ok) {
        return snapshot;
      }
      return { ok: true, data: repoMapEntriesToTree(snapshot.data?.repoMap ?? []) };
    },
    rebuildIndex: () => invokeIpc<boolean>('retrieval_rebuild_index'),
  };
}
