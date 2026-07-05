import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import type { ConversationSessionRecord } from '@ai-digital-life/kernel';
import { clearError, captureError } from '../shared';

export function createSessionForkActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState
) {
  return {
    forkSession: async (
      parentSession: ConversationSessionRecord,
      forkMessageId: string,
      existingForkCount: number
    ) => {
      clearError(get);
      const result = await window.digitalLife.sessionFork.forkSession(
        parentSession,
        forkMessageId,
        existingForkCount
      );
      if (!result.ok) {
        captureError(get, result.error);
        return null;
      }
      return result.data;
    },

    listSessionForks: async (workspaceId: string, parentSessionId: string) => {
      clearError(get);
      const result = await window.digitalLife.sessionFork.listSessionForks(
        workspaceId,
        parentSessionId
      );
      if (!result.ok) {
        captureError(get, result.error);
        return [];
      }
      return result.data;
    },
  };
}
