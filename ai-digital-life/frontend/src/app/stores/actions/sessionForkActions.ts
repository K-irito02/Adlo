import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import type { ConversationSessionRecord } from '@ai-digital-life/kernel';
import { clearError, captureTypedError } from '../shared';

export function createSessionForkActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState
) {
  return {
    forkSession: async (parentSession: ConversationSessionRecord, forkMessageId: string) => {
      clearError(get);
      const result = await window.digitalLife.sessionFork.forkSession(parentSession, forkMessageId);
      if (!result.ok) {
        captureTypedError(get, result.error);
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
        captureTypedError(get, result.error);
        return [];
      }
      return result.data;
    },
  };
}
