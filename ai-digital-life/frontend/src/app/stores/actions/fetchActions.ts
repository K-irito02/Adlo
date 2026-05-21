import type { StoreState } from "../StoreState";
import type {
  DigitalLifeRunActivityEventV1,
  IndexingStatus,
} from "@ai-digital-life/kernel";

export function createFetchActions(set: any, get: () => StoreState) {
  return {
    fetchIndexStatus: async () => {
      const result = await window.digitalLife.retrieval.getStatus();
      if (result.ok && result.data) {
        const snap = result.data;
        const stateMap: Record<string, IndexingStatus["state"]> = {
          idle: "idle",
          running: "indexing",
          completed: "indexed",
          failed: "error",
        };
        const status: IndexingStatus = {
          state: stateMap[snap.status] ?? "idle",
          scannedFiles: snap.scannedFiles,
          totalFiles: snap.scannedFiles,
          excludedFiles: snap.scannedFiles - snap.indexedTextFiles,
          lastIndexedAt: snap.completedAt,
          error: snap.lastError,
        };
        set({ indexingStatus: status });
      }
    },

    fetchRepoMap: async () => {
      const result = await window.digitalLife.retrieval.getRepoMap();
      if (result.ok) set({ repoMap: result.data });
    },

    fetchAuditEntries: async (limit?: number) => {
      const result = await window.digitalLife.task.listAuditEntries(limit);
      if (result.ok) {
        set((state: StoreState) => {
          const runIdRe = /runId=([A-Za-z0-9_-]+)/;
          const nextRunActivity = { ...state.runActivityByRunId };
          for (let idx = 0; idx < result.data.length; idx += 1) {
            const entry = result.data[idx]!;
            const detail = entry.detail ?? "";
            const match = detail.match(runIdRe);
            if (!match) continue;
            const runId = match[1]!;
            const existing = nextRunActivity[runId] ?? [];
            const seq = Number(entry.timestamp) * 1000 + idx;
            const base = {
              v: 1 as const,
              runId,
              seq,
              ts: entry.timestamp,
            };
            let event: DigitalLifeRunActivityEventV1;
            const op = entry.operationType as unknown as string;
            if (op === "file-read") {
              const path =
                entry.summary.split(":").slice(1).join(":").trim() ||
                entry.summary;
              event = { ...base, type: "file-read", path };
            } else if (op === "search") {
              const q = entry.summary.match(/`([^`]+)`/)?.[1] ?? entry.summary;
              event = { ...base, type: "search", query: q };
            } else if (op === "model") {
              event = {
                ...base,
                type: "model",
                phase: "done",
                message: entry.summary,
              };
            } else {
              event = {
                ...base,
                type: "error" as const,
                message: `${op}: ${entry.summary}`,
              };
            }
            const already = existing.some((e) => e.seq === event.seq);
            if (!already)
              nextRunActivity[runId] = [...existing, event].sort(
                (a, b) => a.seq - b.seq
              );
          }
          return {
            auditEntries: result.data,
            runActivityByRunId: nextRunActivity,
          };
        });
      }
    },

    fetchRunActivityByRunId: async (runId: string, limit?: number) => {
      const existing = get().runActivityByRunId[runId];
      if (existing && existing.length > 0) return;
      const result = await window.digitalLife.runActivity.listByRunId(
        runId,
        limit
      );
      if (!result.ok) return;
      set((state: StoreState) => ({
        runActivityByRunId: {
          ...state.runActivityByRunId,
          [runId]: result.data,
        },
      }));
    },

    fetchCommandHistory: async () => {
      const result = await window.digitalLife.command.listRecent(20);
      if (result.ok) {
        set({
          commandHistory: result.data.map(
            (item: { command: string; args: string[] }) =>
              `${item.command} ${item.args.join(" ")}`.trim()
          ),
        });
      }
    },

    refreshTaskCenter: async () => {
      const result = await window.digitalLife.task.getSnapshot();
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({ taskCenter: result.data });
    },

    refreshModelHealth: async () => {
      const result = await window.digitalLife.app.getModelHealth();
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({ modelHealth: result.data });
    },
  };
}
