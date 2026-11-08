import { isRealTitle } from '@utils/browserDisplayUtils';
import { sanitizeRestoredBrowserUrl } from '@features/browser/browserUrlUtils';
import type { StoreState } from '../StoreState';
import type { BrowserTabState } from '../slices/browserSliceShared';
import { readObjectArray, readString } from './parsers';
import { isBrowserTab } from './registry';

/** 跨键归一化器：需要在简单条目读完之后、基于多个键的共同结果构建补丁 */
export interface CompositeHydrator {
  name: string;
  /**
   * @param read 直接读原始值（不经过登记表校验器），归一化器自身必须对坏形状完全防御
   * @param priorPatch **甲类简单条目**已产出的补丁的**快照** —— 由 `hydrateAll` 在任何复合水合器
   *   运行之前取定，同一份快照原样传给每一个复合水合器。因此它只含甲类 `field` 条目
   *   写出的值（乙类 `apply` 条目的校验结果由 `apply` 直接接收，从不写入 patch，
   *   且乙类 `field === undefined`，故不得用 `priorPatch` 读乙类值），
   *   **不含**任何复合水合器的派生值（包括先于本水合器运行的那些复合的输出）。
   *   之所以要快照而不是传累积补丁：复合水合器共用这一份接口，后跑者若能看到先跑者的派生值，
   *   就会对同一形状二次派生（例如读到的是 title 已结算的 `browserTabs` 而非原始存储值）。
   *   取值规则：要**原始存储值**用 `read(key)`（自行承担形状防御）；
   *   要**登记表已校验/已回退的值**用 `priorPatch.field`（甲类键一定存在，
   *   因为甲类简单条目总有 fallback）；
   *   不要用 `priorPatch` 读其他复合水合器的输出 —— 那是本契约明确排除的。
   */
  build: (read: (key: string) => unknown, priorPatch: Partial<StoreState>) => Partial<StoreState>;
}

export function markResolvedTitles(tabs: BrowserTabState[]): BrowserTabState[] {
  return tabs.map((tab) => ({
    ...tab,
    titleResolved:
      typeof tab.titleResolved === 'boolean'
        ? tab.titleResolved
        : isRealTitle(tab.title, tab.url ?? ''),
  }));
}

// ─────────────────────────────────────────────────────────────
// 输入读取：composite 直接读原始值，不经过登记表的 read 校验器，
// 因此必须自己承担"这一读要不要贡献补丁"的判断。但"预期形状"不自己定义 ——
// 一律复用登记表的逐项校验器（isBrowserTab / isBookmarkTabItem / isTabFolder）
// 与其读取器，保证同一个键不会出现两份宽严不一的形状判定。
//
// 语义：键缺失（undefined）≡ 空值（与 brief 的 `?? []` / `?? {}` 一致，
// 归一化器可以在只有部分键可用的会话里照常工作）；键存在但形状不合法 ⇒
// 该输入判为损坏（undefined），整个归一化器不贡献补丁，保留登记表简单条目
// 读出的值/fallback。刻意不做"逐项剔除畸形元素后继续" —— 那会在登记表判定
// 整值损坏、已回退 fallback 之后，又把一个被删减过的数组写回 store，
// 使两处对同一个键的判定互相矛盾。
// ─────────────────────────────────────────────────────────────

/** 缺失 → []；否则按登记表的数组读取器（任一项不合法 ⇒ 整值拒绝） */
function readArrayInput<T>(
  isItem: (item: Record<string, unknown>) => boolean,
  raw: unknown,
): T[] | undefined {
  return raw === undefined ? [] : readObjectArray<T>(isItem)(raw);
}

/** 恢复期统一清洗：坏 URL（盘符伪主机）回落，其余原样保留引用同一性。 */
function sanitizeTabs<T extends { url: string }>(tabs: T[]): T[] {
  return tabs.map((tab) => {
    const url = sanitizeRestoredBrowserUrl(tab.url);
    return url === tab.url ? tab : { ...tab, url };
  });
}

export const compositeHydrators: CompositeHydrator[] = [
  {
    name: 'browserTabs',
    build: (read) => {
      const persistedTabs = readArrayInput<BrowserTabState>(isBrowserTab, read('adl:browser.tabs'));
      if (persistedTabs === undefined) {
        return {};
      }
      // dsh 标签是普通浏览器标签，跨重启持久化（其承载的 dsh 进程由应用启动期重新拉起）。
      const tabs = sanitizeTabs(markResolvedTitles(persistedTabs));
      const persistedActiveTabId = readString(read('adl:browser.activeTabId'));
      const activeTabId =
        persistedActiveTabId && tabs.some((tab) => tab.id === persistedActiveTabId)
          ? persistedActiveTabId
          : (tabs[tabs.length - 1]?.id ?? '');
      return {
        browserTabs: tabs,
        browserTabsById: Object.fromEntries(tabs.map((tab) => [tab.id, tab])),
        browserActiveTabId: activeTabId,
      };
    },
  },
];
