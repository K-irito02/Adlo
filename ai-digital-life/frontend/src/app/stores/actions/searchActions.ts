import type { StoreState } from '../StoreState';
import { createDebouncedSearch } from '../shared';
import { captureError } from '../cacheHelpers';
import { markHitsStale, replaceFileHits, toHitEntries } from '../slices/searchSlice';
import type { WorkspaceFilesChangedBatch } from '@ai-digital-life/kernel';
import type { StoreApi } from 'zustand';
const SCOPE = 'search';

const debouncedSearch = createDebouncedSearch(300);
/** 前端合并窗口：后端 400ms 去抖之后再合并一层，吸收多路批次 */
const RECOMPUTE_DEBOUNCE_MS = 200;
const MAX_HITS = 200;

export function createSearchActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  let recomputeTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingChanged = new Set<string>();
  let pendingRemoved = new Set<string>();
  let pendingOverflow = false;

  const flushRecompute = async () => {
    const state = get();
    const query = state.searchQuery;
    if (!query.trim()) {
      return;
    }
    const activeWorkspaceId = state.searchWorkspaceId;
    const changed = [...pendingChanged].filter((path) =>
      state.searchEntries.some(
        (entry) => entry.path === path && entry.workspaceId === activeWorkspaceId,
      ),
    );
    const removed = [...pendingRemoved];
    pendingChanged = new Set();
    pendingRemoved = new Set();
    pendingOverflow = false;

    if (removed.length > 0) {
      let next = state.searchEntries;
      for (const path of removed) {
        next = next.filter(
          (entry) => !(entry.path === path && entry.workspaceId === activeWorkspaceId),
        );
      }
      set({ searchEntries: next });
    }
    if (changed.length === 0) {
      return;
    }
    const result = await window.digitalLife.workspace.searchInFiles(changed, query);
    if (!result.ok) {
      captureError(get, result.error, SCOPE);
      return;
    }
    if (get().searchQuery !== query || get().searchSessionId !== state.searchSessionId) {
      return;
    }
    const grouped = new Map<string, typeof result.data>();
    for (const hit of result.data) {
      const list = grouped.get(hit.path);
      if (list) {
        list.push(hit);
      } else {
        grouped.set(hit.path, [hit]);
      }
    }
    let next = get().searchEntries;
    for (const path of changed) {
      next = replaceFileHits(
        next,
        path,
        toHitEntries(grouped.get(path) ?? [], activeWorkspaceId ?? ''),
      );
    }
    set({ searchEntries: next });
    // 决策 6：文件变更后顺手刷新变更树与文件树（与命中重算同处一个节流窗口，只触发一次）
    void get().fetchGitStatus();
    void get().refreshAllWorkspaceTrees();
  };

  const scheduleRecompute = (batch: WorkspaceFilesChangedBatch) => {
    batch.changed.forEach((path) => pendingChanged.add(path));
    batch.removed.forEach((path) => pendingRemoved.add(path));
    pendingOverflow = pendingOverflow || batch.overflow === true;
    if (recomputeTimer !== undefined) {
      clearTimeout(recomputeTimer);
    }
    recomputeTimer = setTimeout(() => {
      recomputeTimer = undefined;
      if (pendingOverflow) {
        pendingChanged = new Set();
        pendingRemoved = new Set();
        pendingOverflow = false;
        void get().searchFiles(get().searchQuery);
        return;
      }
      void flushRecompute();
    }, RECOMPUTE_DEBOUNCE_MS);
  };

  return {
    /**
     * [searchFiles - 在工作区搜索文件/内容]
     * @writes searchSlice.searchQuery, searchEntries, searching, searchSessionId, searchWorkspaceId
     * @see shared/ipc/workspace.ts → workspace.search
     */
    searchFiles: async (query: string) => {
      const state = get();
      set({ searchQuery: query });
      if (!query.trim()) {
        set({ searchEntries: [], searching: false, searchPartial: false });
        return;
      }
      if (state.filesSearchScope === 'file') {
        // 文件范围为纯前端过滤：仅提交检索词，不发后端内容请求、不置加载态
        set({ searching: false });
        return;
      }
      const workspaceId = state.appInfo?.currentWorkspace?.id;
      const sessionId = get().beginSearchSession(workspaceId);
      set({ searching: true });
      debouncedSearch(query, async () => {
        if (get().searchQuery !== query || get().searchSessionId !== sessionId) {
          return;
        }
        try {
          const result = await window.digitalLife.workspace.search(query);
          if (get().searchQuery !== query || get().searchSessionId !== sessionId) {
            return;
          }
          if (!result.ok) {
            captureError(get, result.error, SCOPE);
            return;
          }
          set({
            searchEntries: toHitEntries(result.data, workspaceId ?? ''),
            searchPartial: result.data.length >= MAX_HITS,
          });
        } finally {
          if (get().searchQuery === query && get().searchSessionId === sessionId) {
            set({ searching: false });
          }
        }
      });
    },

    /** [markSearchHitStale - 点击校验失败时标记该命中失效] */
    markSearchHitStale: (path: string, line?: number) => {
      set({ searchEntries: markHitsStale(get().searchEntries, path, line) });
    },

    /** [subscribeWorkspaceFilesChanged - 订阅后端 watcher 批次并调度局部重算] */
    subscribeWorkspaceFilesChanged: () =>
      window.digitalLife.workspace.onFilesChanged(scheduleRecompute),
  };
}
