import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';
import { persist } from '../persisted/persist';
import {
  historyDedupKey,
  hasViewIdentityParam,
  historyContainerKey,
  historyDocumentKey,
  isPlaceholderTitle,
} from '@utils/browserDisplayUtils';
import type { BrowserHistoryState } from './browserTypes';

export type { BrowserHistoryState };

/**
 * 同一文档（同 hostname+pathname+身份参数）导航突发合并窗口（ms）。
 * SPA（如抖音"我的"）一次点击会连续触发多次 HistoryChanged，产生仅来源/导航参数
 * 不同的 URL 变体（user/self?from_nav=1、?from_tab_name=main&showTab=like、裸 user/self），
 * 均在毫秒级到达；窗口内合并为一条（保留最新 URL 与更优标题），Chrome/Edge 同文档合并语义。
 * 超过窗口的再次访问（同 dedupKey 同日去重已存在）不受影响。
 */
export const HISTORY_COALESCE_WINDOW_MS = 2000;

export interface BrowserHistorySlice {
  browserHistory: BrowserHistoryState[];

  browserAddToHistory: (url: string, title: string) => void;
  browserClearHistory: () => void;
  browserUpdateHistoryTitle: (url: string, title: string) => void;
  browserUpdateHistoryUrl: (oldUrl: string, newUrl: string) => void;
  browserDeleteHistoryByLevel: (
    level: 'label' | 'year' | 'month' | 'day',
    nodePath: string,
  ) => void;
  browserDeleteHistoryEntry: (entryId: string) => void;
}

function getDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dy}`;
}

/**
 * 凭据剥离（R1-Medium）：`token` 是一次性认证参数（如 dsh `?token=`），绝不能
 * 进持久化 history（localStorage 落盘）。去重键（含 token 轮换合并）与常规去重
 * 自动受益；导航/标签页仍用完整 URL（401 需要 token），互不干扰。
 */
function stripTokenParam(url: string): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has('token')) {
      return url;
    }
    u.searchParams.delete('token');
    return u.toString();
  } catch {
    return url;
  }
}

export const createBrowserHistorySlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): BrowserHistorySlice => ({
  browserHistory: [],

  browserAddToHistory: (rawUrl: string, title: string) => {
    // 入口即剥离 token（见 stripTokenParam）：存量、去重键、标题回退一律用净化后地址。
    const url = stripTokenParam(rawUrl);
    set((state) => {
      const now = Date.now();
      const today = getDateKey(now);
      const dedupKey = historyDedupKey(url);
      const addedIsVideo = hasViewIdentityParam(url);
      const containerKey = historyContainerKey(url);

      // 同一文档（同 hostname+pathname+身份参数）在导航窗口内到达的 URL 变体：
      // SPA 一次点击的多次 HistoryChanged 产生仅来源/导航参数不同的变体，合并为一条
      // （保留最新 URL 与更优标题），避免"一次点击多条历史"。内容身份不同
      // （YouTube v=AAA→BBB、不同 modal_id/q）的变体在 historyDocumentKey 上不同，不合并。
      //
      // 已知局限（2026-08-20）：合并只与最新一条（browserHistory[0]）比较，且要求
      // 到达间隔 <= HISTORY_COALESCE_WINDOW_MS（2s）。若单次点击的变体在 2s 窗口内
      // 已有其它条目插入到首部（例如前一视频条目落表），或变体间隔超过 2s，
      // 则不会合并、按常规去重追加。实测抖音单次点击的变体均在窗口内连续到达，
      // 该局限不影响已观测场景；如需覆盖更宽的突发窗口，可扩展为扫描最近 N 条
      // 相同 docKey 合并（当前刻意不做，避免过度归并）。
      const newest = state.browserHistory[0];
      const docKey = historyDocumentKey(url);
      if (
        newest &&
        now - newest.visitedAt <= HISTORY_COALESCE_WINDOW_MS &&
        historyDocumentKey(newest.url) === docKey
      ) {
        const newTitleOk = !isPlaceholderTitle(title, url);
        const oldTitleOk = !isPlaceholderTitle(newest.title, newest.url);
        const mergedTitle = newTitleOk ? title : oldTitleOk ? newest.title : title || url;
        const merged: BrowserHistoryState = {
          ...newest,
          url,
          title: mergedTitle,
          visitedAt: now,
        };
        const nextHistory = [merged, ...state.browserHistory.slice(1)];
        persist('adl:browser.history', nextHistory);
        return { browserHistory: nextHistory };
      }

      const filteredHistory = state.browserHistory.filter((item) => {
        // 同日同 dedupKey：常规去重（当前行为）
        if (historyDedupKey(item.url) === dedupKey && getDateKey(item.visitedAt) === today) {
          return false;
        }
        // 写入的是携带 modal_id 的视频条目时，清掉同容器、无 modal_id 的 base
        // scaffold（feed 骨架）——历史中只保留具体视频条目，避免重复标签与基础URL跳位。
        if (
          addedIsVideo &&
          !hasViewIdentityParam(item.url) &&
          historyContainerKey(item.url) === containerKey &&
          getDateKey(item.visitedAt) === today
        ) {
          return false;
        }
        return true;
      });
      const newHistoryItem: BrowserHistoryState = {
        id: createUiId('history'),
        url,
        title: title || url,
        visitedAt: now,
      };
      const nextHistory = [newHistoryItem, ...filteredHistory].slice(0, 100);
      persist('adl:browser.history', nextHistory);
      return { browserHistory: nextHistory };
    });
  },

  browserClearHistory: () => {
    persist('adl:browser.history', []);
    set({ browserHistory: [] });
  },

  browserUpdateHistoryTitle: (url: string, title: string) => {
    // 占位标题（空/纯URL/主机/主机+路径如 "douyin.com/jingxuan"）不覆盖已有更优标题，
    // 避免 URL 式标题污染真实/主机标题（Chrome/Edge 语义）。
    if (isPlaceholderTitle(title, url)) {
      return;
    }
    set((state) => {
      const dedupKey = historyDedupKey(url);
      const matched = state.browserHistory.filter((h) => historyDedupKey(h.url) === dedupKey);
      const changed = matched.some((h) => h.title !== title);
      if (!changed) {
        return state;
      }
      const nextHistory = state.browserHistory.map((h) =>
        historyDedupKey(h.url) === dedupKey ? { ...h, title } : h,
      );
      persist('adl:browser.history', nextHistory);
      return { browserHistory: nextHistory };
    });
  },

  /**
   * 重定向 URL 回写（方案 A，参考 Chrome/Edge 导航消化重定向链）：
   * 跨域重定向发生时（如 search.marginalia.nu → marginalia-search.com），
   * 把历史条目的 URL 更新为最终 URL，使历史树 favicon/标题能按最终 origin 命中
   * 缓存，避免"永久 spinner/兜底字母"。按 dedupKey 匹配旧 URL，保留原有标题
   * 与访问时间（与 browserAddToHistory 的去重语义一致）。
   */
  browserUpdateHistoryUrl: (oldUrl: string, rawNewUrl: string) => {
    // 回写同样剥离 token（见 stripTokenParam）：重定向目标不把凭据写进历史。
    const newUrl = stripTokenParam(rawNewUrl);
    if (!oldUrl || !newUrl || oldUrl === newUrl) {
      return;
    }
    set((state) => {
      const oldKey = historyDedupKey(oldUrl);
      const newKey = historyDedupKey(newUrl);
      if (oldKey === newKey) {
        return state;
      }
      const matched = state.browserHistory.filter((h) => historyDedupKey(h.url) === oldKey);
      if (matched.length === 0) {
        return state;
      }
      // 只作用于最新一条匹配条目（browserHistory 最新在前，matched[0]）：重定向是
      // 最近一次导航的瞬态事实，更早日期下的同 dedupKey 旧访问保留原始 URL，
      // 避免历史旧日期下出现"当时并不存在的 URL"（与 browserAddToHistory 当日
      // 去重语义一致，仅收敛最新条目）。
      const targetId = matched[0]!.id;
      const hasNew = state.browserHistory.some((h) => historyDedupKey(h.url) === newKey);
      const oldEntry = matched[0]!;
      const nextHistory = hasNew
        ? state.browserHistory
            // 旧条目若带更优标题（如 "Marginalia: 和平" 引擎前缀标题），覆盖到
            // 新条目（通常为占位标题），避免真实流程（submit 写入带标题 → 重定向
            // 后新条目占位）把更优标题丢弃。
            .map((h) =>
              historyDedupKey(h.url) === newKey &&
              isPlaceholderTitle(h.title, h.url) &&
              !isPlaceholderTitle(oldEntry.title, oldEntry.url)
                ? { ...h, title: oldEntry.title }
                : h,
            )
            .filter((h) => h.id !== targetId)
        : state.browserHistory.map((h) => (h.id === targetId ? { ...h, url: newUrl } : h));
      persist('adl:browser.history', nextHistory);
      return { browserHistory: nextHistory };
    });
  },

  browserDeleteHistoryByLevel: (level, nodePath) => {
    set((state) => {
      let filtered: BrowserHistoryState[];
      if (level === 'label') {
        filtered = [];
      } else if (level === 'year') {
        const year = nodePath.replace('history:year:', '');
        filtered = state.browserHistory.filter((h) => {
          const d = new Date(h.visitedAt);
          return String(d.getFullYear()) !== year;
        });
      } else if (level === 'month') {
        const monthKey = nodePath.replace('history:month:', '');
        filtered = state.browserHistory.filter((h) => {
          const d = new Date(h.visitedAt);
          const y = String(d.getFullYear());
          const m = String(d.getMonth() + 1).padStart(2, '0');
          return `${y}-${m}` !== monthKey;
        });
      } else {
        const dayKey = nodePath.replace('history:day:', '');
        filtered = state.browserHistory.filter((h) => {
          const d = new Date(h.visitedAt);
          const y = String(d.getFullYear());
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dy = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${dy}` !== dayKey;
        });
      }
      persist('adl:browser.history', filtered);
      return { browserHistory: filtered };
    });
  },

  browserDeleteHistoryEntry: (entryId: string) => {
    set((state) => {
      const nextHistory = state.browserHistory.filter((h) => h.id !== entryId);
      if (nextHistory.length === state.browserHistory.length) {
        return state;
      }
      persist('adl:browser.history', nextHistory);
      return { browserHistory: nextHistory };
    });
  },
});
