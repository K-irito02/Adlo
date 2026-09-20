import type { WorkspaceSearchFilter, WorkspaceSearchHit } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import {
  SEARCH_HARD_MAX_RESULTS,
  SEARCH_MAX_RESULTS,
  SEARCH_PAGE_SIZE,
  SEARCH_PAGE_SIZE_MAX,
  SEARCH_PAGE_SIZE_MIN,
} from '../../../shared/ipc/searchWindow';
import { clamp, readJson, readNumber, writeJson, writeNumber } from '../shared';
import { normalizeIgnoredEntry } from '../../../shared/ipc/searchIgnore';

export const SEARCH_PAGE_SIZE_KEY = 'adl-search:page-size';
export const SEARCH_MAX_RESULTS_KEY = 'adl-search:max-results';
export const SEARCH_IGNORED_PATHS_KEY = 'adl-search:ignored-paths';
export const SEARCH_USE_GITIGNORE_KEY = 'adl-search:use-gitignore';

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
  setSearchMatchCase: (value: boolean) => void;
  setSearchMatchWholeWord: (value: boolean) => void;
  setSearchUseRegex: (value: boolean) => void;
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

/** 读持久化的检索设置（localStorage 缺失/非法时回退默认值；取整与写路径对称）。 */
function readSearchPageSize(): number {
  return Math.floor(
    readNumber(SEARCH_PAGE_SIZE_KEY, SEARCH_PAGE_SIZE, SEARCH_PAGE_SIZE_MIN, SEARCH_PAGE_SIZE_MAX),
  );
}

function readSearchMaxResults(): number {
  return Math.floor(
    readNumber(
      SEARCH_MAX_RESULTS_KEY,
      SEARCH_MAX_RESULTS,
      SEARCH_PAGE_SIZE,
      SEARCH_HARD_MAX_RESULTS,
    ),
  );
}

function readSearchIgnoredPaths(): Record<string, string[]> {
  const raw = readJson<Record<string, string[]>>(SEARCH_IGNORED_PATHS_KEY, {});
  if (raw && typeof raw === 'object') {
    const clean: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value)) {
        // 入口归一化：脏输入（前导斜杠/`\`/尾斜杠）在此收敛，
        // 后续比较不再分叉（事项 M-1/L-1/L-7）。
        const seen = new Set<string>();
        const list: string[] = [];
        for (const p of value) {
          if (typeof p !== 'string') {
            continue;
          }
          const normalized = normalizeIgnoredEntry(p);
          if (normalized && !seen.has(normalized)) {
            seen.add(normalized);
            list.push(normalized);
          }
        }
        clean[key] = list;
      }
    }
    return clean;
  }
  return {};
}

function readSearchUseGitignore(): Record<string, boolean> {
  const raw = readJson<Record<string, boolean>>(SEARCH_USE_GITIGNORE_KEY, {});
  if (raw && typeof raw === 'object') {
    const clean: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'boolean') {
        clean[key] = value;
      }
    }
    return clean;
  }
  return {};
}

export const createSearchSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): SearchSlice => {
  // 初始化即收敛：历史脏组合（page > max，如旧版本写入）重载自愈（事项 N1'）。
  const initialPageSize = readSearchPageSize();
  const initialMaxResults = Math.max(readSearchMaxResults(), initialPageSize);
  return {
    searchQuery: '',
    searching: false,
    searchEntries: [],
    searchSessionId: 0,
    searchHasMore: false,
    // 初值对齐持久化步长（而非常量 200）：重载后首屏即按用户步长请求（事项 L5）。
    searchLimit: initialPageSize,
    searchWorkspaceId: undefined,
    searchMatchCase: false,
    searchMatchWholeWord: false,
    searchUseRegex: false,
    searchPageSize: initialPageSize,
    searchMaxResults: initialMaxResults,
    searchIgnoredPaths: readSearchIgnoredPaths(),
    searchUseGitignore: readSearchUseGitignore(),

    setSearchQuery: (query) => set({ searchQuery: query }),
    setSearching: (searching) => set({ searching }),
    setSearchEntries: (entries) => set({ searchEntries: entries }),
    setSearchMatchCase: (value) => set({ searchMatchCase: value }),
    setSearchMatchWholeWord: (value) => set({ searchMatchWholeWord: value }),
    setSearchUseRegex: (value) => set({ searchUseRegex: value }),
    setSearchPageSize: (value) => {
      // 非有限输入直接丢弃：clamp(NaN) 恒为 NaN，会污染 store + 落盘（事项 F4）。
      if (!Number.isFinite(value)) {
        return;
      }
      const next = clamp(Math.floor(value), SEARCH_PAGE_SIZE_MIN, SEARCH_PAGE_SIZE_MAX);
      writeNumber(SEARCH_PAGE_SIZE_KEY, next);
      set({ searchPageSize: next });
      // 步长超过当前上限时同步上调上限（只放大不缩小，无意外数据丢失；事项 N1）。
      if (next > _get().searchMaxResults) {
        const maxed = clamp(next, SEARCH_PAGE_SIZE, SEARCH_HARD_MAX_RESULTS);
        writeNumber(SEARCH_MAX_RESULTS_KEY, maxed);
        set({ searchMaxResults: maxed });
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
      writeNumber(SEARCH_MAX_RESULTS_KEY, next);
      set({ searchMaxResults: next });
    },
    setSearchIgnoredPaths: (workspaceId, paths) => {
      const next = { ..._get().searchIgnoredPaths, [workspaceId]: [...paths] };
      writeJson(SEARCH_IGNORED_PATHS_KEY, next);
      set({ searchIgnoredPaths: next });
    },
    setSearchUseGitignore: (workspaceId, value) => {
      const next = { ..._get().searchUseGitignore, [workspaceId]: value };
      writeJson(SEARCH_USE_GITIGNORE_KEY, next);
      set({ searchUseGitignore: next });
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
