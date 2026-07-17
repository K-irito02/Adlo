import type { DurableBridge } from "../shared/ipc/durable";

export const mockDurable: DurableBridge = {
  registerDurableSession: async () => ({ ok: true, data: undefined }),
  heartbeatDurableSession: async () => ({ ok: true, data: undefined }),
  findCrashedSessions: async () => ({ ok: true, data: [] }),
  recoverSession: async () => ({ ok: true, data: false }),
};
