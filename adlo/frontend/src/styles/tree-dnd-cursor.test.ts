// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findRuleGroups } from './testing/cssRules';

/**
 * 文件导航树光标契约：
 * - 拖拽放入/插入只改变落点高亮，不应把普通悬停/长按伪装成「抓起整行」；
 * - 行与工作区头统一 `pointer`（手掌点击），真拖拽副本由 `.adl-tree-dnd-dragging` 声明 grabbing。
 */
function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf-8');
}

function bodies(css: string, selector: string): string {
  return findRuleGroups(css, selector)
    .map((block) => block.slice(block.indexOf('{') + 1, block.lastIndexOf('}')))
    .join('\n');
}

describe('文件导航树光标契约', () => {
  const css = readRepoFile('./regions/rightpanel/tree-dnd.css');

  it('行与工作区头悬停为 pointer，不是 grab', () => {
    const body = bodies(css, '.adl-multitree--dnd [data-path]');
    expect(body).toContain('cursor: pointer');
    expect(body).not.toContain('cursor: grab');

    const headerBody = bodies(css, '.adl-multitree--dnd .adl-multitree-entry__header');
    expect(headerBody).toContain('cursor: pointer');
    expect(headerBody).not.toContain('cursor: grab');
  });

  it('按下（:active）不切换为 grabbing', () => {
    const body = bodies(css, '.adl-multitree--dnd [data-path]:active');
    expect(body).toContain('cursor: pointer');
    expect(body).not.toContain('grabbing');

    const headerBody = bodies(css, '.adl-multitree--dnd .adl-multitree-entry__header:active');
    expect(headerBody).toContain('cursor: pointer');
    expect(headerBody).not.toContain('grabbing');
  });

  it('真拖拽副本仍为 grabbing', () => {
    expect(bodies(css, '.adl-tree-dnd-dragging')).toContain('cursor: grabbing');
  });
});
