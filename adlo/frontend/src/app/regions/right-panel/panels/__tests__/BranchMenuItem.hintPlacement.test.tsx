import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { BranchMenuItem } from '../BranchSubCard';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: { changesBranchSwitch: '切换分支', changesBranchMenuHint: '分支提示' },
    locale: 'zh-CN',
    formatT: vi.fn(),
  }),
}));

function makeRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() {},
  } as DOMRect;
}

describe('BranchMenuItem 提示卡锚点', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1200);
    vi.stubGlobal('innerHeight', 800);
  });

  it('以整行菜单项为锚点，而不是感叹号自身', () => {
    const { container } = render(<BranchMenuItem currentBranch="main" onRequestOpen={vi.fn()} />);
    const row = container.querySelector('.adl-multitree-entry__menu-item--with-sub') as HTMLElement;
    const mark = container.querySelector('.adl-menu-item__hint') as HTMLElement;

    // 行右缘 1190、感叹号右缘 1176：两者相差 14px，足以区分锚点来源。
    row.getBoundingClientRect = () => makeRect(900, 100, 290, 30);
    mark.getBoundingClientRect = () => makeRect(1160, 104, 16, 16);

    fireEvent.mouseEnter(mark);

    const card = document.body.querySelector('.hint-card') as HTMLElement | null;
    expect(card).not.toBeNull();
    // placement=right 放得下时：left = 行右缘 + gap(5)。用感叹号自身会得到 1181px。
    expect(card?.style.left).toBe('1195px');
  });
});
