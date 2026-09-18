import type { WorkspaceSearchHit } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import { SEARCH_PAGE_SIZE } from '../../../shared/ipc/searchWindow';

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
  /** 检索选项（上提到 store：点击校验/重定位必须与检索时选项一致） */
  searchMatchCase: boolean;
  searchMatchWholeWord: boolean;
  searchUseRegex: boolean;

  setSearchQuery: (query: string) => void;
  setSearching: (searching: boolean) => void;
  setSearchEntries: (entries: SearchHitEntry[]) => void;
  setSearchHasMore: (hasMore: boolean) => void;
  setSearchMatchCase: (value: boolean) => void;
  setSearchMatchWholeWord: (value: boolean) => void;
  setSearchUseRegex: (value: boolean) => void;
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

export const createSearchSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): SearchSlice => ({
  searchQuery: '',
  searching: false,
  searchEntries: [],
  searchSessionId: 0,
  searchHasMore: false,
  searchLimit: SEARCH_PAGE_SIZE,
  searchWorkspaceId: undefined,
  searchMatchCase: false,
  searchMatchWholeWord: false,
  searchUseRegex: false,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearching: (searching) => set({ searching }),
  setSearchEntries: (entries) => set({ searchEntries: entries }),
  setSearchHasMore: (hasMore) => set({ searchHasMore: hasMore }),
  setSearchMatchCase: (value) => set({ searchMatchCase: value }),
  setSearchMatchWholeWord: (value) => set({ searchMatchWholeWord: value }),
  setSearchUseRegex: (value) => set({ searchUseRegex: value }),
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
      searchLimit: SEARCH_PAGE_SIZE,
    }),
});
