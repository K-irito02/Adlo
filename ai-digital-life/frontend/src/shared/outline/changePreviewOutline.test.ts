import { describe, expect, it } from 'vitest';
import { buildOutlineFromContent, outlineForChangePreview } from './index';

describe('outlineForChangePreview（事项4：变更预览大纲去重）', () => {
  it('重型跳过：直接返回空数组', () => {
    expect(
      outlineForChangePreview({ baseContent: '', currentContent: 'x', path: 'a.md' }, true),
    ).toEqual([]);
  });

  it('同一 preview 对象只 walk 一次（WeakMap 去重）', () => {
    const preview = { baseContent: 'a', currentContent: '# t\n', path: 'a.md' };
    const first = outlineForChangePreview(preview, false);
    const second = outlineForChangePreview(preview, false);
    expect(second).toBe(first);
    expect(first).toEqual(buildOutlineFromContent('# t\n', 'a.md'));
  });

  it('不同 preview 对象各自计算', () => {
    const a = { baseContent: '', currentContent: '# a\n', path: 'a.md' };
    const b = { baseContent: '', currentContent: '# b\n', path: 'b.md' };
    expect(outlineForChangePreview(a, false)).not.toBe(outlineForChangePreview(b, false));
  });
});
