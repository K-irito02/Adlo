import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TCopyProvider } from '@i18n/TCopyContext';
import { zhCN } from '@i18n/zh-CN';
import type { CopyDict } from '@i18n';
import { useAppStore } from '@stores/slicedStore';
import type { TransferNode } from '../bookmarkTransferTypes';
import { BookmarkTransferDialogs } from '../BookmarkTransferDialogs';

const t = zhCN as unknown as CopyDict;

const NODES: TransferNode[] = [
  { kind: 'bookmark', url: 'https://react.dev/', title: 'React', addedAt: 1, lastModifiedAt: 1 },
];

const TREE_NODES: TransferNode[] = [
  {
    kind: 'folder',
    folder: {
      name: '目录A',
      children: [
        { kind: 'bookmark', url: 'https://a.test/', title: 'A', addedAt: 1, lastModifiedAt: 1 },
        { kind: 'bookmark', url: 'https://b.test/', title: 'B', addedAt: 2, lastModifiedAt: 2 },
      ],
    },
  },
  { kind: 'bookmark', url: 'https://c.test/', title: 'C', addedAt: 3, lastModifiedAt: 3 },
];

// 同一目录下两条**同名**书签（不同 URL）→ path+depth 相同，验证 key 唯一性回归
const DUP_NODES: TransferNode[] = [
  {
    kind: 'folder',
    folder: {
      name: '目录A',
      children: [
        { kind: 'bookmark', url: 'https://x1.test/', title: '同名', addedAt: 1, lastModifiedAt: 1 },
        { kind: 'bookmark', url: 'https://x2.test/', title: '同名', addedAt: 2, lastModifiedAt: 2 },
      ],
    },
  },
  { kind: 'bookmark', url: 'https://c.test/', title: 'C', addedAt: 3, lastModifiedAt: 3 },
];

function renderHost() {
  return render(
    <TCopyProvider t={t} locale="zh-CN">
      <BookmarkTransferDialogs />
    </TCopyProvider>,
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
  useAppStore.setState({ bookmarkTransferDialog: null, bookmarkImportDraft: null });
});

afterEach(() => {
  useAppStore.setState({ bookmarkTransferDialog: null, bookmarkImportDraft: null });
});

describe('BookmarkTransferDialogs / ImportDialog', () => {
  it('opens directly on the selection step when a menu-picked draft is present', () => {
    useAppStore.setState({
      bookmarkTransferDialog: 'import',
      bookmarkImportDraft: { fileName: 'b.html', nodes: NODES, invalidCount: 0 },
    });
    renderHost();

    // 直接落在勾选步骤：出现"下一步"按钮，不出现"选文件"按钮
    expect(screen.getByRole('button', { name: zhCN.bookmarkImportNext as string })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: zhCN.bookmarkImportPickFile as string }),
    ).toBeNull();
    // 头部显示文件名
    expect(screen.getByText('b.html')).toBeTruthy();
    // draft 被一次性消费
    expect(useAppStore.getState().bookmarkImportDraft).toBeNull();
  });

  it('renders a scrollable tree shell so folder contents are reachable (事项 2)', () => {
    useAppStore.setState({
      bookmarkTransferDialog: 'import',
      bookmarkImportDraft: { fileName: 'b.html', nodes: NODES, invalidCount: 0 },
    });
    renderHost();

    // CustomScrollArea 接线：shell 内必须有 overflow-y:auto 的 scroll-area，ul[role=tree] 在其内
    // （对话框经 createPortal 挂到 body，故在 document 上查询）
    const scrollArea = document.querySelector(
      '.adl-search-ignore__scroll .adl-search-ignore__scroll-area',
    );
    expect(scrollArea).toBeTruthy();
    expect(scrollArea?.querySelector('ul[role="tree"]')).toBeTruthy();
  });

  it('keeps cancel and next on the same full-width button row, both square-cornered (事项 3)', () => {
    useAppStore.setState({
      bookmarkTransferDialog: 'import',
      bookmarkImportDraft: { fileName: 'b.html', nodes: NODES, invalidCount: 0 },
    });
    renderHost();

    const next = screen.getByRole('button', { name: zhCN.bookmarkImportNext as string });
    const cancel = screen.getByRole('button', { name: zhCN.cancel as string });
    expect(next.parentElement).toBe(cancel.parentElement);
    expect(next.parentElement?.className).toContain('adl-prompt-modal__actions--fill');
    // 按钮行只含两个按钮（状态文案挪到行外独立一行）
    expect(next.parentElement?.childElementCount).toBe(2);
    expect(next.className).toContain('adl-btn--square');
    expect(cancel.className).toContain('adl-btn--square');
  });

  it('falls back to the pick-file button when the dialog opens without a draft', () => {
    useAppStore.setState({ bookmarkTransferDialog: 'import', bookmarkImportDraft: null });
    renderHost();

    expect(
      screen.getByRole('button', { name: zhCN.bookmarkImportPickFile as string }),
    ).toBeTruthy();
  });

  it('renders nothing when no dialog is open', () => {
    renderHost();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('recycles DOM correctly with duplicate-title siblings after collapse/expand', async () => {
    useAppStore.setState({
      bookmarkTransferDialog: 'import',
      bookmarkImportDraft: { fileName: 'dup.html', nodes: DUP_NODES, invalidCount: 0 },
    });
    renderHost();

    const treeRows = () => document.querySelectorAll('.adl-search-ignore__tree li');
    expect(treeRows().length).toBe(4);

    await userEvent.click(screen.getByRole('button', { name: zhCN.collapseAll as string }));
    expect(treeRows().length).toBe(2);

    await userEvent.click(screen.getByRole('button', { name: zhCN.expandAll as string }));
    expect(treeRows().length).toBe(4);
  });

  it('renders the export-style split layout with a foldable tree and a picked list', async () => {
    useAppStore.setState({
      bookmarkTransferDialog: 'import',
      bookmarkImportDraft: { fileName: 'b.html', nodes: TREE_NODES, invalidCount: 0 },
    });
    renderHost();

    // 目录默认全部展开：4 行（目录A / A / B / C）
    const treeRows = () => document.querySelectorAll('.adl-search-ignore__tree li');
    expect(treeRows().length).toBe(4);
    // 行与目录按钮均带完整路径 title（悬停提示）
    expect(document.querySelector('.adl-search-ignore__label[title="目录A / A"]')).toBeTruthy();
    // 右栏「将要导入」面板：目录A（2 条）+ C（1 条）= 2 个条目
    expect(document.body.textContent).toContain(`${zhCN.bookmarkImportPicked} (2)`);
    const pickedItems = document.querySelectorAll('[title^="目录A"], [title="C"]');
    expect(pickedItems.length).toBeGreaterThanOrEqual(2);

    // 悬停提示也在右栏条目上
    const picked = document.querySelector('[title="目录A"]');
    expect(picked).toBeTruthy();

    // 可拖拽分隔线（竖向 role=separator）存在
    expect(document.querySelector('[role="separator"][aria-orientation="vertical"]')).toBeTruthy();

    // 点击目录折叠：A、B 行消失，aria-expanded 翻转
    const chevron = document.querySelector(
      '.adl-search-ignore__toggle[aria-expanded]',
    ) as HTMLButtonElement;
    await userEvent.click(chevron);
    expect(treeRows().length).toBe(2);
    expect(chevron.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(chevron);
    expect(treeRows().length).toBe(4);

    // 清空选择：右栏为空态，下一步禁用
    await userEvent.click(screen.getByRole('button', { name: zhCN.bookmarkImportClear as string }));
    expect(document.body.textContent).toContain(zhCN.bookmarkImportNothingPicked as string);
    expect(screen.getByRole('button', { name: zhCN.bookmarkImportNext as string })).toHaveProperty(
      'disabled',
      true,
    );

    // 全选恢复：条目恢复、下一步可用
    await userEvent.click(
      screen.getByRole('button', { name: zhCN.bookmarkImportSelectAll as string }),
    );
    expect(screen.getByRole('button', { name: zhCN.bookmarkImportNext as string })).toHaveProperty(
      'disabled',
      false,
    );

    // 右栏移除按钮：逐条移除后，目录A 下两条都排除 → 右栏仅剩 C
    const deleteBtn = Array.from(
      document.querySelectorAll(`button[aria-label="${zhCN.browserContextDelete as string}"]`),
    ).find((b) => b.closest('[title="目录A"]')) as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();
    await userEvent.click(deleteBtn);
    expect(document.body.textContent).toContain(`${zhCN.bookmarkImportPicked} (1)`);
  });
});
