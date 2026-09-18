import type { WorkspaceSearchHit } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';

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
  /** 命中达到上限：面板提示"仅显示部分结果" */
  searchPartial: boolean;
  /** 本次检索发生时的活动工作区 */
  searchWorkspaceId: string | undefined;
  /** 检索选项（上提到 store：点击校验/重定位必须与检索时选项一致） */
  searchMatchCase: boolean;
  searchMatchWholeWord: boolean;
  searchUseRegex: boolean;

  setSearchQuery: (query: string) => void;
  setSearching: (searching: boolean) => void;
  setSearchEntries: (entries: SearchHitEntry[]) => void;
  setSearchPartial: (partial: boolean) => void;
  setSearchMatchCase: (value: boolean) => void;
  setSearchMatchWholeWord: (value: boolean) => void;
  setSearchUseRegex: (value: boolean) => void;
  beginSearchSession: (workspaceId: string | undefined) => number;
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
  searchPartial: false,
  searchWorkspaceId: undefined,
  searchMatchCase: false,
  searchMatchWholeWord: false,
  searchUseRegex: false,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearching: (searching) => set({ searching }),
  setSearchEntries: (entries) => set({ searchEntries: entries }),
  setSearchPartial: (partial) => set({ searchPartial: partial }),
  setSearchMatchCase: (value) => set({ searchMatchCase: value }),
  setSearchMatchWholeWord: (value) => set({ searchMatchWholeWord: value }),
  setSearchUseRegex: (value) => set({ searchUseRegex: value }),
  beginSearchSession: (workspaceId) => {
    const nextId = _get().searchSessionId + 1;
    set({
      searchSessionId: nextId,
      searchWorkspaceId: workspaceId,
      searchEntries: [],
      searchPartial: false,
    });
    return nextId;
  },
  clearSearch: () =>
    set({ searchQuery: '', searchEntries: [], searching: false, searchPartial: false }),
});
