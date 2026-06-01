import type { StoreState } from "../StoreState";
import type {
  DigitalLifeRunActivityEventV1,
  IndexingStatus,
  ModelTokenUsage,
} from "@ai-digital-life/kernel";
import type { StoreApi } from "zustand";
import { captureError } from "../shared";
import { trimOldRuns, trimActivityList } from "../activityUtils";

function startFetch(get: () => StoreState, key: string): boolean {
  if (get().isFetching[key]) return false;
  return true;
}

export function createFetchActions(set: StoreApi<StoreState>["setState"], get: () => StoreState) {
  return {
    fetchIndexStatus: async () => {
      const key = "fetchIndexStatus";
      if (!startFetch(get, key)) return;
      set({ isFetching: { ...get().isFetching, [key]: true } });
      try {
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
        } else if (!result.ok) {
          captureError(get, result.error);
        }
      } finally {
        set({ isFetching: { ...get().isFetching, [key]: false } });
      }
    },

    fetchRepoMap: async () => {
      const key = "fetchRepoMap";
      if (!startFetch(get, key)) return;
      set({ isFetching: { ...get().isFetching, [key]: true } });
      try {
        const result = await window.digitalLife.retrieval.getRepoMap();
        if (result.ok) {
          set({ repoMap: result.data });
        } else {
          captureError(get, result.error);
        }
      } finally {
        set({ isFetching: { ...get().isFetching, [key]: false } });
      }
    },

    fetchAuditEntries: async (limit?: number) => {
      const key = "fetchAuditEntries";
      if (!startFetch(get, key)) return;
      set({ isFetching: { ...get().isFetching, [key]: true } });
      try {
        const result = await window.digitalLife.task.listAuditEntries(limit);
        if (result.ok) {
          set((state: StoreState) => {
            const now = Date.now();
            const runIdRe = /runId=([A-Za-z0-9_-]+)/;
            const nextRunActivity = { ...state.runActivityByRunId };
            const nextAccess = { ...state._runLastAccessTime };
            const updatedRunIds = new Set<string>();
            
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
              if (!already) {
                nextRunActivity[runId] = trimActivityList([...existing, event].sort(
                  (a, b) => a.seq - b.seq
                ));
                nextAccess[runId] = now;
                updatedRunIds.add(runId);
              }
            }
            
            const excludeSet = new Set<string>();
            if (state.streamingActiveRunId) excludeSet.add(state.streamingActiveRunId);
            
            const trimmedMaps = trimOldRuns(
              nextRunActivity,
              state.runUsageByRunId,
              nextAccess,
              excludeSet
            );
            
            return {
              auditEntries: result.data,
              ...trimmedMaps
            };
          });
        } else {
          captureError(get, result.error);
        }
      } finally {
        set({ isFetching: { ...get().isFetching, [key]: false } });
      }
    },

    fetchRunActivityByRunId: async (runId: string, limit?: number) => {
      const key = "fetchRunActivityByRunId";
      const existing = get().runActivityByRunId[runId];
      if (existing && existing.length > 0) return;
      if (!startFetch(get, key)) return;
      set({ isFetching: { ...get().isFetching, [key]: true } });
      try {
        const result = await window.digitalLife.runActivity.listByRunId(
          runId,
          limit
        );
        if (!result.ok) {
          captureError(get, result.error);
          return;
        }
        get().setRunActivity(runId, result.data);
      } finally {
        set({ isFetching: { ...get().isFetching, [key]: false } });
      }
    },

    fetchCommandHistory: async () => {
      const key = "fetchCommandHistory";
      if (!startFetch(get, key)) return;
      set({ isFetching: { ...get().isFetching, [key]: true } });
      try {
        const result = await window.digitalLife.command.listRecent(20);
        if (result.ok) {
          set({
            commandHistory: result.data.map(
              (item: { command: string; args: string[] }) =>
                `${item.command} ${item.args.join(" ")}`.trim()
            ),
          });
        } else {
          captureError(get, result.error);
        }
      } finally {
        set({ isFetching: { ...get().isFetching, [key]: false } });
      }
    },

    refreshTaskCenter: async () => {
      const key = "refreshTaskCenter";
      if (!startFetch(get, key)) return;
      set({ isFetching: { ...get().isFetching, [key]: true } });
      try {
        const result = await window.digitalLife.task.getSnapshot();
        if (!result.ok) {
          captureError(get, result.error);
          return;
        }
        set({ taskCenter: result.data });
      } finally {
        set({ isFetching: { ...get().isFetching, [key]: false } });
      }
    },

    refreshModelHealth: async () => {
      const key = "refreshModelHealth";
      if (!startFetch(get, key)) return;
      set({ isFetching: { ...get().isFetching, [key]: true } });
      try {
        const result = await window.digitalLife.app.getModelHealth();
        if (!result.ok) {
          captureError(get, result.error);
          return;
        }
        set({ modelHealth: result.data });
      } finally {
        set({ isFetching: { ...get().isFetching, [key]: false } });
      }
    },
  };
}
