// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import type { WorkspaceTreeNode } from '@ai-digital-life/kernel';
import { ROW_HEIGHT, SearchIgnoreTree } from './SearchIgnoreTree';

function buildTree(dirs: number, filesPerDir: number): WorkspaceTreeNode[] {
  const roots: WorkspaceTreeNode[] = [];
  for (let d = 0; d < dirs; d += 1) {
    const children: WorkspaceTreeNode[] = [];
    for (let f = 0; f < filesPerDir; f += 1) {
      children.push({
        path: `dir-${d}/file-${f}.ts`,
        name: `file-${f}.ts`,
        kind: 'file',
        children: [],
      });
    }
    roots.push({ path: `dir-${d}`, name: `dir-${d}`, kind: 'directory', children });
  }
  return roots;
}

const labels = {
  expandLabel: 'Expand all',
  collapseLabel: 'Collapse all',
  emptyHint: 'empty',
};

function rowCount(container: HTMLElement): number {
  return container.querySelectorAll('li.adl-search-ignore__item').length;
}

/** 已渲染行 + 上下占位折算行数 = 可见行总数（虚拟化完整性）。 */
function accountedRows(container: HTMLElement): number {
  const spacers = Array.from(
    container.querySelectorAll('.adl-search-ignore__spacer'),
  ) as HTMLElement[];
  const spacerRows = spacers.reduce(
    (sum, el) => sum + Math.round(parseFloat(el.style.height || '0') / ROW_HEIGHT),
    0,
  );
  return rowCount(container) + spacerRows;
}

describe('SearchIgnoreTree virtualization', () => {
  it('renders only the viewport window even with 30k visible rows', () => {
    const nodes = buildTree(300, 100);
    const { container } = render(
      <SearchIgnoreTree
        nodes={nodes}
        ignoredPaths={[]}
        onChange={() => {}}
        checkLabel={(name: string) => `Ignore ${name}`}
        {...labels}
      />,
    );
    // 折叠态同样只渲染视口窗口（jsdom 高度为 0 → 首屏 12 行），占位补足 300 顶层行。
    expect(rowCount(container)).toBeLessThan(200);
    expect(accountedRows(container)).toBe(300);

    const expandBtn = container.querySelector(
      '.adl-search-ignore__toolbar-group:last-child button',
    ) as HTMLButtonElement;
    act(() => {
      fireEvent.click(expandBtn);
    });
    // 展开全部：DOM 行数有界（视口 + overscan），占位补足总数。
    expect(rowCount(container)).toBeLessThan(200);
    expect(accountedRows(container)).toBe(300 * 100 + 300);
  });

  it('keeps checkbox toggling and single-dir expand working', () => {
    const nodes = buildTree(3, 2);
    const onChange = vi.fn();
    const { container } = render(
      <SearchIgnoreTree
        nodes={nodes}
        ignoredPaths={[]}
        onChange={onChange}
        checkLabel={(name: string) => `Ignore ${name}`}
        {...labels}
      />,
    );
    // 展开第一个目录：其 2 个文件行出现。
    const toggles = container.querySelectorAll('.adl-search-ignore__toggle');
    act(() => {
      fireEvent.click(toggles[0]);
    });
    expect(rowCount(container)).toBe(3 + 2);

    // 勾选第一个文件行：透传新增路径。
    const checks = container.querySelectorAll('[role="checkbox"]');
    act(() => {
      fireEvent.click(checks[1]);
    });
    expect(onChange).toHaveBeenCalledWith(['dir-0/file-0.ts']);
  });
});
