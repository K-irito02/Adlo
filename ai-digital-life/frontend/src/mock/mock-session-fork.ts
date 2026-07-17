import type { SessionForkBridge } from "../shared/ipc/session_fork";

export const mockSessionFork: SessionForkBridge = {
  forkSession: async (parentSession, _forkMessageId) => ({
    ok: true,
    data: {
      ...parentSession,
      id: `${parentSession.id}-fork-${Date.now()}`,
      title: `${parentSession.title} (fork)`,
      parent_id: parentSession.id,
    },
  }),
  listSessionForks: async () => ({
    ok: true,
    data: [],
  }),
};
