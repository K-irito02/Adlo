import type { StoreState } from '../StoreState';
import type { DigitalLifeRunActivityEventV1, IndexingStatus } from '@ai-digital-life/kernel';
import type { AgentRunID } from '../../../shared/branded';
import type { StoreApi } from 'zustand';
import { captureError } from '../shared';
import { trimOldRuns, trimActivityList } from '../activityUtils';

function startFetch(get: () => StoreState, key: string): boolean {
  if (get().isFetching[key]) {
    return false;
  }
  return true;
}

export function createFetchActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    /**
     * [fetchIndexStatus - 获取文件索引状态]
     * @writes diagnosticSlice.indexingStatus
     * @see shared/ipc.ts → retrieval.getStatus
     * @see mock-bridge.ts → retrieval.getStatus
     * @see preview-bridge/index.ts → retrieval.getStatus
     */
    fetchIndexStatus: async () => {
      const key = 'fetchIndexStatus';
      if (!startFetch(get, key)) {
        return;
      }
      set({ isFetching: { ...get().isFetching, [key]: true } });
      try {
        const result = await window.digitalLife.retrieval.getStatus();
        if (result.ok && result.data) {
          const snap = result.data;
          const stateMap: Record<string, IndexingStatus['state']> = {
            idle: 'idle',
            running: 'indexing',
            completed: 'indexed',
            failed: 'error',
          };
          const status: IndexingStatus = {
            state: stateMap[snap.status] ?? 'idle',
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

    /**
     * [fetchRepoMap - 获取代码仓库结构图]
     * @writes diagnosticSlice.repoMap
     * @see shared/ipc.ts → retrieval.getRepoMap
     * @see mock-bridge.ts → retrieval.getRepoMap
     * @see preview-bridge/index.ts → retrieval.getRepoMap
     */
    fetchRepoMap: async () => {
      const key = 'fetchRepoMap';
      if (!startFetch(get, key)) {
        return;
      }
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

    /**
     * [fetchAuditEntries - 获取审计日志条目，用于构建运行活动时间线]
     * @reads store.runActivityByRunId, store._runLastAccessTime, store.streamingActiveRunId
     * @writes store.auditEntries, store.runActivityByRunId, store._runLastAccessTime
     * @see shared/ipc.ts → task.listAuditEntries
     * @see mock-bridge.ts → task.listAuditEntries
     * @see preview-bridge/index.ts → task.listAuditEntries
     */
    fetchAuditEntries: async (limit?: number) => {
      const key = 'fetchAuditEntries';
      if (!startFetch(get, key)) {
        return;
      }
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
              const detail = entry.detail ?? '';
              const match = detail.match(runIdRe);
              if (!match) {
                continue;
              }
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
              if (op === 'file-read') {
                const path = entry.summary.split(':').slice(1).join(':').trim() || entry.summary;
                event = { ...base, type: 'file-read', path };
              } else if (op === 'search') {
                const q = entry.summary.match(/`([^`]+)`/)?.[1] ?? entry.summary;
                event = { ...base, type: 'search', query: q };
              } else if (op === 'model') {
                event = {
                  ...base,
                  type: 'model',
                  phase: 'done',
                  message: entry.summary,
                };
              } else {
                event = {
                  ...base,
                  type: 'error' as const,
                  message: `${op}: ${entry.summary}`,
                };
              }
              const already = existing.some((e) => e.seq === event.seq);
              if (!already) {
                nextRunActivity[runId] = trimActivityList(
                  [...existing, event].sort((a, b) => a.seq - b.seq),
                );
                nextAccess[runId] = now;
                updatedRunIds.add(runId);
              }
            }

            const excludeSet = new Set<string>();
            if (state.streamingActiveRunId) {
              excludeSet.add(state.streamingActiveRunId);
            }

            const trimmedMaps = trimOldRuns(
              nextRunActivity,
              state.runUsageByRunId,
              nextAccess,
              excludeSet,
            );

            return {
              auditEntries: result.data,
              ...trimmedMaps,
            };
          });
        } else {
          captureError(get, result.error);
        }
      } finally {
        set({ isFetching: { ...get().isFetching, [key]: false } });
      }
    },

    /**
     * [fetchRunActivityByRunId - 按运行 ID 获取运行活动日志]
     * @reads store.runActivityByRunId
     * @writes store.runActivityByRunId (通过 setRunActivity)
     * @see shared/ipc.ts → runActivity.listByRunId
     * @see mock-bridge.ts → runActivity.listByRunId
     * @see preview-bridge/index.ts → runActivity.listByRunId
     */
    fetchRunActivityByRunId: async (runId: AgentRunID, limit?: number) => {
      const key = 'fetchRunActivityByRunId';
      const existing = get().runActivityByRunId[runId as string];
      if (existing && existing.length > 0) {
        return;
      }
      if (!startFetch(get, key)) {
        return;
      }
      set({ isFetching: { ...get().isFetching, [key]: true } });
      try {
        const result = await window.digitalLife.runActivity.listByRunId(runId as string, limit);
        if (!result.ok) {
          captureError(get, result.error);
          return;
        }
        get().setRunActivity(runId as string, result.data);
      } finally {
        set({ isFetching: { ...get().isFetching, [key]: false } });
      }
    },

    /**
     * [fetchCommandHistory - 获取命令执行历史]
     * @writes commandSlice.commandHistory
     * @see shared/ipc.ts → command.listRecent
     * @see mock-bridge.ts → command.listRecent
     * @see preview-bridge/index.ts → command.listRecent
     */
    fetchCommandHistory: async () => {
      const key = 'fetchCommandHistory';
      if (!startFetch(get, key)) {
        return;
      }
      set({ isFetching: { ...get().isFetching, [key]: true } });
      try {
        const result = await window.digitalLife.command.listRecent(20);
        if (result.ok) {
          set({
            commandHistory: result.data.map((item: { command: string; args: string[] }) =>
              `${item.command} ${item.args.join(' ')}`.trim(),
            ),
          });
        } else {
          captureError(get, result.error);
        }
      } finally {
        set({ isFetching: { ...get().isFetching, [key]: false } });
      }
    },

    /**
     * [refreshTaskCenter - 刷新任务中心状态]
     * @writes taskSlice.taskCenter
     * @see shared/ipc.ts → task.getSnapshot
     * @see mock-bridge.ts → task.getSnapshot
     * @see preview-bridge/index.ts → task.getSnapshot
     */
    refreshTaskCenter: async () => {
      const key = 'refreshTaskCenter';
      if (!startFetch(get, key)) {
        return;
      }
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

    /**
     * [refreshModelHealth - 刷新模型健康状态]
     * @writes store.modelHealth
     * @see shared/ipc.ts → app.getModelHealth
     * @see mock-bridge.ts → app.getModelHealth
     * @see preview-bridge/index.ts → app.getModelHealth
     */
    refreshModelHealth: async () => {
      const key = 'refreshModelHealth';
      if (!startFetch(get, key)) {
        return;
      }
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
