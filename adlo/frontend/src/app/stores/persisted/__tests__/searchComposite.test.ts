import { describe, it, expect, beforeEach } from 'vitest';
import { hydrateAll, resetHydrationForTest } from '@stores/persisted/hydrate';

/**
 * 检索复合水合器（Step 1b）行为测试。
 *
 * 这些断言验证「写盘 → 模拟重启 → 读回」的真实语义，而非 mock：
 * hydrateAll 从 localStorage 读回、经 searchComposite 派生，再比对补丁。
 * 每条断言都应是可证伪的（见报告中的突变验证）。
 */
describe('search composite hydrators', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHydrationForTest();
  });

  it("self-heals a dirty page>max combination on hydration (N1')", () => {
    localStorage.setItem('adl:search.pageSize', '500');
    localStorage.setItem('adl:search.maxResults', '400');
    const { patch } = hydrateAll();
    expect(patch.searchPageSize).toBe(500);
    // 历史脏组合 page(500) > max(400) 必须被自愈回 500，否则回落 400 会让步长超过上限。
    expect(patch.searchMaxResults).toBe(500);
    // searchLimit 也必须对齐自愈后的步长（首屏即按用户步长请求，事项 L5）。
    expect(patch.searchLimit).toBe(500);
  });

  it('aligns searchLimit to the persisted page size (L5)', () => {
    localStorage.setItem('adl:search.pageSize', '300');
    const { patch } = hydrateAll();
    expect(patch.searchLimit).toBe(300);
  });

  it('uses the fallback page size when nothing is stored', () => {
    const { patch } = hydrateAll();
    // 未持久化时回落常量 200（SEARCH_PAGE_SIZE）/ 5000（SEARCH_MAX_RESULTS），
    // 复合水合器只做「page>max 自愈」、绝不会下调 maxResults（事项 N1'）。
    expect(patch.searchLimit).toBe(200);
    expect(patch.searchPageSize).toBe(200);
    expect(patch.searchMaxResults).toBe(5000);
  });

  it('does not lower maxResults below page size even when stored lower', () => {
    localStorage.setItem('adl:search.pageSize', '800');
    localStorage.setItem('adl:search.maxResults', '300');
    const { patch } = hydrateAll();
    expect(patch.searchMaxResults).toBe(800);
  });
});
