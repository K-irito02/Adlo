import type { StoreState } from '../StoreState';
import { createDebouncedSearch } from '../shared';
import { captureError, clearError } from '../cacheHelpers';
import {
  markHitsStale,
  replaceFileHits,
  resolveSearchWorkspace,
  selectSearchFilter,
  toHitEntries,
} from '../slices/searchSlice';
import type { WorkspaceFilesChangedBatch, WorkspaceSearchFilter } from '@adlo/kernel';
import { sameWorkspacePath } from '@shared/workspacePathMatch';
import type { StoreApi } from 'zustand';
import { handleExternalBatch } from './editorActions';
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
    // 检索目标工作区（可与后端当前激活工作区不同）：局部重算必须扫同一根。
    const { path: searchWorkspacePath } = resolveSearchWorkspace(
      state.recentWorkspaces,
      state.searchTargetWorkspaceId,
      state.appInfo?.currentWorkspace?.path,
    );
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
    let result;
    try {
      const filter = selectSearchFilter(
        state.searchIgnoredPaths,
        state.searchUseGitignore,
        activeWorkspaceId,
      );
      // 缺省保持旧调用形状：仅当确有 workspacePath 时才补 filter 占位（位置参数不能跳）。
      const fileTrailing: [WorkspaceSearchFilter?, string?] =
        searchWorkspacePath !== undefined
          ? [filter, searchWorkspacePath]
          : filter !== undefined
            ? [filter]
            : [];
      result = await window.digitalLife.workspace.searchInFiles(
        toSearch,
        query,
        {
          offset: 0,
          limit: get().searchLimit,
        },
        ...fileTrailing,
      );
    } catch (error) {
      // IPC 直接抛异常：回填 pending 供下次批次重试 + 入队错误 toast（与 !ok 分支同语义），
      // 避免 setTimeout 回调内的 unhandled rejection。
      toSearch.forEach((path) => pendingChanged.add(path));
      captureError(get, error, SCOPE);
      return;
    }
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

  /** 取消待发防抖＋清空重算 pending（loadMore/showAll/refresh/分支切换复用）。 */
  const cancelScheduled = () => {
    debouncedSearch.cancel();
    resetRecomputePending();
  };

  const scheduleRecompute = (batch: WorkspaceFilesChangedBatch) => {
    // 文件范围为纯前端过滤：watcher 批次不得触发后端内容请求（事项 38 不变量）。
    if (!get().searchQuery.trim() || get().filesSearchScope === 'file') {
      resetRecomputePending();
      return;
    }
    // 批次带归属根时只处理检索目标工作区的批次：批次路径是相对该根的，
    // 拿别的工作区的同名路径去标陈旧会误伤跨仓同名文件。
    if (batch.rootPath) {
      const state = get();
      const { path: searchWorkspacePath } = resolveSearchWorkspace(
        state.recentWorkspaces,
        state.searchTargetWorkspaceId,
        state.appInfo?.currentWorkspace?.path,
      );
      if (!sameWorkspacePath(batch.rootPath, searchWorkspacePath)) {
        return;
      }
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
   * 过滤器在 firing 时用最新 store 快照组装（而非调用方预组装）：
   * 防抖窗内改了忽略设置，本次请求即用新值；且所有链路（新检索/续页/显示全部/刷新）
   * 统一走同一组装点，不会再有链路漏传（事项 F1/F5）。
   */
  const runContentSearch = async (query: string, limit: number, keepEntries: boolean) => {
    const state = get();
    // 目标工作区（检索设置可切换，缺省跟随文件面板高亮）：显式传其 path 给后端，
    // 否则后端落到 current_workspace，与实际显示的工作区不一致。
    const resolved = resolveSearchWorkspace(
      state.recentWorkspaces,
      state.searchTargetWorkspaceId,
      state.appInfo?.currentWorkspace?.path,
    );
    const workspaceId = resolved.id ?? state.appInfo?.currentWorkspace?.id;
    const sessionId = get().beginSearchSession(workspaceId, { keepEntries });
    set({ searching: true, searchLimit: limit });
    const filter = selectSearchFilter(
      get().searchIgnoredPaths,
      get().searchUseGitignore,
      workspaceId,
    );
    try {
      // 缺省保持旧调用形状：仅当确有 workspacePath 时才补 filter 占位（位置参数不能跳）。
      const searchTrailing: [WorkspaceSearchFilter?, string?] =
        resolved.path !== undefined
          ? [filter, resolved.path]
          : filter !== undefined
            ? [filter]
            : [];
      const result = await window.digitalLife.workspace.search(
        query,
        { offset: 0, limit },
        ...searchTrailing,
      );
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
    } catch (error) {
      // IPC 直接抛异常（非 {ok:false} 返回）：入队错误 toast，避免 unhandled rejection；
      // finally 仍复位 searching，保证加载态可退出。
      captureError(get, error, SCOPE);
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
      clearError(get, SCOPE);
      // searching 随 query 一次提交：防抖窗口（300ms）内 committed query 已更新但旧 entries
      // 按新词过滤为空，若 searching 仍为 false 会先闪现"无结果"再变"检索中..."；
      // 空查询/文件范围分支在其后显式复位 searching:false。
      set({ searchQuery: query, searching: true });
      if (!query.trim()) {
        // 空查询：取消待发搜索＋重算 pending，旧结果不得回写，窗口回到默认首页。
        cancelScheduled();
        set({
          searchEntries: [],
          searching: false,
          searchHasMore: false,
          searchLimit: state.searchPageSize,
        });
        return;
      }
      if (state.filesSearchScope === 'file') {
        // 文件范围为纯前端过滤：仅提交检索词，不发后端内容请求、不置加载态；
        // 同时取消待发 content 请求与重算，避免旧链路回写。
        cancelScheduled();
        set({ searching: false });
        return;
      }
      // 新检索：窗口重置为默认首页（旧 query 的结果由 beginSearchSession 清空）。
      debouncedSearch(query, () => runContentSearch(query, state.searchPageSize, false));
    },

    /**
     * [loadMoreSearchResults - 追加一页（+searchPageSize）]
     * 后端是“扫到第 N 条即停”的窗口语义，故续页即用更大的 limit 重跑；
     * 立即执行（用户已显式点击），先取消待发防抖以免旧窗口响应覆盖。
     */
    loadMoreSearchResults: async () => {
      clearError(get, SCOPE);
      const state = get();
      const query = state.searchQuery;
      if (!query.trim() || !state.searchHasMore) {
        return;
      }
      const nextLimit = Math.min(state.searchLimit + state.searchPageSize, state.searchMaxResults);
      if (nextLimit <= state.searchLimit) {
        return;
      }
      cancelScheduled();
      await runContentSearch(query, nextLimit, true);
    },

    /** [showAllSearchResults - 一次性加载到用户设定的上限] */
    showAllSearchResults: async () => {
      clearError(get, SCOPE);
      const state = get();
      const query = state.searchQuery;
      if (!query.trim() || !state.searchHasMore || state.searchLimit >= state.searchMaxResults) {
        return;
      }
      cancelScheduled();
      await runContentSearch(query, state.searchMaxResults, true);
    },

    /**
     * [refreshSearchResults - 用当前窗口上限原位重跑当前检索]
     * 检索文件模式下"刷新全部"在刷树之后调用：文件增删/改名/内容变更后手动更新
     * 结果。keepEntries 保证已显示内容原位不动（悬浮加载覆盖其上；失败同样保留
     * 旧 entries，见 runContentSearch）；文件范围由工作区树派生、随刷树自动更新，
     * 无需后端请求；空查询直接返回。
     */
    refreshSearchResults: async () => {
      // 取消无条件前置：防抖待发（如刚键入新词 300ms 内点刷新）不得在守卫后 firing，
      // 否则旧 content 请求会在文件范围/空查询下回写。
      cancelScheduled();
      clearError(get, SCOPE);
      const state = get();
      const query = state.searchQuery;
      if (state.filesSearchScope === 'file' || !query.trim()) {
        // 无后端请求：同步复位 searching（与 searchFiles 空查询/file 分支同语义），
        // 避免防抖窗内残留加载态。
        set({ searching: false });
        return;
      }
      await runContentSearch(query, state.searchLimit, true);
    },

    /** [markSearchHitStale - 点击校验失败时标记该命中失效] */
    markSearchHitStale: (path: string, line?: number, workspaceId?: string) => {
      // P4-R1-F9：undefined 不再透传为"匹配全工作区"（markHitsStale 的通配语义），
      // 而是收敛到 ''（无会话戳记的条目所用哨兵）；有会话 id 时行为不变。
      // 跨仓同名文件不再被无关校验误标。
      set({ searchEntries: markHitsStale(get().searchEntries, path, line, workspaceId ?? '') });
    },

    /**
     * [cancelPendingSearch - 取消待发搜索与重算]
     * 工作区切换/上下文清理时调用：待发防抖、重算 timer 与 pending 不得写入新会话。
     */
    cancelPendingSearch: () => {
      cancelScheduled();
      // 防抖窗口内 searching 已提前置 true：取消待发时同步复位，否则工作区切换
      // 落在此窗口内会导致加载常驻、分页按钮永久 disabled。注意取消只作废未 firing
      // 的防抖＋重算 pending，不递增 searchSessionId：在途 search() 仍可能回写，
      // 由调用方在切换后开启新会话失效之；finally 的复位只在会话匹配时生效。
      set({ searching: false });
    },

    /** [subscribeWorkspaceFilesChanged - 订阅后端 watcher 批次并调度局部重算] */
    subscribeWorkspaceFilesChanged: () => {
      const unsubscribe = window.digitalLife.workspace.onFilesChanged((batch) => {
        scheduleRecompute(batch);
        // 编辑器跟手（事项 13）：同一批次顺带驱动选中文件重载 + git 静默跟手。
        // 检索重算与编辑器对账互不干扰（均为读操作，无循环）。
        handleExternalBatch(get, batch);
      });
      return () => {
        unsubscribe();
        resetRecomputePending();
      };
    },
  };
}
