import type { StoreState } from '../StoreState';
import { SEARCH_MAX_RESULTS, SEARCH_PAGE_SIZE } from '../../../shared/ipc/searchWindow';
import { createDebouncedSearch } from '../shared';
import { captureError } from '../cacheHelpers';
import { markHitsStale, replaceFileHits, toHitEntries } from '../slices/searchSlice';
import type { WorkspaceFilesChangedBatch } from '@ai-digital-life/kernel';
import type { StoreApi } from 'zustand';
const SCOPE = 'search';

const debouncedSearch = createDebouncedSearch(300);
/** 前端合并窗口：后端 400ms 去抖之后再合并一层，吸收多路批次 */
const RECOMPUTE_DEBOUNCE_MS = 200;

export function createSearchActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  let recomputeTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingChanged = new Set<string>();
  let pendingRemoved = new Set<string>();
  let pendingOverflow = false;

  const flushRecompute = async () => {
    const state = get();
    const query = state.searchQuery;
    if (!query.trim() || state.filesSearchScope === 'file') {
      // 空查询/文件范围：丢弃过期 pending（200ms 窗口内 query 被清空/切范围时，
      // 旧路径不得渗入下一会话），不发任何请求。
      pendingChanged = new Set();
      pendingRemoved = new Set();
      pendingOverflow = false;
      return;
    }
    const activeWorkspaceId = state.searchWorkspaceId;
    const presentPaths = new Set(
      state.searchEntries
        .filter((entry) => entry.workspaceId === activeWorkspaceId)
        .map((entry) => entry.path),
    );
    // 已在结果中的走原位替换；变更后新命中的文件同样重算并追加（否则永不可见）。
    // 单遍分区，避免 O(N·M) 反复扫描。
    const known: string[] = [];
    const unknown: string[] = [];
    for (const path of pendingChanged) {
      (presentPaths.has(path) ? known : unknown).push(path);
    }
    const toSearch = [...known, ...unknown];
    const removed = [...pendingRemoved];
    pendingChanged = new Set();
    pendingRemoved = new Set();
    pendingOverflow = false;

    if (removed.length > 0) {
      const removedSet = new Set(removed);
      set({
        searchEntries: state.searchEntries.filter(
          (entry) => !(removedSet.has(entry.path) && entry.workspaceId === activeWorkspaceId),
        ),
      });
    }
    if (toSearch.length === 0) {
      // 无文件需重算：命中数只会减少，无法据此推断全局是否还有更多 → 沿用上一次的精确值。
      return;
    }
    const result = await window.digitalLife.workspace.searchInFiles(toSearch, query, {
      offset: 0,
      limit: get().searchLimit,
    });
    if (!result.ok) {
      // 本批丢失：回填 pending，下次批次到达时按当时 query/会话重试
      //（无 TTLOOP：无未来批次即不再触发；removed 已落盘不受影响）。
      toSearch.forEach((path) => pendingChanged.add(path));
      captureError(get, result.error, SCOPE);
      return;
    }
    const pageHits = result.data.hits;
    if (get().searchQuery !== query || get().searchSessionId !== state.searchSessionId) {
      return;
    }
    const grouped = new Map<string, typeof pageHits>();
    for (const hit of pageHits) {
      const list = grouped.get(hit.path);
      if (list) {
        list.push(hit);
      } else {
        grouped.set(hit.path, [hit]);
      }
    }
    let next = get().searchEntries;
    for (const path of known) {
      next = replaceFileHits(
        next,
        path,
        toHitEntries(grouped.get(path) ?? [], activeWorkspaceId ?? ''),
        activeWorkspaceId,
      );
    }
    if (unknown.length > 0) {
      // 去重键 JSON 序列化三元组，无边界串扰。
      const dedupeKey = (workspaceId: string, path: string, line: number) =>
        JSON.stringify([workspaceId, path, line]);
      const seen = new Set(
        next.map((entry) => dedupeKey(entry.workspaceId, entry.path, entry.line)),
      );
      const appended: typeof next = [];
      for (const path of unknown) {
        for (const hit of toHitEntries(grouped.get(path) ?? [], activeWorkspaceId ?? '')) {
          const key = dedupeKey(hit.workspaceId, hit.path, hit.line);
          if (!seen.has(key)) {
            seen.add(key);
            appended.push(hit);
          }
        }
      }
      next = [...next, ...appended];
    }
    // 合并后执行窗口上限。局部重算拿不到全局 hasMore：
    // 合并溢出窗口即证明“还有更多”，否则沿用上一次的精确值（不再保守误报）。
    const limit = get().searchLimit;
    const capped = next.length > limit ? next.slice(0, limit) : next;
    set({
      searchEntries: capped,
      searchHasMore: next.length > capped.length ? true : get().searchHasMore,
    });
    // 决策 6：文件变更后顺手刷新变更树与文件树（与命中重算同处一个节流窗口，只触发一次）
    void get().fetchGitStatus();
    void get().refreshAllWorkspaceTrees();
  };

  /** 清空重算 pending（timer＋三集合），供分支切换/会话重置复用。 */
  const resetRecomputePending = () => {
    if (recomputeTimer !== undefined) {
      clearTimeout(recomputeTimer);
      recomputeTimer = undefined;
    }
    pendingChanged = new Set();
    pendingRemoved = new Set();
    pendingOverflow = false;
  };

  const scheduleRecompute = (batch: WorkspaceFilesChangedBatch) => {
    // 文件范围为纯前端过滤：watcher 批次不得触发后端内容请求（事项 38 不变量）。
    if (!get().searchQuery.trim() || get().filesSearchScope === 'file') {
      resetRecomputePending();
      return;
    }
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

  /**
   * 执行一次内容检索（窗口由调用方决定）：写 searchEntries / searchHasMore / searchLimit。
   * 会话 id 每次递增，晚到的旧响应会被丢弃（含“加载更多”期间的窗口竞态）。
   */
  const runContentSearch = async (query: string, limit: number, keepEntries: boolean) => {
    const state = get();
    const workspaceId = state.appInfo?.currentWorkspace?.id;
    const sessionId = get().beginSearchSession(workspaceId, { keepEntries });
    set({ searching: true, searchLimit: limit });
    try {
      const result = await window.digitalLife.workspace.search(query, { offset: 0, limit });
      if (get().searchQuery !== query || get().searchSessionId !== sessionId) {
        return;
      }
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({
        searchEntries: toHitEntries(result.data.hits, workspaceId ?? ''),
        searchHasMore: result.data.hasMore,
      });
    } finally {
      if (get().searchQuery === query && get().searchSessionId === sessionId) {
        set({ searching: false });
      }
    }
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
        // 空查询：取消待发搜索＋重算 pending，旧结果不得回写，窗口回到默认首页。
        debouncedSearch.cancel();
        resetRecomputePending();
        set({
          searchEntries: [],
          searching: false,
          searchHasMore: false,
          searchLimit: SEARCH_PAGE_SIZE,
        });
        return;
      }
      if (state.filesSearchScope === 'file') {
        // 文件范围为纯前端过滤：仅提交检索词，不发后端内容请求、不置加载态；
        // 同时取消待发 content 请求与重算，避免旧链路回写。
        debouncedSearch.cancel();
        resetRecomputePending();
        set({ searching: false });
        return;
      }
      // 新检索：窗口重置为默认首页（旧 query 的结果由 beginSearchSession 清空）。
      debouncedSearch(query, () => runContentSearch(query, SEARCH_PAGE_SIZE, false));
    },

    /**
     * [loadMoreSearchResults - 追加一页（+SEARCH_PAGE_SIZE）]
     * 后端是“扫到第 N 条即停”的窗口语义，故续页即用更大的 limit 重跑；
     * 立即执行（用户已显式点击），先取消待发防抖以免旧窗口响应覆盖。
     */
    loadMoreSearchResults: async () => {
      const state = get();
      const query = state.searchQuery;
      if (!query.trim() || !state.searchHasMore) {
        return;
      }
      const nextLimit = Math.min(state.searchLimit + SEARCH_PAGE_SIZE, SEARCH_MAX_RESULTS);
      if (nextLimit <= state.searchLimit) {
        return;
      }
      debouncedSearch.cancel();
      resetRecomputePending();
      await runContentSearch(query, nextLimit, true);
    },

    /** [showAllSearchResults - 一次性加载到安全阀上限] */
    showAllSearchResults: async () => {
      const state = get();
      const query = state.searchQuery;
      if (!query.trim() || !state.searchHasMore || state.searchLimit >= SEARCH_MAX_RESULTS) {
        return;
      }
      debouncedSearch.cancel();
      resetRecomputePending();
      await runContentSearch(query, SEARCH_MAX_RESULTS, true);
    },

    /** [markSearchHitStale - 点击校验失败时标记该命中失效] */
    markSearchHitStale: (path: string, line?: number, workspaceId?: string) => {
      set({ searchEntries: markHitsStale(get().searchEntries, path, line, workspaceId) });
    },

    /**
     * [cancelPendingSearch - 取消待发搜索与重算]
     * 工作区切换/上下文清理时调用：待发防抖、重算 timer 与 pending 不得写入新会话。
     */
    cancelPendingSearch: () => {
      debouncedSearch.cancel();
      resetRecomputePending();
    },

    /** [subscribeWorkspaceFilesChanged - 订阅后端 watcher 批次并调度局部重算] */
    subscribeWorkspaceFilesChanged: () => {
      const unsubscribe = window.digitalLife.workspace.onFilesChanged(scheduleRecompute);
      return () => {
        unsubscribe();
        resetRecomputePending();
      };
    },
  };
}
