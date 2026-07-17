import type { RunActivityBridge } from "../shared/ipc/run-activity";

export const mockRunActivity: RunActivityBridge = {
  listByRunId: async (_runId: string, _limit?: number) => ({ ok: true, data: [] }),
};
