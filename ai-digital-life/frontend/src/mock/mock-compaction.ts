import type { CompactionBridge } from "../shared/ipc";

export const mockCompaction: CompactionBridge = {
  compactSession: async (_input) => ({
    ok: true,
    data: {
      preservedMessages: [],
      prunedCount: 0,
      summary: null,
      summaryNeeded: false,
    },
  }),
};
