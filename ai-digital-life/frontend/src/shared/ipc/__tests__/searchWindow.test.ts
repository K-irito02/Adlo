import { describe, expect, it } from 'vitest';
import {
  SEARCH_HARD_MAX_RESULTS,
  SEARCH_MAX_RESULTS,
  SEARCH_PAGE_SIZE,
  normalizeSearchWindow,
  paginateSearchHits,
} from '../searchWindow';
import type { WorkspaceSearchHit } from '@ai-digital-life/kernel';

/**
 * `searchWindow.ts` 是前端检索分页的**唯一真相来源**（四端桥与 store 共用），
 * 其常量与边界语义必须与后端 `adl_workspace::SearchWindow` 一致 ——
 * 故在此直接单测纯函数边界，而不是只靠源码文本断言。
 */

function hits(count: number): WorkspaceSearchHit[] {
  return Array.from({ length: count }, (_, i) => ({
    path: 'a.md',
    line: i + 1,
    preview: `line ${i + 1}`,
  }));
}

describe('normalizeSearchWindow', () => {
  it('defaults to the first page', () => {
    expect(normalizeSearchWindow()).toEqual({ offset: 0, limit: SEARCH_PAGE_SIZE });
    expect(normalizeSearchWindow({})).toEqual({ offset: 0, limit: SEARCH_PAGE_SIZE });
  });

  it('clamps limit to the hard ceiling and treats 0 as 1', () => {
    expect(normalizeSearchWindow({ limit: SEARCH_HARD_MAX_RESULTS + 10_000 }).limit).toBe(
      SEARCH_HARD_MAX_RESULTS,
    );
    // limit=0 会让调用方永远拿不到结果，故下限为 1（与 Rust clamped 同语义）。
    expect(normalizeSearchWindow({ limit: 0 }).limit).toBe(1);
    expect(normalizeSearchWindow({ limit: -5 }).limit).toBe(1);
  });

  it('floors the offset and never goes below zero', () => {
    expect(normalizeSearchWindow({ offset: 2.9 }).offset).toBe(2);
    expect(normalizeSearchWindow({ offset: -3 }).offset).toBe(0);
  });

  it('falls back to the defaults for non-finite input', () => {
    expect(normalizeSearchWindow({ offset: Number.NaN, limit: Number.POSITIVE_INFINITY })).toEqual({
      offset: 0,
      limit: SEARCH_PAGE_SIZE,
    });
  });
});

describe('paginateSearchHits', () => {
  it('returns the first page and reports more when hits exceed the window', () => {
    const page = paginateSearchHits(hits(5), { limit: 2 });
    expect(page.hits.map((h) => h.line)).toEqual([1, 2]);
    expect(page.hasMore).toBe(true);
  });

  it('reports no more when the page holds every hit exactly', () => {
    // 旧实现把"命中数等于上限"当作被截断，会误报"仅显示部分结果"。
    const page = paginateSearchHits(hits(5), { limit: 5 });
    expect(page.hits).toHaveLength(5);
    expect(page.hasMore).toBe(false);
  });

  it('skips the leading hits given by offset', () => {
    const page = paginateSearchHits(hits(5), { offset: 2, limit: 2 });
    expect(page.hits.map((h) => h.line)).toEqual([3, 4]);
    expect(page.hasMore).toBe(true);
  });

  it('returns an empty page past the end without claiming more', () => {
    const page = paginateSearchHits(hits(3), { offset: 99, limit: 10 });
    expect(page.hits).toEqual([]);
    expect(page.hasMore).toBe(false);
  });

  it('clamps the page to the hard ceiling', () => {
    const page = paginateSearchHits(hits(SEARCH_HARD_MAX_RESULTS + 50), {
      limit: SEARCH_HARD_MAX_RESULTS + 50,
    });
    expect(page.hits).toHaveLength(SEARCH_HARD_MAX_RESULTS);
    expect(page.hasMore).toBe(true);
  });

  it('covers every hit exactly once when paged through', () => {
    const all = hits(7);
    const collected: number[] = [];
    let offset = 0;
    for (;;) {
      const page = paginateSearchHits(all, { offset, limit: 2 });
      collected.push(...page.hits.map((h) => h.line));
      if (!page.hasMore) {
        break;
      }
      offset += page.hits.length;
    }
    expect(collected).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('cross-language window contract', () => {
  it('pins the constants to the documented product values', () => {
    // 后端 `crates/workspace/src/search.rs` 的 `MAX_SEARCH_RESULTS` /
    // `MAX_SEARCH_RESULTS_UNLIMITED` / `MAX_SEARCH_RESULTS_HARD_CAP` 由
    // `search_window_tests::window_is_clamped_to_the_safety_valve`
    // 钉住同样的三个数字：任一侧单独改动都会在各自测试里失败，避免静默漂移。
    expect(SEARCH_PAGE_SIZE).toBe(200);
    expect(SEARCH_MAX_RESULTS).toBe(5000);
    expect(SEARCH_HARD_MAX_RESULTS).toBe(20000);
  });
});
