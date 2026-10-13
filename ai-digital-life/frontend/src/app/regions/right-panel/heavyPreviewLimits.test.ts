import { describe, expect, it } from 'vitest';
import {
  TEXT_HEAVY_PREVIEW_CHARS,
  getHeavyPreviewPanes,
  heavyChangePreviewLength,
  isHeavyDiffContent,
} from './heavyPreviewLimits';

describe('heavyChangePreviewLength (事项3：删除型大文件也要进门）', () => {
  it('新增型：current 巨大时取 current', () => {
    expect(heavyChangePreviewLength('', 'x'.repeat(100))).toBe(100);
  });

  it('删除型：current 为空、base 巨大时取 base（此前取 current=0 导致直渲染白屏）', () => {
    expect(heavyChangePreviewLength('y'.repeat(100), '')).toBe(100);
  });

  it('两侧都大时取较大者', () => {
    expect(heavyChangePreviewLength('a'.repeat(10), 'b'.repeat(50))).toBe(50);
    expect(heavyChangePreviewLength('a'.repeat(50), 'b'.repeat(10))).toBe(50);
  });

  it('删除型 2MB base 超过 1M 字符门限（门条件成立）', () => {
    const len = heavyChangePreviewLength('z'.repeat(2 * 1024 * 1024), '');
    expect(len).toBeGreaterThan(TEXT_HEAVY_PREVIEW_CHARS);
  });

  it('小文件两侧都不超限', () => {
    expect(heavyChangePreviewLength('base', 'current')).toBeLessThanOrEqual(
      TEXT_HEAVY_PREVIEW_CHARS,
    );
  });
});

describe('isHeavyDiffContent (方案A：重型差异降级渲染判定）', () => {
  it('删除型大 base 判定为重型（与门同阈值）', () => {
    expect(isHeavyDiffContent('y'.repeat(2 * 1024 * 1024), '')).toBe(true);
  });

  it('新增型大 current 判定为重型', () => {
    expect(isHeavyDiffContent('', 'x'.repeat(2 * 1024 * 1024))).toBe(true);
  });

  it('小文件两侧都不超限时为非重型', () => {
    expect(isHeavyDiffContent('base', 'current')).toBe(false);
  });

  it('边界：恰为阈值时不算重型（与门 `>` 同语义）', () => {
    expect(isHeavyDiffContent('a'.repeat(TEXT_HEAVY_PREVIEW_CHARS), '')).toBe(false);
    expect(isHeavyDiffContent('', 'a'.repeat(TEXT_HEAVY_PREVIEW_CHARS + 1))).toBe(true);
  });
});

describe('getHeavyPreviewPanes (方案A-2：重型确认后 plain 展示分 pane）', () => {
  it('删除型（current 空）只展 base', () => {
    expect(getHeavyPreviewPanes('base-content', '')).toEqual(['base']);
  });

  it('新增型（base 空）只展 current', () => {
    expect(getHeavyPreviewPanes('', 'current-content')).toEqual(['current']);
  });

  it('双侧都有内容展双 pane（独立滚动，各自虚拟化）', () => {
    expect(getHeavyPreviewPanes('a', 'b')).toEqual(['base', 'current']);
  });

  it('双侧都空展空（调用端回退原有渲染）', () => {
    expect(getHeavyPreviewPanes('', '')).toEqual([]);
  });
});
