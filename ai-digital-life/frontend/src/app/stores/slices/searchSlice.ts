import type { WorkspaceSearchFilter, WorkspaceSearchHit } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import {
  SEARCH_HARD_MAX_RESULTS,
  SEARCH_MAX_RESULTS,
  SEARCH_PAGE_SIZE,
  SEARCH_PAGE_SIZE_MAX,
  SEARCH_PAGE_SIZE_MIN,
} from '../../../shared/ipc/searchWindow';
import { clamp } from '../shared';
import { persistField } from '../persisted/apply';

/** 文件检索三开关（大小写/全词/正则）：单对象持有、一次落盘（Task 22） */
export interface SearchFlags {
  matchCase: boolean;
  matchWholeWord: boolean;
  useRegex: boolean;
}

export interface SearchHitEntry {
  /** 产生该命中的工作区（跨工作区同相对路径不会错配） */
  workspaceId: string;
  path: string;
  line: number;
  preview: string;
  /** 点击校验发现内容已不存在 */
  stale?: boolean;
}

export interface SearchSlice {
  searchQuery: string;
  searching: boolean;
  searchEntries: SearchHitEntry[];
  /** 会话标识：丢弃过期响应（新检索递增） */
  searchSessionId: number;
  /**
   * 窗口之后**仍有命中**（后端 `hasMore` 的精确值）。
   * 旧实现是"命中数 ≥ 上限即视为被截断"的保守推断，会把"恰好取尽"误报成部分结果。
   */
  searchHasMore: boolean;
  /** 当前检索窗口上限：「加载更多」按 `SEARCH_PAGE_SIZE` 累加，「显示全部」提到安全阀。 */
  searchLimit: number;
  /** 本次检索发生时的活动工作区 */
  searchWorkspaceId: string | undefined;
  /**
   * 检索选项三开关（大小写/全词/正则，上提到 store：点击校验/重定位必须与检索时选项一致）。
   * 单对象持有、一次落盘（`adl:files.searchFlags`，Task 22）。
   */
  searchFlags: SearchFlags;
  /**
   * 检索步长/首屏条数（检索设置可自定义，全局持久化）。
   * 范围钳制到 `[SEARCH_PAGE_SIZE_MIN, SEARCH_PAGE_SIZE_MAX]`。
   */
  searchPageSize: number;
  /**
   * 「显示全部」的目标上限（检索设置可自定义，全局持久化）。
   * 范围钳制到 `[SEARCH_PAGE_SIZE, SEARCH_HARD_MAX_RESULTS]`；
   * 超过 5000 时 UI 出卡顿警告（见检索设置限制 tab）。
   */
  searchMaxResults: number;
  /**
   * 按工作区的手动忽略名单（工作区相对路径；目录隐含其全部后代）。
   * 与 `.gitignore` 为并集关系，检索过滤器透传给后端（见 `WorkspaceSearchFilter`）。
   */
  searchIgnoredPaths: Record<string, string[]>;
  /**
   * 按工作区的 `.gitignore` 开关（缺省启用；未显式设置的工作区视为启用）。
   * 关闭后检索不再叠加任何 `.gitignore` 规则，只用手动名单。
   */
  searchUseGitignore: Record<string, boolean>;

  setSearchQuery: (query: string) => void;
  setSearching: (searching: boolean) => void;
  setSearchEntries: (entries: SearchHitEntry[]) => void;
  setSearchFlags: (flags: SearchFlags) => void;
  setSearchPageSize: (value: number) => void;
  setSearchMaxResults: (value: number) => void;
  setSearchIgnoredPaths: (workspaceId: string, paths: string[]) => void;
  setSearchUseGitignore: (workspaceId: string, value: boolean) => void;
  /**
   * 开启新检索会话（递增 `searchSessionId`，用于丢弃过期响应）。
   * `keepEntries` 供「加载更多 / 显示全部」使用：重跑是为了扩大窗口，
   * 不应先清空已有结果造成列表闪烁。
   */
  beginSearchSession: (
    workspaceId: string | undefined,
    options?: { keepEntries?: boolean },
  ) => number;
  clearSearch: () => void;
}

/** 用重算结果替换某文件的全部命中（0 条即删除该文件）。原位替换保全局顺序。 */
export function replaceFileHits(
  entries: SearchHitEntry[],
  path: string,
  hits: SearchHitEntry[],
  workspaceId?: string,
): SearchHitEntry[] {
  const matches = (entry: SearchHitEntry) =>
    entry.path === path && (workspaceId === undefined || entry.workspaceId === workspaceId);
  const fresh = hits.map((hit) => ({ ...hit, stale: false }));
  const firstIndex = entries.findIndex(matches);
  if (firstIndex === -1) {
    return [...entries, ...fresh];
  }
  return [
    ...entries.slice(0, firstIndex),
    ...fresh,
    ...entries.slice(firstIndex).filter((entry) => !matches(entry)),
  ];
}

export function markHitsStale(
  entries: SearchHitEntry[],
  path: string,
  line?: number,
  workspaceId?: string,
): SearchHitEntry[] {
  return entries.map((entry) =>
    entry.path === path &&
    (workspaceId === undefined || entry.workspaceId === workspaceId) &&
    (line === undefined || entry.line === line)
      ? { ...entry, stale: true }
      : entry,
  );
}

export function toHitEntries(hits: WorkspaceSearchHit[], workspaceId: string): SearchHitEntry[] {
  return hits.map((hit) => ({ ...hit, workspaceId }));
}

/**
 * 由 store 快照组装本次检索的过滤器：手动名单与 `.gitignore` 开关并集生效。
 * 无手动忽略且 `.gitignore` 保持默认启用时返回 `undefined`
 *（后端缺省即叠加 gitignore，此时无需透传，保持旧请求体不变）。
 */
export function selectSearchFilter(
  ignoredPaths: Record<string, string[]> | undefined,
  useGitignore: Record<string, boolean> | undefined,
  workspaceId: string | undefined,
): WorkspaceSearchFilter | undefined {
  const excluded = (workspaceId ? ((ignoredPaths ?? {})[workspaceId] ?? []) : []).filter(
    (p) => typeof p === 'string' && p.length > 0,
  );
  const gitignore = workspaceId ? ((useGitignore ?? {})[workspaceId] ?? true) : true;
  if (excluded.length === 0 && gitignore) {
    return undefined;
  }
  return { excludedPaths: excluded, useGitignore: gitignore };
}

export const createSearchSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): SearchSlice => {
  // 检索设置的实际初值由 hydrateAll()（同步水合）经登记表回填：
  // - searchPageSize / searchMaxResults / searchIgnoredPaths / searchUseGitignore 由简单条目写入；
  // - searchMaxResults 的「page>max 自愈」与 searchLimit 的「首屏对齐步长」由 searchComposite 承接
  //   （见 Step 1b）。此处只给与 fallback 一致的安全默认值，避免水合前空窗。
  const initialPageSize = SEARCH_PAGE_SIZE;
  const initialMaxResults = SEARCH_MAX_RESULTS;
  return {
    searchQuery: '',
    searching: false,
    searchEntries: [],
    searchSessionId: 0,
    searchHasMore: false,
    // 初值对齐持久化步长（而非常量 200），最终由 searchComposite 在水合期产出（事项 L5）。
    searchLimit: initialPageSize,
    searchWorkspaceId: undefined,
    searchFlags: { matchCase: false, matchWholeWord: false, useRegex: false },
    searchPageSize: initialPageSize,
    searchMaxResults: initialMaxResults,
    searchIgnoredPaths: {},
    searchUseGitignore: {},

    setSearchQuery: (query) => set({ searchQuery: query }),
    setSearching: (searching) => set({ searching }),
    setSearchEntries: (entries) => set({ searchEntries: entries }),
    setSearchFlags: (flags) => set(persistField('adl:files.searchFlags', flags)),
    setSearchPageSize: (value) => {
      // 非有限输入直接丢弃：clamp(NaN) 恒为 NaN，会污染 store + 落盘（事项 F4）。
      if (!Number.isFinite(value)) {
        return;
      }
      const next = clamp(Math.floor(value), SEARCH_PAGE_SIZE_MIN, SEARCH_PAGE_SIZE_MAX);
      // 步长超过当前上限时同步上调上限（只放大不缩小，无意外数据丢失；事项 N1）。
      // 同一 setter 写两个键：合并两个 persistField 补丁为一次 set（事项 N1）。
      if (next > _get().searchMaxResults) {
        const maxed = clamp(next, SEARCH_PAGE_SIZE, SEARCH_HARD_MAX_RESULTS);
        set({
          ...persistField('adl:search.pageSize', next),
          ...persistField('adl:search.maxResults', maxed),
        });
      } else {
        set(persistField('adl:search.pageSize', next));
      }
    },
    setSearchMaxResults: (value) => {
      if (!Number.isFinite(value)) {
        return;
      }
      // 下限取 max(200, 当前步长)：上限永远不低于步长，`page ≤ max` 在 slice 层闭合
      //（对话框保存时另有双向收敛，见 SearchSettingsDialog；事项 F3）。
      const floor = Math.max(SEARCH_PAGE_SIZE, _get().searchPageSize);
      const next = clamp(Math.floor(value), floor, SEARCH_HARD_MAX_RESULTS);
      set(persistField('adl:search.maxResults', next));
    },
    setSearchIgnoredPaths: (workspaceId, paths) => {
      const next = { ..._get().searchIgnoredPaths, [workspaceId]: [...paths] };
      set(persistField('adl:search.ignoredPaths', next));
    },
    setSearchUseGitignore: (workspaceId, value) => {
      const next = { ..._get().searchUseGitignore, [workspaceId]: value };
      set(persistField('adl:search.useGitignore', next));
    },
    beginSearchSession: (workspaceId, options) => {
      const nextId = _get().searchSessionId + 1;
      set({
        searchSessionId: nextId,
        searchWorkspaceId: workspaceId,
        searchHasMore: options?.keepEntries ? _get().searchHasMore : false,
        ...(options?.keepEntries ? {} : { searchEntries: [] }),
      });
      return nextId;
    },
    clearSearch: () =>
      set({
        searchQuery: '',
        searchEntries: [],
        searching: false,
        searchHasMore: false,
        searchLimit: _get().searchPageSize,
      }),
  };
};
