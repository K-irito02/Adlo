import { SEARCH_PAGE_SIZE } from '@shared/ipc/searchWindow';
import type { CompositeHydrator } from './composite';

/**
 * 检索跨键派生（Task 11，Step 1b）。
 *
 * 承接 searchSlice 创建期读取器被删后必须保住的两处派生。旧代码只改内存、不回写磁盘，
 * 故本水合器也只产出内存补丁、**不新增写盘**（自愈结果由用户下一次保存自然落盘）：
 * 1. `searchMaxResults` 自愈：`Math.max(priorPatch.searchMaxResults, priorPatch.searchPageSize)`
 *    —— 历史脏组合 `page > max` 重载后自愈（事项 N1'）。
 * 2. `searchLimit` 初值对齐：`searchLimit = priorPatch.searchPageSize`
 *    —— 重载后首屏即按用户步长请求（事项 L5）；`searchLimit` 不是持久化字段，只能由本水合器产出
 *    （真实消费者见 FileNavigatorShell.tsx / searchActions.ts）。
 *
 * priorPatch 中两条字段由简单条目保证存在（hydrateAll 对缺失键写 fallback），故可直接使用；
 * 不读其他复合水合器的输出（见 composite.ts 的 priorPatch 契约）。
 */
export const searchCompositeHydrators: CompositeHydrator[] = [
  {
    name: 'searchDerived',
    build: (_read, priorPatch) => {
      // 该分支按契约不可达（hydrateAll 已为缺失/脏/解析失败的键写入各自 fallback），仅为满足
      // Partial<StoreState> 的 number 类型而存在，故必须取语义默认值 SEARCH_PAGE_SIZE 而非占位 0。
      const pageSize = priorPatch.searchPageSize ?? SEARCH_PAGE_SIZE;
      const maxResults = priorPatch.searchMaxResults ?? SEARCH_PAGE_SIZE;
      return {
        searchMaxResults: Math.max(maxResults, pageSize),
        searchLimit: pageSize,
      };
    },
  },
];
