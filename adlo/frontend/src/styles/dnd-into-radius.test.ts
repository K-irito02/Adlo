// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findRuleGroups } from './testing/cssRules';

/**
 * 拖拽「放入」高亮必须是四角直角：
 * - 文件导航树：`.adl-dnd-into`（tree-dnd.css）
 * - 浏览器书签树：`.adl-browser-dnd-into` / `.adl-browser-dnd-new-root`（browser-tree-dnd.css）
 */
function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf-8');
}

/** 选择器命中的全部规则体（同一选择器可能被拆成多条规则）。 */
function bodies(css: string, selector: string): string {
  return findRuleGroups(css, selector)
    .map((block) => block.slice(block.indexOf('{') + 1, block.lastIndexOf('}')))
    .join('\n');
}

describe('放入高亮直角契约', () => {
  it('文件导航树放入高亮无圆角', () => {
    const body = bodies(readRepoFile('./regions/rightpanel/tree-dnd.css'), '.adl-dnd-into');

    expect(body).toContain('border-radius: 0');
  });

  it('浏览器书签树放入高亮无圆角', () => {
    const body = bodies(
      readRepoFile('./regions/rightpanel/browser-tree-dnd.css'),
      '.adl-browser-dnd-into',
    );

    expect(body).toContain('border-radius: 0');
    expect(body).not.toContain('var(--radius-sm)');
  });
});
