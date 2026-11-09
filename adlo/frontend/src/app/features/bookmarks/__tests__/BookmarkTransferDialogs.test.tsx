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

  // ── 第 2 步「导入目标」：B · 左右分栏折叠后的新行为 ──

  const STEP2_NODES: TransferNode[] = [
    {
      kind: 'folder',
      folder: {
        name: '工作区收藏夹',
        children: [
          {
            kind: 'bookmark',
            url: 'https://bin.test/',
            title: '预页',
            addedAt: 1,
            lastModifiedAt: 1,
          },
        ],
      },
    },
    { kind: 'bookmark', url: 'https://top.test/', title: '顶层', addedAt: 2, lastModifiedAt: 2 },
  ];

  function seedStep2() {
    useAppStore.setState({
      bookmarkTransferDialog: 'import',
      bookmarkImportDraft: { fileName: 'b.html', nodes: STEP2_NODES, invalidCount: 0 },
      recentWorkspaces: [
        {
          id: 'ws-a',
          path: '/a',
          rootPath: '/a',
          name: '工作区A',
          lastOpenedAt: 0,
          isPinned: false,
          pinnedOrder: 0,
          unpinnedOrder: 0,
          removedFromSidebar: false,
          available: true,
        },
      ],
      browserBookmarkFolders: [
        {
          id: 'f-root',
          name: '工具箱',
          createdAt: 0,
          isUserCreated: true,
          entries: [
            { id: 'e1', url: 'https://a.test/', title: 'A', addedAt: 0, lastModifiedAt: 0 },
          ],
        },
        {
          id: 'f-child',
          name: '子目录',
          createdAt: 0,
          isUserCreated: true,
          parentId: 'f-root',
          parentType: 'folder' as const,
          entries: [],
        },
      ],
    });
  }

  async function gotoStep2() {
    await userEvent.click(screen.getByRole('button', { name: zhCN.bookmarkImportNext as string }));
  }

  it('step 2 renders the three-mode nav and defaults to 原目录结构导入', async () => {
    seedStep2();
    renderHost();
    await gotoStep2();

    const nav = screen.getByRole('radiogroup');
    expect(nav).toBeTruthy();
    const original = screen.getByRole('radio', {
      name: new RegExp(zhCN.bookmarkImportModeOriginal as string),
    });
    const newTop = screen.getByRole('radio', {
      name: new RegExp(zhCN.bookmarkImportModeNewTop as string),
    });
    const existing = screen.getByRole('radio', {
      name: new RegExp(zhCN.bookmarkImportModeExisting as string),
    });
    expect(original.getAttribute('aria-checked')).toBe('true');
    expect(newTop.getAttribute('aria-checked')).toBe('false');
    expect(existing.getAttribute('aria-checked')).toBe('false');
    // 对话框固定 600px 高
    const dialog = screen.getByRole('dialog');
    expect((dialog as HTMLElement).style.height).toBe('600px');
    // 默认模式确认可用
    expect(
      screen.getByRole('button', { name: zhCN.bookmarkImportConfirm as string }),
    ).toHaveProperty('disabled', false);
  });

  it('newTop mode blocks a top-level folder-name clash and recovers after rename', async () => {
    seedStep2();
    renderHost();
    await gotoStep2();

    await userEvent.click(
      screen.getByRole('radio', { name: new RegExp(zhCN.bookmarkImportModeNewTop as string) }),
    );
    const input = document.querySelector('#newDirName') as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, '工具箱');
    expect(document.body.textContent).toContain('已存在同名顶层目录');
    const confirm = screen.getByRole('button', { name: zhCN.bookmarkImportConfirm as string });
    expect(confirm).toHaveProperty('disabled', true);

    await userEvent.clear(input);
    await userEvent.type(input, '我的顶层');
    expect(confirm).toHaveProperty('disabled', false);
  });

  it('existing mode renders folders-only tree and imports into the selected folder', async () => {
    seedStep2();
    renderHost();
    await gotoStep2();

    await userEvent.click(
      screen.getByRole('radio', { name: new RegExp(zhCN.bookmarkImportModeExisting as string) }),
    );
    // 两个分区标题都存在
    expect(document.body.textContent).toContain(zhCN.browserCategoryWorkspace as string);
    expect(document.body.textContent).toContain(zhCN.browserCategoryUserFolder as string);
    // 不渲染书签行：没有 "预页"（文件中的书签标题）也没有 e1 "A"
    expect(document.body.textContent).not.toContain('预页');
    // 点「工具箱」行选中 → 目标显示「工具箱」
    const toolboxRow = Array.from(document.querySelectorAll('[role="option"]')).find((r) =>
      r.textContent?.includes('工具箱'),
    ) as HTMLElement;
    await userEvent.click(toolboxRow);
    expect(document.body.textContent).toContain('工具箱');
    const confirm = screen.getByRole('button', { name: zhCN.bookmarkImportConfirm as string });
    expect(confirm).toHaveProperty('disabled', false);

    await userEvent.click(confirm);
    const folders = useAppStore.getState().browserBookmarkFolders;
    const created = folders.find((f) => f.name === '工作区收藏夹');
    expect(created?.parentId).toBe('f-root');
    expect(folders.some((f) => f.name === '工具箱')).toBe(true);
    // 顶层书签在原目录结构模式下不会走这条路径——此处目标=工具箱，所以创建于工具箱之下
  });

  it('existing mode supports nested new-folder creation as import target', async () => {
    seedStep2();
    renderHost();
    await gotoStep2();

    await userEvent.click(
      screen.getByRole('radio', { name: new RegExp(zhCN.bookmarkImportModeExisting as string) }),
    );
    const toolboxRow = Array.from(document.querySelectorAll('[role="option"]')).find((r) =>
      r.textContent?.includes('工具箱'),
    ) as HTMLElement;
    await userEvent.click(toolboxRow);
    // 点「新建目录」按钮
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(zhCN.bookmarkImportNestedCreate as string) }),
    );
    const input = document.querySelector(
      `input[placeholder="${zhCN.bookmarkImportNestedPlaceholder as string}"]`,
    ) as HTMLInputElement;
    await userEvent.type(input, '剪藏');
    // 按下 Enter 确认创建
    await userEvent.type(input, '{Enter}');
    // 显示「新建」徽标 + 目标行含 剪藏
    expect(document.body.textContent).toContain(zhCN.bookmarkImportNestedBadge as string);
    expect(document.body.textContent).toContain('剪藏');

    const confirm = screen.getByRole('button', { name: zhCN.bookmarkImportConfirm as string });
    expect(confirm).toHaveProperty('disabled', false);
    await userEvent.click(confirm);

    const folders = useAppStore.getState().browserBookmarkFolders;
    const toolbox = folders.find((f) => f.id === 'f-root');
    const clip = folders.find((f) => f.name === '剪藏');
    // 原目录结构根目录应作为剪藏的子目录被创建
    const clipChild = folders.find((f) => f.name === '工作区收藏夹');
    expect(clip?.parentId).toBe(toolbox?.id);
    expect(clipChild?.parentId).toBe(clip?.id);
  });

  it('original mode import creates the file top-level structure directly under 自建目录', async () => {
    seedStep2();
    renderHost();
    await gotoStep2();

    const confirm = screen.getByRole('button', { name: zhCN.bookmarkImportConfirm as string });
    expect(confirm).toHaveProperty('disabled', false);
    await userEvent.click(confirm);

    const folders = useAppStore.getState().browserBookmarkFolders;
    // 原目录结构：文件顶层目录成为自建目录顶层用户文件夹
    expect(folders.some((f) => f.name === '工作区收藏夹' && !f.parentId)).toBe(true);
    // 松散顶层书签归入「顶层书签」目录（seed 含一个顶层书签）
    const loose = folders.find((f) => f.name === (zhCN.bookmarkImportRootFolderName as string));
    expect(loose).toBeTruthy();
    expect(loose?.entries?.some((e) => e.title === '顶层')).toBe(true);
  });

  // ── 空目录不显示 / 不导入（ImportDialog 第 1 步 + ExportDialog 树） ──

  it('import hides empty folders from the tree and never imports them', async () => {
    const importNodes = [
      { kind: 'folder', folder: { name: '空目录', children: [] } },
      {
        kind: 'folder',
        folder: {
          name: '有书签',
          children: [
            {
              kind: 'bookmark',
              url: 'https://k.test/',
              title: 'K',
              addedAt: 1,
              lastModifiedAt: 1,
            },
          ],
        },
      },
      { kind: 'bookmark', url: 'https://loose.test/', title: '松', addedAt: 1, lastModifiedAt: 1 },
    ] as TransferNode[];
    useAppStore.setState({
      bookmarkTransferDialog: 'import',
      bookmarkImportDraft: { fileName: 'e.html', nodes: importNodes, invalidCount: 0 },
      browserBookmarkFolders: [],
      recentWorkspaces: [],
    });
    renderHost();
    // 空目录不渲染，非空目录与松散书签正常渲染
    expect(document.body.textContent).not.toContain('空目录');
    expect(document.body.textContent).toContain('有书签');

    await userEvent.click(screen.getByRole('button', { name: zhCN.bookmarkImportNext as string }));
    await userEvent.click(
      screen.getByRole('button', { name: zhCN.bookmarkImportConfirm as string }),
    );
    const folders = useAppStore.getState().browserBookmarkFolders;
    expect(folders.some((f) => f.name === '空目录')).toBe(false);
    expect(folders.some((f) => f.name === '有书签')).toBe(true);
  });

  // ── 导出对话框：问号按钮 + 空目录隐藏 + 整分类勾选条目 ──

  const WS_ENTRY = {
    id: 'ws-a',
    path: '/a',
    rootPath: '/a',
    name: '工作区A',
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
  };
  const WS_EMPTY_ENTRY = {
    ...WS_ENTRY,
    id: 'ws-empty',
    path: '/e',
    rootPath: '/e',
    name: '空工作区',
  };
  const EXPORT_FOLDERS = [
    {
      id: 'f-a',
      name: '工具箱',
      createdAt: 0,
      isUserCreated: true,
      entries: [{ id: 'e1', url: 'https://tool.test/', title: 'T', addedAt: 0, lastModifiedAt: 0 }],
    },
    { id: 'f-empty', name: '空盒子', createdAt: 0, isUserCreated: true, entries: [] },
  ];
  const EXPORT_WS_BOOKMARKS = {
    'ws-a': [{ id: 'w1', url: 'https://ws.test/', title: 'WS', addedAt: 0, lastModifiedAt: 0 }],
    'ws-empty': [],
  };

  function seedExport() {
    useAppStore.setState({
      bookmarkTransferDialog: 'export',
      recentWorkspaces: [WS_ENTRY, WS_EMPTY_ENTRY],
      browserBookmarkFolders: EXPORT_FOLDERS,
      browserWorkspaceBookmarks: EXPORT_WS_BOOKMARKS,
    });
  }

  it('hides empty folders and empty categories, and toggles the hint card', async () => {
    seedExport();
    renderHost();

    // 有书签的工作区与目录显示；空工作区 / 空自建目录不显示（目录默认全部展开）
    expect(document.body.textContent).toContain(zhCN.browserCategoryWorkspace as string);
    expect(document.body.textContent).toContain(zhCN.browserCategoryUserFolder as string);
    expect(document.body.textContent).toContain('工作区A');
    expect(document.body.textContent).toContain('工具箱');
    expect(document.body.textContent).not.toContain('空工作区');
    expect(document.body.textContent).not.toContain('空盒子');

    // 左上角问号按钮：打开 / 关闭提示卡片
    const hintButton = screen.getByRole('button', {
      name: zhCN.bookmarkExportHintAriaLabel as string,
    });
    expect(hintButton).toBeTruthy();
    await userEvent.click(hintButton);
    expect(document.body.textContent).toContain('空目录不显示');
    await userEvent.click(hintButton);
  });

  it('selecting the whole 自建目录 category lists a single picked entry labelled 自建目录', async () => {
    seedExport();
    renderHost();

    const categoryRow = Array.from(document.querySelectorAll('.adl-search-ignore__row')).find(
      (row) => row.textContent?.includes(zhCN.bookmarkExportFolderRoot as string),
    ) as HTMLElement;
    const checkbox = categoryRow.querySelector('[role="checkbox"]') as HTMLElement;
    await userEvent.click(checkbox);

    expect(document.body.textContent).toContain(`${zhCN.bookmarkExportPicked} (1)`);
    // 条目 label 为分类名（此前 name 为空，右侧面板显示空白行）
    expect(document.querySelector('[title="自建目录"]')).toBeTruthy();
  });
});
