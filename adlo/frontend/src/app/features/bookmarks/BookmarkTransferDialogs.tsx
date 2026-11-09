import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import type { CopyDict } from '@i18n';
import {
  IconCheck,
  IconCheckCheck,
  IconChevronDown,
  IconChevronRight,
  IconClearDisplay,
  IconCircleHelp,
  IconClose,
  IconFileTree,
  IconFolder,
  IconFolderPlus,
  IconFoldVertical,
  IconNewFolder,
  IconUnfoldVertical,
} from '@icons';
import { HintCardTrigger } from '../../components/HintCard';
import { parseBookmarkHtml } from './bookmarkHtml';
import type { TransferNode } from './bookmarkTransferTypes';
import type { BookmarkImportTarget } from '@stores/slices/bookmarkTransferSlice';
import type { FileTreeRenderableNode } from '@features/file-tree/fileTree.utils';
import { buildBookmarkDirectoryTree } from '@features/browser/browserPanelHelpers';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import {
  buildBookmarkSelectionTree,
  buildExportNodes,
  collectLeafIds,
  pruneEmptySelection,
  selectionStateOf,
  type BookmarkSelectionNode,
} from './collectExportTree';
import {
  countBookmarks,
  countFolders,
  MAX_BOOKMARK_FILE_BYTES,
  useBookmarkTransfer,
} from './useBookmarkTransfer';

const INDENT = 14;
const DIVIDER_MIN = 180;
const DIVIDER_MAX = 480;

type CheckState = 'checked' | 'partial' | 'none';

function CheckBox({
  state,
  label,
  onToggle,
}: {
  state: CheckState;
  label: string;
  onToggle: () => void;
}) {
  const cls = state === 'checked' ? ' is-checked' : state === 'partial' ? ' is-partial' : '';
  return (
    <span
      className={`adl-search-ignore__check${cls}`}
      role="checkbox"
      aria-checked={state === 'partial' ? 'mixed' : state === 'checked' ? 'true' : 'false'}
      aria-label={label}
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          onToggle();
        }
      }}
    >
      {state === 'checked' ? <IconCheck size={12} decorative /> : null}
    </span>
  );
}

/** 对话框通用键盘与焦点契约：Escape 关闭、Tab 循环、打开时聚焦、关闭归还焦点。 */
function useDialogA11y(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) {
        return;
      }
      event.preventDefault();
      const index = focusables.indexOf(document.activeElement as HTMLElement);
      const step = event.shiftKey ? -1 : 1;
      const next =
        index === -1
          ? event.shiftKey
            ? focusables.length - 1
            : 0
          : (index + step + focusables.length) % focusables.length;
      focusables[next].focus();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      previous?.focus?.();
    };
  }, [open, onClose]);
  return panelRef;
}

/** 可拖拽分隔条：指针捕获 + rAF 节流 + 卸载清理，宽度限制 180–480。 */
function useResizableSplit(initial = 240) {
  const [width, setWidth] = useState(initial);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      cleanupRef.current?.();
      window.cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }
    const handle = event.currentTarget;
    handle.setPointerCapture?.(event.pointerId);
    const rect = frame.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = window.requestAnimationFrame(() => {
        const raw = rect.right - ev.clientX;
        setWidth(Math.max(DIVIDER_MIN, Math.min(DIVIDER_MAX, raw)));
      });
    };
    const up = () => {
      window.cancelAnimationFrame(rafRef.current);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      cleanupRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    cleanupRef.current = up;
    event.preventDefault();
  }, []);

  return { width, frameRef, onPointerDown };
}

function ExportRow({
  node,
  depth,
  path,
  selected,
  expanded,
  onToggleSelect,
  onToggleExpand,
}: {
  node: BookmarkSelectionNode;
  depth: number;
  path: string;
  selected: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
  onToggleSelect: (node: BookmarkSelectionNode) => void;
  onToggleExpand: (id: string) => void;
}) {
  const isLeaf = node.kind === 'bookmark';
  const isOpen = expanded.has(node.id);
  return (
    <li className="adl-search-ignore__item">
      <div className="adl-search-ignore__row" title={path}>
        <CheckBox
          state={selectionStateOf(node, selected)}
          label={path}
          onToggle={() => onToggleSelect(node)}
        />
        <div className="adl-search-ignore__row-body" style={{ paddingLeft: depth * INDENT }}>
          {isLeaf ? (
            <span className="adl-search-ignore__toggle" aria-hidden="true" />
          ) : (
            <button
              type="button"
              className="adl-search-ignore__toggle"
              aria-label={path}
              aria-expanded={isOpen ? 'true' : 'false'}
              onClick={() => onToggleExpand(node.id)}
            >
              {isOpen ? (
                <IconChevronDown size={12} decorative />
              ) : (
                <IconChevronRight size={12} decorative />
              )}
            </button>
          )}
          <button
            type="button"
            className="adl-search-ignore__label"
            title={path}
            onClick={() => (isLeaf ? onToggleSelect(node) : onToggleExpand(node.id))}
          >
            <span className={`adl-search-ignore__label-text${isLeaf ? '' : ' is-folder'}`}>
              {node.name || path}
            </span>
          </button>
        </div>
      </div>
    </li>
  );
}

function flattenSelection(
  nodes: BookmarkSelectionNode[],
  expanded: ReadonlySet<string>,
  depth: number,
  prefix: string,
): { node: BookmarkSelectionNode; depth: number; path: string }[] {
  const rows: { node: BookmarkSelectionNode; depth: number; path: string }[] = [];
  for (const node of nodes) {
    // 分类根 name 为空，回退为 prefix（树行展开/折叠 aria-label 与 title 依赖此 path）
    const path = node.name ? (prefix ? `${prefix} / ${node.name}` : node.name) : prefix;
    rows.push({ node, depth, path });
    if (node.kind !== 'bookmark' && expanded.has(node.id)) {
      rows.push(...flattenSelection(node.children, expanded, depth + 1, path));
    }
  }
  return rows;
}

/** 「将导出」清单：整目录命中就停，未命中则下钻，最终每条都可单独移除。 */
interface PickedItem {
  id: string;
  label: string;
  count: number;
  isDir: boolean;
}

function resolvePicked(
  nodes: BookmarkSelectionNode[],
  selected: ReadonlySet<string>,
  out: PickedItem[] = [],
  prefix = '',
): PickedItem[] {
  for (const node of nodes) {
    const state = selectionStateOf(node, selected);
    if (state === 'none') {
      continue;
    }
    // 分类根（工作区目录 / 自建目录）name 为空，回退为 prefix 提供的分类名
    const label = node.name ? (prefix ? `${prefix} / ${node.name}` : node.name) : prefix;
    if (state === 'checked' || node.kind === 'bookmark') {
      out.push({ id: node.id, label, count: node.bookmarkCount, isDir: node.kind !== 'bookmark' });
    } else {
      resolvePicked(node.children, selected, out, label);
    }
  }
  return out;
}

function ExportDialog() {
  const { t, formatT } = useTCopy();
  const { exportBookmarks } = useBookmarkTransfer();
  const setDialog = useAppStore((s) => s.setBookmarkTransferDialog);
  const { workspaces, folders, workspaceBookmarks } = useAppStore(
    useShallow((s) => ({
      workspaces: s.recentWorkspaces,
      folders: s.browserBookmarkFolders,
      workspaceBookmarks: s.browserWorkspaceBookmarks,
    })),
  );

  // 隐藏没有书签的目录/分类（递归剪枝后空子树直接不渲染；注意空分类可能从数组位置 1 消失，必须各自剪枝）
  const { workspaceRoot, folderRoot } = useMemo(() => {
    const raw = buildBookmarkSelectionTree({ workspaces, folders, workspaceBookmarks });
    const prune = (root: BookmarkSelectionNode) => pruneEmptySelection([root])[0] ?? null;
    return {
      workspaceRoot: prune(raw.workspaceRoot),
      folderRoot: prune(raw.folderRoot),
    };
  }, [workspaces, folders, workspaceBookmarks]);

  const roots = useMemo(
    () =>
      [workspaceRoot, folderRoot].filter((root): root is BookmarkSelectionNode => root !== null),
    [workspaceRoot, folderRoot],
  );
  const allLeafIds = useMemo(() => roots.flatMap((root) => collectLeafIds(root)), [roots]);
  const allDirIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (nodes: BookmarkSelectionNode[]) => {
      for (const node of nodes) {
        if (node.kind !== 'bookmark') {
          ids.push(node.id);
          walk(node.children);
        }
      }
    };
    walk(roots);
    return ids;
  }, [roots]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // 与导入第 1 步一致：目录默认全部展开
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(allDirIds));
  const [busy, setBusy] = useState(false);
  const split = useResizableSplit();
  const close = useCallback(() => setDialog(null), [setDialog]);
  const panelRef = useDialogA11y(true, close);

  const toggleSelect = useCallback((node: BookmarkSelectionNode) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const leafIds = collectLeafIds(node);
      const allSelected = leafIds.every((id) => next.has(id));
      for (const id of leafIds) {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const allExpanded = allDirIds.length > 0 && allDirIds.every((id) => expanded.has(id));

  const workspaceRows = workspaceRoot
    ? flattenSelection([workspaceRoot], expanded, 0, t.bookmarkExportWorkspaceRoot as string)
    : [];
  const folderRows = folderRoot
    ? flattenSelection([folderRoot], expanded, 0, t.bookmarkExportFolderRoot as string)
    : [];

  const exportNodes = useMemo(
    () => [
      ...(workspaceRoot ? buildExportNodes(workspaceRoot, selected) : []),
      ...(folderRoot ? buildExportNodes(folderRoot, selected) : []),
    ],
    [workspaceRoot, folderRoot, selected],
  );
  const bookmarkCount = countBookmarks(exportNodes);
  const folderCount = countFolders(exportNodes);
  const picked = useMemo(() => {
    const out: PickedItem[] = [];
    if (workspaceRoot) {
      resolvePicked([workspaceRoot], selected, out, t.bookmarkExportWorkspaceRoot as string);
    }
    if (folderRoot) {
      resolvePicked([folderRoot], selected, out, t.bookmarkExportFolderRoot as string);
    }
    return out;
  }, [workspaceRoot, folderRoot, selected, t]);

  const handleExport = useCallback(async () => {
    if (bookmarkCount === 0 || busy) {
      return;
    }
    setBusy(true);
    try {
      const ok = await exportBookmarks(exportNodes, t.bookmarkExportFileTitle as string);
      if (ok) {
        close();
      }
    } finally {
      setBusy(false);
    }
  }, [bookmarkCount, busy, close, exportBookmarks, exportNodes, t]);

  return (
    <div className="adl-prompt-modal" onClick={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={panelRef}
        className="adl-prompt-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={t.bookmarkExportTitle as string}
        tabIndex={-1}
        style={{
          width: 'min(94vw, 780px)',
          padding: '6px 0 0',
          height: 600,
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '2px 8px 0',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
            <HintCardTrigger content={t.bookmarkExportHint as string}>
              <button
                type="button"
                className="adl-iconstrip__button"
                style={{ width: 20, height: 20 }}
                aria-label={t.bookmarkExportHintAriaLabel as string}
              >
                <IconCircleHelp size={12} decorative />
              </button>
            </HintCardTrigger>
            <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {t.bookmarkExportTitle as string}
            </span>
          </span>
          <button
            type="button"
            className="adl-prompt-modal__header-close"
            aria-label={t.close as string}
            onClick={close}
          >
            <IconClose size={14} decorative />
          </button>
        </div>

        <div
          style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, paddingTop: 6 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 16px 6px' }}>
            <button
              type="button"
              className="adl-iconstrip__button"
              style={{ width: 28, height: 28 }}
              title={t.bookmarkExportSelectAll as string}
              aria-label={t.bookmarkExportSelectAll as string}
              onClick={() => setSelected(new Set(allLeafIds))}
            >
              <IconCheckCheck size={14} decorative />
            </button>
            <button
              type="button"
              className="adl-iconstrip__button"
              style={{ width: 28, height: 28 }}
              title={t.bookmarkExportClear as string}
              aria-label={t.bookmarkExportClear as string}
              onClick={() => setSelected(new Set())}
            >
              <IconClearDisplay size={14} decorative />
            </button>
            <span style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 6px' }} />
            <button
              type="button"
              className="adl-iconstrip__button"
              style={{ width: 28, height: 28 }}
              title={allExpanded ? (t.collapseAll as string) : (t.expandAll as string)}
              aria-label={allExpanded ? (t.collapseAll as string) : (t.expandAll as string)}
              onClick={
                allExpanded ? () => setExpanded(new Set()) : () => setExpanded(new Set(allDirIds))
              }
            >
              {allExpanded ? (
                <IconFoldVertical size={14} decorative />
              ) : (
                <IconUnfoldVertical size={14} decorative />
              )}
            </button>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {formatT(t as CopyDict, 'bookmarkExportSelected', {
                count: bookmarkCount,
                total: allLeafIds.length,
                folders: folderCount,
              })}
            </span>
          </div>

          <div
            ref={split.frameRef}
            style={{
              display: 'flex',
              margin: '0 16px',
              border: '1px solid var(--border)',
              borderRadius: 0,
              overflow: 'hidden',
              minHeight: 0,
              flex: 1,
            }}
          >
            <CustomScrollArea
              shellClassName="adl-search-ignore__scroll adl-search-ignore__scroll--fill"
              scrollClassName="adl-search-ignore__scroll-area"
              scrollbarClassName="adl-multitree-scrollbar"
              thumbClassName="adl-multitree-scrollbar__thumb"
            >
              <ul className="adl-search-ignore__tree" role="tree">
                {[...workspaceRows, ...folderRows].map(({ node, depth, path }) => (
                  <ExportRow
                    key={node.id}
                    node={node}
                    depth={depth}
                    path={path}
                    selected={selected}
                    expanded={expanded}
                    onToggleSelect={toggleSelect}
                    onToggleExpand={toggleExpand}
                  />
                ))}
              </ul>
            </CustomScrollArea>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t.bookmarkExportResize as string}
              aria-valuemin={DIVIDER_MIN}
              aria-valuemax={DIVIDER_MAX}
              aria-valuenow={split.width}
              tabIndex={0}
              onPointerDown={split.onPointerDown}
              style={{
                flex: '0 0 6px',
                cursor: 'col-resize',
                borderLeft: '1px solid var(--border)',
                background: 'transparent',
              }}
            />
            <div
              className="adl-bookmark-picklist"
              style={{
                flex: `0 0 ${split.width}px`,
                padding: '6px 10px',
                overflow: 'auto',
                height: '100%',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingBottom: 6 }}>
                {t.bookmarkExportPicked as string} ({picked.length})
              </div>
              {picked.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t.bookmarkExportNothingPicked as string}
                </div>
              ) : (
                picked.map((item) => (
                  <div
                    key={item.id}
                    title={item.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      padding: '2px 0',
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.label}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {item.isDir ? item.count : ''}
                    </span>
                    <button
                      type="button"
                      className="adl-icon-btn adl-icon-btn--xs"
                      aria-label={t.browserContextDelete as string}
                      onClick={() => {
                        const node = findNodeById(roots, item.id);
                        if (node) {
                          toggleSelect(node);
                        }
                      }}
                    >
                      <IconClose size={12} decorative />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div
          className="adl-prompt-modal__actions adl-prompt-modal__actions--fill"
          style={{ padding: '14px 16px 14px' }}
        >
          <button
            type="button"
            className="adl-btn adl-btn--secondary adl-btn--square"
            onClick={close}
          >
            {t.cancel as string}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary adl-btn--square"
            disabled={bookmarkCount === 0 || busy}
            onClick={() => void handleExport()}
          >
            {t.bookmarkExportConfirm as string}
          </button>
        </div>
      </div>
    </div>
  );
}

function findNodeById(
  nodes: BookmarkSelectionNode[],
  id: string,
): BookmarkSelectionNode | undefined {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const found = findNodeById(node.children, id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function collectTransferLeaves(node: TransferNode, out: TransferNode[] = []): TransferNode[] {
  if (node.kind === 'bookmark') {
    out.push(node);
    return out;
  }
  for (const child of node.folder.children) {
    collectTransferLeaves(child, out);
  }
  return out;
}

function pruneTransfer(nodes: TransferNode[], excluded: ReadonlySet<string>): TransferNode[] {
  const out: TransferNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'bookmark') {
      if (!excluded.has(node.url)) {
        out.push(node);
      }
      continue;
    }
    const children = pruneTransfer(node.folder.children, excluded);
    if (children.length > 0) {
      out.push({ kind: 'folder', folder: { name: node.folder.name, children } });
    }
  }
  return out;
}

function ImportDialog() {
  const { t, formatT } = useTCopy();
  const setDialog = useAppStore((s) => s.setBookmarkTransferDialog);
  const importBookmarks = useAppStore((s) => s.browserImportBookmarks);
  const { workspaces, folders } = useAppStore(
    useShallow((s) => ({
      workspaces: s.recentWorkspaces,
      folders: s.browserBookmarkFolders,
    })),
  );
  const showToast = useAppStore((s) => s.showToast);
  const directoryTree = useMemo(
    () => buildBookmarkDirectoryTree(workspaces, folders),
    [workspaces, folders],
  );
  // 菜单路径在挂载前已选完文件并暂存解析结果到 store；此处一次性消费，避免下次打开复用旧数据
  const [draft] = useState(() => useAppStore.getState().bookmarkImportDraft);
  const defaultFolderName = useMemo(() => {
    const base = (t.bookmarkImportDefaultName as string) || 'bookmarks';
    const now = new Date();
    return `${base}_${now.getFullYear()}_${now.getMonth() + 1}_${now.getDate()}`;
  }, [t]);

  const [step, setStep] = useState<1 | 2>(1);
  const [fileName, setFileName] = useState(draft?.fileName ?? '');
  const [nodes, setNodes] = useState<TransferNode[]>(() =>
    draft?.nodes ? pruneEmptyTransfer(draft.nodes) : [],
  );
  const [invalidCount, setInvalidCount] = useState(draft?.invalidCount ?? 0);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  // 第 2 步「导入目标」：B · 左右分栏（图标+标题+提示导航 + 右侧详情面板）
  const [importMode, setImportMode] = useState<'original' | 'newTop' | 'existing'>('original');
  const [newDirName, setNewDirName] = useState(draft ? defaultFolderName : '');
  const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(null);
  const [pendingNested, setPendingNested] = useState<{ parentKey: string; name: string } | null>(
    null,
  );
  const [nesting, setNesting] = useState(false);
  const [nestInputValue, setNestInputValue] = useState('');
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(
    () => new Set(collectDirectoryPaths(directoryTree)),
  );
  // 目录展开状态：默认全部展开（与导入前全选一致），路径即 folder 的树行 path
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(draft ? allFolderPaths(draft.nodes) : []),
  );
  const split = useResizableSplit();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const close = useCallback(() => setDialog(null), [setDialog]);
  const panelRef = useDialogA11y(true, close);

  useEffect(() => {
    if (draft) {
      useAppStore.getState().setBookmarkImportDraft(null);
    }
  }, [draft]);

  const onPickFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_BOOKMARK_FILE_BYTES) {
        showToast(t.bookmarkImportTooLarge as string, 'error');
        return;
      }
      try {
        const html = await file.text();
        const parsed = parseBookmarkHtml(html);
        const validCount = countBookmarks(parsed.nodes);
        if (validCount === 0) {
          // 只含无效链接的文件按"解析失败"处理：不进入选择步骤
          showToast(t.bookmarkImportEmpty as string, 'error');
          return;
        }
        setFileName(file.name);
        setNodes(pruneEmptyTransfer(parsed.nodes));
        setInvalidCount(parsed.invalidCount);
        setNewDirName(defaultFolderName);
        setImportMode('original');
        setSelectedTargetKey(null);
        setPendingNested(null);
        setNesting(false);
        setNestInputValue('');
        setExcluded(new Set());
        setExpanded(new Set(allFolderPaths(parsed.nodes)));
        setStep(1);
      } catch {
        // 与菜单入口 startBookmarkImportPick 同一口径：读文件失败走错误提示
        showToast(t.bookmarkImportFailed as string, 'error');
      }
    },
    [defaultFolderName, showToast, t],
  );

  // 勾选状态按**叶子 URL** 记账：文件夹的勾选即"其下全部叶子"，避免行状态与剪枝口径不一致
  const toggleExcluded = useCallback((node: TransferNode) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      const leaves = collectTransferLeaves(node);
      const allIncluded = leaves.every((leaf) =>
        leaf.kind === 'bookmark' ? !next.has(leaf.url) : false,
      );
      for (const leaf of leaves) {
        if (leaf.kind !== 'bookmark') {
          continue;
        }
        if (allIncluded) {
          next.add(leaf.url);
        } else {
          next.delete(leaf.url);
        }
      }
      return next;
    });
  }, []);

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const allDirPaths = useMemo(() => allFolderPaths(nodes), [nodes]);
  const allExpanded = allDirPaths.length > 0 && allDirPaths.every((path) => expanded.has(path));
  const selectAll = useCallback(() => setExcluded(new Set()), []);
  const clearAll = useCallback(() => setExcluded(new Set(allLeafUrls(nodes))), [nodes]);
  const expandAll = useCallback(() => setExpanded(new Set(allDirPaths)), [allDirPaths]);
  const collapseAll = useCallback(() => setExpanded(new Set()), []);
  // 节点无 id，按对象同一性分配稳定 key（同名同位置的重复书签路径相同，
  // 用 path+depth 当 key 会撞，React 无法正确回收 DOM，折叠/展开会残留僵尸行）
  const nodeKeys = useMemo(() => {
    const map = new Map<TransferNode, string>();
    let i = 0;
    const walk = (list: TransferNode[]) => {
      for (const node of list) {
        map.set(node, `n${i}`);
        i += 1;
        if (node.kind === 'folder') {
          walk(node.folder.children);
        }
      }
    };
    walk(nodes);
    return map;
  }, [nodes]);

  const keptNodes = useMemo(() => pruneTransfer(nodes, excluded), [nodes, excluded]);
  const keptCount = countBookmarks(keptNodes);
  const keptFolders = countFolders(keptNodes);
  const rows = useMemo(() => flattenTransfer(nodes, expanded, 0, ''), [nodes, expanded]);
  const picked = useMemo(() => resolveImportPicked(nodes, excluded), [nodes, excluded]);
  const topLevelUserFolderNames = useMemo(
    () => new Set(folders.filter((f) => !f.parentId).map((f) => f.name)),
    [folders],
  );
  const newDirNameError = useMemo(() => {
    const name = newDirName.trim();
    if (!name) {
      return t.bookmarkImportNameEmpty as string;
    }
    if (topLevelUserFolderNames.has(name)) {
      return formatT(t as CopyDict, 'bookmarkImportNameClash', { name });
    }
    return '';
  }, [newDirName, topLevelUserFolderNames, t, formatT]);
  const directoryRows = useMemo(
    () => ({
      wsRows: flattenDirectoryTree(directoryTree.workspaceNodes, treeExpanded, 0, ''),
      folderRows: flattenDirectoryTree(directoryTree.userFolderNodes, treeExpanded, 0, ''),
    }),
    [directoryTree, treeExpanded],
  );
  const previewOriginal = useMemo(
    () => formatPreviewTree(t.browserCategoryUserFolder as string, keptNodes),
    [keptNodes, t],
  );
  const previewNewTop = useMemo(() => {
    const name = newDirName.trim() || '…';
    return formatPreviewTree(t.browserCategoryUserFolder as string, keptNodes, name);
  }, [keptNodes, newDirName, t]);
  const targetPathLabel = useMemo(() => {
    const rows = [...directoryRows.wsRows, ...directoryRows.folderRows];
    if (pendingNested) {
      const parentRow = rows.find((r) => r.node.path === pendingNested.parentKey);
      return `${parentRow?.path ?? pendingNested.parentKey} / ${pendingNested.name}`;
    }
    const selectedRow = selectedTargetKey
      ? rows.find((r) => r.node.path === selectedTargetKey)
      : null;
    return selectedRow?.path ?? '';
  }, [directoryRows, pendingNested, selectedTargetKey]);
  const goToStep = useCallback(
    (target: 1 | 2) => {
      if (target === 2 && keptCount === 0) {
        return;
      }
      setStep(target);
    },
    [keptCount],
  );

  const modeOptions = [
    {
      id: 'original' as const,
      title: t.bookmarkImportModeOriginal as string,
      desc: t.bookmarkImportModeOriginalDesc as string,
      icon: <IconFileTree size={16} decorative />,
    },
    {
      id: 'newTop' as const,
      title: t.bookmarkImportModeNewTop as string,
      desc: t.bookmarkImportModeNewTopDesc as string,
      icon: <IconFolderPlus size={16} decorative />,
    },
    {
      id: 'existing' as const,
      title: t.bookmarkImportModeExisting as string,
      desc: t.bookmarkImportModeExistingDesc as string,
      icon: <IconFolder size={16} decorative />,
    },
  ];
  const renderDirRow = (row: {
    node: FileTreeRenderableNode & { pending?: boolean };
    depth: number;
    path: string;
  }) => {
    const node = row.node;
    const isPending = node.pending === true;
    const hasChildren = node.children.length > 0;
    const isOpen = hasChildren ? treeExpanded.has(node.path) : false;
    const selected = selectedTargetKey === row.node.path;
    const pendingSelected = pendingNested !== null && pendingNested.parentKey === row.node.path;
    const showSelected = selected || (isPending && pendingSelected);
    const dirCount = countDirectoryDescendants(node);
    return (
      <li key={row.node.path}>
        <div
          title={row.path}
          role="option"
          aria-selected={showSelected}
          aria-expanded={hasChildren ? (isOpen ? 'true' : 'false') : undefined}
          onClick={() => {
            if (isPending) {
              setSelectedTargetKey(pendingNested!.parentKey);
              return;
            }
            if (hasChildren) {
              setTreeExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(node.path)) {
                  next.delete(node.path);
                } else {
                  next.add(node.path);
                }
                return next;
              });
            }
            setSelectedTargetKey(node.path);
            if (pendingNested && pendingNested.parentKey !== node.path) {
              setPendingNested(null);
            }
          }}
          className={`adl-target-tree__row${showSelected ? ' is-selected' : ''}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 28,
            padding: `0 10px 0 ${10 + row.depth * 16}px`,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <span
            aria-hidden="true"
            style={{ flex: '0 0 16px', display: 'flex', color: 'var(--text-muted)' }}
          >
            {isPending ? null : hasChildren ? (
              isOpen ? (
                <IconChevronDown size={12} decorative />
              ) : (
                <IconChevronRight size={12} decorative />
              )
            ) : null}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.name}
          </span>
          {isPending && (
            <span
              style={{
                fontSize: 9,
                color: 'var(--text-muted)',
                border: '1px dashed rgba(255,255,255,0.18)',
                borderRadius: 2,
                padding: '0 5px',
                marginLeft: 6,
              }}
            >
              {t.bookmarkImportNestedBadge as string}
            </span>
          )}
          {hasChildren ? (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
              {formatT(t as CopyDict, 'bookmarkImportDirCount', { count: dirCount })}
            </span>
          ) : null}
          {isPending && (
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              aria-label={t.cancel as string}
              style={{ marginLeft: 'auto' }}
              onClick={(event) => {
                event.stopPropagation();
                setPendingNested(null);
              }}
            >
              <IconClose size={12} decorative />
            </button>
          )}
        </div>
      </li>
    );
  };
  const withPendingRow = (
    rows: { node: FileTreeRenderableNode; depth: number; path: string }[],
  ): { node: FileTreeRenderableNode & { pending?: boolean }; depth: number; path: string }[] => {
    if (!pendingNested) {
      return rows;
    }
    return rows.flatMap((row) => {
      if (row.node.path !== pendingNested.parentKey) {
        return [row];
      }
      const pendingRow = {
        node: {
          path: `${row.node.path}/${pendingNested.name}`,
          name: pendingNested.name,
          kind: 'directory' as const,
          children: [],
          pending: true as const,
        },
        depth: row.depth + 1,
        path: `${row.path} / ${pendingNested.name}`,
      };
      return [row, pendingRow];
    });
  };
  const renderSectionLabel = (label: string) => (
    <div
      key={`section-${label}`}
      style={{
        fontSize: 10,
        color: 'var(--text-muted)',
        letterSpacing: '0.08em',
        padding: '6px 12px 2px',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </div>
  );
  const openNesting = () => {
    setNesting(true);
    setNestInputValue('');
  };
  const confirmNest = () => {
    const name = nestInputValue.trim();
    if (!name || !selectedTargetKey) {
      return;
    }
    setPendingNested({ parentKey: selectedTargetKey, name });
    setNesting(false);
    setNestInputValue('');
  };
  const cancelNest = () => {
    setNesting(false);
    setNestInputValue('');
  };
  const buildImportTarget = useCallback((): BookmarkImportTarget | null => {
    if (importMode === 'original') {
      return { kind: 'self-root', looseFolderName: t.bookmarkImportRootFolderName as string };
    }
    if (importMode === 'newTop') {
      const name = newDirName.trim();
      if (!name || newDirNameError) {
        return null;
      }
      return { kind: 'new-folder', name };
    }
    if (pendingNested) {
      if (!pendingNested.name.trim()) {
        return null;
      }
      const resolved = resolveSelectedKey(pendingNested.parentKey);
      if (!resolved) {
        return null;
      }
      return {
        kind: 'child-folder',
        parentId: resolved.id,
        parentType: resolved.parentType,
        name: pendingNested.name.trim(),
      };
    }
    if (selectedTargetKey) {
      const resolved = resolveSelectedKey(selectedTargetKey);
      if (resolved) {
        return resolved.parentType === 'workspace'
          ? { kind: 'workspace', id: resolved.id }
          : { kind: 'folder', id: resolved.id };
      }
    }
    return null;
  }, [importMode, newDirName, newDirNameError, pendingNested, selectedTargetKey, t]);
  const canConfirm = keptCount > 0 && buildImportTarget() !== null;

  const handleImport = useCallback(() => {
    if (keptCount === 0) {
      return;
    }
    const target = buildImportTarget();
    if (!target) {
      return;
    }
    const result = importBookmarks({ nodes: keptNodes, target, duplicatePolicy: 'skip' });
    const skipped =
      result.skipped > 0
        ? ` ${formatT(t as CopyDict, 'bookmarkImportSkipped', { count: result.skipped })}`
        : '';
    showToast(
      formatT(t as CopyDict, 'bookmarkImportSuccess', {
        count: result.importedBookmarks,
        folders: result.importedFolders,
      }) + skipped,
      'success',
    );
    close();
  }, [close, buildImportTarget, formatT, importBookmarks, keptCount, keptNodes, showToast, t]);

  return (
    <div className="adl-prompt-modal" onClick={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={panelRef}
        className="adl-prompt-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={t.bookmarkImportTitle as string}
        tabIndex={-1}
        style={{
          width: 'min(94vw, 780px)',
          padding: '6px 0 0',
          height: 600,
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '2px 8px 0',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
            <HintCardTrigger
              content={
                (step === 1 ? t.bookmarkImportHintStep1 : t.bookmarkImportHintStep2) as string
              }
            >
              <button
                type="button"
                className="adl-iconstrip__button"
                style={{ width: 20, height: 20 }}
                aria-label={t.bookmarkImportHintAriaLabel as string}
              >
                <IconCircleHelp size={12} decorative />
              </button>
            </HintCardTrigger>
            <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {t.bookmarkImportTitle as string}
            </span>
            {fileName ? (
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  marginLeft: 6,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={fileName}
              >
                {fileName}
              </span>
            ) : null}
          </span>
          <button
            type="button"
            className="adl-prompt-modal__header-close"
            aria-label={t.close as string}
            onClick={close}
          >
            <IconClose size={14} decorative />
          </button>
        </div>

        {nodes.length === 0 ? (
          <div style={{ padding: '8px 16px 16px' }}>
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm,text/html"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  void onPickFile(file);
                }
              }}
            />
            <button
              type="button"
              className="adl-btn adl-btn--primary"
              onClick={() => fileRef.current?.click()}
            >
              {t.bookmarkImportPickFile as string}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* 顶部两块区域（胜出方案 A · 分段控制器，按反馈落地） */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '0 16px 23px' }}>
              <div
                role="tablist"
                style={{
                  display: 'flex',
                  gap: 4,
                  padding: 3,
                  background: 'var(--surface-subtle)',
                  borderRadius: 8,
                }}
              >
                {[
                  { n: 1 as const, label: t.bookmarkImportStepPick as string },
                  { n: 2 as const, label: t.bookmarkImportStepTarget as string },
                ].map((seg) => {
                  const active = step === seg.n;
                  const disabled = seg.n === 2 && keptCount === 0;
                  return (
                    <button
                      key={seg.n}
                      role="tab"
                      aria-selected={active}
                      disabled={disabled}
                      onClick={() => goToStep(seg.n)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 14px',
                        fontSize: 12,
                        border: 'none',
                        borderRadius: 6,
                        cursor: disabled ? 'default' : 'pointer',
                        background: active ? 'var(--bg-elevated)' : 'transparent',
                        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                        fontWeight: active ? 600 : 400,
                        boxShadow: active ? '0 1px 2px rgb(0 0 0 / 0.18)' : 'none',
                      }}
                    >
                      <span style={{ fontSize: 10, opacity: 0.7 }}>{seg.n}</span>
                      {seg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {step === 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 16px 6px' }}>
                <button
                  type="button"
                  className="adl-iconstrip__button"
                  style={{ width: 28, height: 28 }}
                  title={t.bookmarkImportSelectAll as string}
                  aria-label={t.bookmarkImportSelectAll as string}
                  onClick={selectAll}
                >
                  <IconCheckCheck size={14} decorative />
                </button>
                <button
                  type="button"
                  className="adl-iconstrip__button"
                  style={{ width: 28, height: 28 }}
                  title={t.bookmarkImportClear as string}
                  aria-label={t.bookmarkImportClear as string}
                  onClick={clearAll}
                >
                  <IconClearDisplay size={14} decorative />
                </button>
                <span
                  style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 6px' }}
                />
                <button
                  type="button"
                  className="adl-iconstrip__button"
                  style={{ width: 28, height: 28 }}
                  title={allExpanded ? (t.collapseAll as string) : (t.expandAll as string)}
                  aria-label={allExpanded ? (t.collapseAll as string) : (t.expandAll as string)}
                  onClick={allExpanded ? collapseAll : expandAll}
                >
                  {allExpanded ? (
                    <IconFoldVertical size={14} decorative />
                  ) : (
                    <IconUnfoldVertical size={14} decorative />
                  )}
                </button>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {formatT(t as CopyDict, 'bookmarkImportSelected', {
                    count: keptCount,
                    total: countBookmarks(nodes),
                  })}
                </span>
              </div>
            )}

            {step === 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div
                  ref={split.frameRef}
                  style={{
                    display: 'flex',
                    margin: '0 16px',
                    border: '1px solid var(--border)',
                    borderRadius: 0,
                    overflow: 'hidden',
                    minHeight: 0,
                  }}
                >
                  <CustomScrollArea
                    shellClassName="adl-search-ignore__scroll adl-search-ignore__scroll--flush"
                    scrollClassName="adl-search-ignore__scroll-area"
                    scrollbarClassName="adl-multitree-scrollbar"
                    thumbClassName="adl-multitree-scrollbar__thumb"
                  >
                    <ul className="adl-search-ignore__tree" role="tree">
                      {rows.map(({ node, depth, path }) => (
                        <ImportRow
                          key={nodeKeys.get(node) ?? `${path}-${depth}`}
                          node={node}
                          depth={depth}
                          path={path}
                          excluded={excluded}
                          expanded={expanded}
                          onToggleSelect={toggleExcluded}
                          onToggleExpand={toggleExpand}
                        />
                      ))}
                    </ul>
                  </CustomScrollArea>
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={t.bookmarkImportResize as string}
                    aria-valuemin={DIVIDER_MIN}
                    aria-valuemax={DIVIDER_MAX}
                    aria-valuenow={split.width}
                    tabIndex={0}
                    onPointerDown={split.onPointerDown}
                    style={{
                      flex: '0 0 6px',
                      cursor: 'col-resize',
                      borderLeft: '1px solid var(--border)',
                      background: 'transparent',
                    }}
                  />
                  <div
                    className="adl-bookmark-picklist"
                    style={{
                      flex: `0 0 ${split.width}px`,
                      padding: '6px 10px',
                      overflow: 'auto',
                      height: 420,
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingBottom: 6 }}>
                      {t.bookmarkImportPicked as string} ({picked.length})
                    </div>
                    {picked.length === 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {t.bookmarkImportNothingPicked as string}
                      </div>
                    ) : (
                      picked.map((item) => (
                        <div
                          key={nodeKeys.get(item.node) ?? item.id}
                          title={item.label}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 11,
                            padding: '2px 0',
                          }}
                        >
                          <span
                            style={{
                              flex: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.label}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {item.isDir ? item.count : ''}
                          </span>
                          <button
                            type="button"
                            className="adl-icon-btn adl-icon-btn--xs"
                            aria-label={t.browserContextDelete as string}
                            onClick={() => toggleExcluded(item.node)}
                          >
                            <IconClose size={12} decorative />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                {invalidCount > 0 ? (
                  <p style={{ margin: '6px 16px 0', fontSize: 10, color: 'var(--text-muted)' }}>
                    {invalidCount} {t.bookmarkImportInvalid as string}
                  </p>
                ) : null}
              </div>
            ) : (
              <div
                style={{ display: 'flex', gap: 14, padding: '4px 16px 0', flex: 1, minHeight: 0 }}
              >
                <nav
                  role="radiogroup"
                  aria-label={t.bookmarkImportModeNavLabel as string}
                  style={{
                    width: 232,
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    overflowY: 'auto',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      letterSpacing: '0.09em',
                      padding: '2px 2px 8px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {t.bookmarkImportModeNavLabel as string}
                  </div>
                  {modeOptions.map((opt) => {
                    const active = importMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setImportMode(opt.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 9,
                          padding: 10,
                          borderRadius: 6,
                          border: active
                            ? '1px solid var(--border-strong)'
                            : '1px solid transparent',
                          background: active ? 'var(--bg-active)' : 'transparent',
                          cursor: 'pointer',
                          textAlign: 'left',
                          color: 'inherit',
                        }}
                      >
                        <span
                          style={{
                            display: 'flex',
                            marginTop: 1,
                            color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                          }}
                        >
                          {opt.icon}
                        </span>
                        <span
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                            minWidth: 0,
                          }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>
                            {opt.title}
                          </span>
                          <span
                            style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.45 }}
                          >
                            {opt.desc}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  {/* 左侧底部锚定：与右侧详情面板底边同一水平线 */}
                  <span
                    style={{
                      marginTop: 'auto',
                      padding: '10px 2px 0',
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                    }}
                  >
                    {formatT(t as CopyDict, 'bookmarkImportWillImport', {
                      count: keptCount,
                      folders: keptFolders,
                    })}
                  </span>
                </nav>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 0,
                    border: '1px solid var(--border)',
                    borderRadius: 0,
                    background: 'var(--surface-sunken)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px' }}>
                    {importMode === 'original' && (
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            letterSpacing: '0.09em',
                            textTransform: 'uppercase',
                            marginBottom: 6,
                          }}
                        >
                          {t.bookmarkImportPreviewTitle as string}
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <tbody>
                            {[
                              {
                                key: 'target',
                                k: t.bookmarkImportModeTarget as string,
                                v: (
                                  <>
                                    <b>{t.browserCategoryUserFolder as string}</b>{' '}
                                    <span
                                      style={{
                                        color: 'var(--text-secondary)',
                                        fontSize: 11,
                                      }}
                                    >
                                      （{t.bookmarkImportModeOriginalDesc as string}）
                                    </span>
                                  </>
                                ),
                              },
                              {
                                key: 'bookmarks',
                                k: t.bookmarkImportTableBookmarks as string,
                                v: countBookmarks(keptNodes),
                              },
                              {
                                key: 'folders',
                                k: t.bookmarkImportTableFolders as string,
                                v: countFolders(keptNodes),
                              },
                            ].map((row) => (
                              <tr key={row.key}>
                                <td
                                  style={{
                                    padding: '8px 10px',
                                    fontSize: 11.5,
                                    borderBottom: '1px solid var(--border)',
                                    color: 'var(--text-muted)',
                                    whiteSpace: 'nowrap',
                                    width: 88,
                                    verticalAlign: 'top',
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {row.k}
                                </td>
                                <td
                                  style={{
                                    padding: '8px 10px',
                                    fontSize: 11.5,
                                    borderBottom: '1px solid var(--border)',
                                    verticalAlign: 'top',
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {row.v}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div style={{ marginTop: 10 }}>
                          <CustomScrollArea
                            shellClassName="adl-search-ignore__scroll adl-preview-tree-shell"
                            scrollClassName="adl-search-ignore__scroll-area"
                            scrollbarClassName="adl-multitree-scrollbar"
                            thumbClassName="adl-multitree-scrollbar__thumb"
                          >
                            <pre
                              style={{
                                margin: 0,
                                padding: '10px 12px',
                                fontFamily: 'ui-monospace, Consolas, monospace',
                                fontSize: 11,
                                lineHeight: 1.9,
                                color: 'var(--text-secondary)',
                                whiteSpace: 'pre',
                              }}
                            >
                              {previewOriginal}
                            </pre>
                          </CustomScrollArea>
                        </div>
                      </div>
                    )}
                    {importMode === 'newTop' && (
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            letterSpacing: '0.09em',
                            textTransform: 'uppercase',
                            marginBottom: 6,
                          }}
                        >
                          {t.bookmarkImportCreateTitle as string}
                        </div>
                        <label
                          htmlFor="newDirName"
                          style={{
                            display: 'block',
                            fontSize: 11,
                            color: 'var(--text-secondary)',
                            marginBottom: 5,
                          }}
                        >
                          {t.bookmarkImportNameLabel as string}
                        </label>
                        <input
                          id="newDirName"
                          className={
                            newDirNameError
                              ? 'adl-prompt-modal__input adl-prompt-modal__input--error'
                              : 'adl-prompt-modal__input'
                          }
                          aria-invalid={newDirNameError ? true : undefined}
                          spellCheck={false}
                          value={newDirName}
                          onChange={(event) => setNewDirName(event.currentTarget.value)}
                          placeholder={t.bookmarkImportNamePlaceholder as string}
                          autoCorrect="off"
                        />
                        <div
                          role="alert"
                          style={{
                            fontSize: 10.5,
                            color: 'var(--danger)',
                            minHeight: 15,
                            marginTop: 5,
                          }}
                        >
                          {newDirNameError}
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <CustomScrollArea
                            shellClassName="adl-search-ignore__scroll adl-preview-tree-shell"
                            scrollClassName="adl-search-ignore__scroll-area"
                            scrollbarClassName="adl-multitree-scrollbar"
                            thumbClassName="adl-multitree-scrollbar__thumb"
                          >
                            <pre
                              style={{
                                margin: 0,
                                padding: '10px 12px',
                                fontFamily: 'ui-monospace, Consolas, monospace',
                                fontSize: 11,
                                lineHeight: 1.9,
                                color: 'var(--text-secondary)',
                                whiteSpace: 'pre',
                              }}
                            >
                              {previewNewTop}
                            </pre>
                          </CustomScrollArea>
                        </div>
                        <div
                          className="hint"
                          style={{ marginTop: 10, fontSize: 11, color: 'var(--text-secondary)' }}
                        >
                          {t.bookmarkImportCreateNote as string}
                        </div>
                      </div>
                    )}
                    {importMode === 'existing' && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          height: '100%',
                          minHeight: 0,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            letterSpacing: '0.09em',
                            textTransform: 'uppercase',
                            marginBottom: 6,
                          }}
                        >
                          {t.bookmarkImportExistingTitle as string}
                        </div>
                        <CustomScrollArea
                          shellClassName="adl-search-ignore__scroll adl-target-tree-shell"
                          scrollClassName="adl-search-ignore__scroll-area"
                          scrollbarClassName="adl-multitree-scrollbar"
                          thumbClassName="adl-multitree-scrollbar__thumb"
                        >
                          <ul
                            className="adl-search-ignore__tree"
                            role="tree"
                            style={{ listStyle: 'none', padding: 4, margin: 0 }}
                          >
                            {renderSectionLabel(t.browserCategoryWorkspace as string)}
                            {withPendingRow(directoryRows.wsRows).map(renderDirRow)}
                            {directoryRows.wsRows.length === 0 ? (
                              <div
                                className="adl-bookmark-dir-empty"
                                style={{ minHeight: 44, fontSize: 'var(--text-xs)' }}
                              >
                                {t.browserNoContent as string}
                              </div>
                            ) : null}
                            {renderSectionLabel(t.browserCategoryUserFolder as string)}
                            {directoryRows.folderRows.length === 0 ? (
                              <div
                                className="adl-bookmark-dir-empty"
                                style={{ minHeight: 44, fontSize: 'var(--text-xs)' }}
                              >
                                {t.browserNoContent as string}
                              </div>
                            ) : null}
                            {withPendingRow(directoryRows.folderRows).map(renderDirRow)}
                          </ul>
                        </CustomScrollArea>
                        <div style={{ marginTop: 8 }}>
                          <div
                            className="hint"
                            style={{
                              margin: 0,
                              fontSize: 11,
                              color: 'var(--text-secondary)',
                              lineHeight: 1.6,
                            }}
                          >
                            {t.bookmarkImportModeTarget as string}：
                            <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                              {targetPathLabel || (t.bookmarkImportModeNoSelection as string)}
                            </strong>
                            {pendingNested ? ` ${t.bookmarkImportNestedBadgePath as string}` : ''}
                          </div>
                          <div
                            className="hint"
                            style={{
                              margin: '6px 0 0',
                              fontSize: 11,
                              color: 'var(--text-secondary)',
                              lineHeight: 1.8,
                            }}
                          >
                            {t.bookmarkImportNestedHintPrefix as string}{' '}
                            <button
                              type="button"
                              className="adl-btn adl-btn--secondary adl-btn--sm adl-btn--square"
                              style={{ verticalAlign: '-2px', margin: '0 2px' }}
                              disabled={!selectedTargetKey || pendingNested !== null || nesting}
                              onClick={openNesting}
                            >
                              <IconNewFolder size={12} decorative />{' '}
                              {t.bookmarkImportNestedCreate as string}
                            </button>{' '}
                            {t.bookmarkImportNestedHintSuffix as string}
                          </div>
                        </div>
                        {nesting && (
                          <>
                            <label
                              htmlFor="nestedDirName"
                              style={{
                                display: 'block',
                                fontSize: 11,
                                color: 'var(--text-secondary)',
                                marginBottom: 5,
                                marginTop: 10,
                              }}
                            >
                              {t.bookmarkImportNestedNameLabel as string}
                            </label>
                            <input
                              id="nestedDirName"
                              className="adl-prompt-modal__input"
                              placeholder={t.bookmarkImportNestedPlaceholder as string}
                              value={nestInputValue}
                              onChange={(event) => setNestInputValue(event.currentTarget.value)}
                              spellCheck={false}
                              autoCorrect="off"
                              autoFocus
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  confirmNest();
                                } else if (event.key === 'Escape') {
                                  cancelNest();
                                }
                              }}
                            />
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                marginTop: 8,
                              }}
                            >
                              <div
                                className="hint"
                                style={{
                                  margin: 0,
                                  flex: 1,
                                  minWidth: 0,
                                  fontSize: 11,
                                  color: 'var(--text-secondary)',
                                  lineHeight: 1.5,
                                }}
                              >
                                {formatT(t as CopyDict, 'bookmarkImportNestedNote', {
                                  parent:
                                    directoryRows.folderRows.find(
                                      (r) => r.node.path === selectedTargetKey,
                                    )?.node.name ??
                                    directoryRows.wsRows.find(
                                      (r) => r.node.path === selectedTargetKey,
                                    )?.node.name ??
                                    '',
                                })}
                              </div>
                              <button
                                type="button"
                                className="adl-btn adl-btn--secondary adl-btn--sm adl-btn--square"
                                style={{ flexShrink: 0 }}
                                onClick={cancelNest}
                              >
                                {t.cancel as string}
                              </button>
                              <button
                                type="button"
                                className="adl-btn adl-btn--primary adl-btn--sm adl-btn--square"
                                style={{ flexShrink: 0 }}
                                disabled={!nestInputValue.trim()}
                                onClick={confirmNest}
                              >
                                {t.bookmarkImportNestedConfirm as string}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div
              className="adl-prompt-modal__actions adl-prompt-modal__actions--fill"
              style={{ padding: '14px 16px 14px' }}
            >
              {step === 1 ? (
                <>
                  <button
                    type="button"
                    className="adl-btn adl-btn--secondary adl-btn--square"
                    onClick={close}
                  >
                    {t.cancel as string}
                  </button>
                  <button
                    type="button"
                    className="adl-btn adl-btn--primary adl-btn--square"
                    disabled={keptCount === 0}
                    onClick={() => setStep(2)}
                  >
                    {t.bookmarkImportNext as string}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="adl-btn adl-btn--secondary adl-btn--square"
                    onClick={() => setStep(1)}
                  >
                    {t.bookmarkImportBack as string}
                  </button>
                  <button
                    type="button"
                    className="adl-btn adl-btn--primary adl-btn--square"
                    disabled={!canConfirm}
                    onClick={handleImport}
                  >
                    {t.bookmarkImportConfirm as string}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 导入预览行：勾选按叶子 URL 记账；目录可折叠/展开；整行与标签均带完整路径 title。 */
function ImportRow({
  node,
  depth,
  path,
  excluded,
  expanded,
  onToggleSelect,
  onToggleExpand,
}: {
  node: TransferNode;
  depth: number;
  path: string;
  excluded: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
  onToggleSelect: (node: TransferNode) => void;
  onToggleExpand: (path: string) => void;
}) {
  const isFolder = node.kind === 'folder';
  const isOpen = expanded.has(path);
  const leaves = collectTransferLeaves(node);
  const included = leaves.filter(
    (leaf) => leaf.kind === 'bookmark' && !excluded.has(leaf.url),
  ).length;
  const state: CheckState =
    included === 0 ? 'none' : included === leaves.length ? 'checked' : 'partial';
  return (
    <li className="adl-search-ignore__item">
      <div className="adl-search-ignore__row" title={path}>
        <CheckBox state={state} label={path} onToggle={() => onToggleSelect(node)} />
        <div className="adl-search-ignore__row-body" style={{ paddingLeft: depth * INDENT }}>
          {isFolder ? (
            <button
              type="button"
              className="adl-search-ignore__toggle"
              aria-label={path}
              aria-expanded={isOpen ? 'true' : 'false'}
              onClick={() => onToggleExpand(path)}
            >
              {isOpen ? (
                <IconChevronDown size={12} decorative />
              ) : (
                <IconChevronRight size={12} decorative />
              )}
            </button>
          ) : (
            <span className="adl-search-ignore__toggle" aria-hidden="true" />
          )}
          <button
            type="button"
            className="adl-search-ignore__label"
            title={path}
            onClick={() => (isFolder ? onToggleExpand(path) : onToggleSelect(node))}
          >
            <span className={`adl-search-ignore__label-text${isFolder ? ' is-folder' : ''}`}>
              {(isFolder ? node.folder.name : node.title) || path}
            </span>
          </button>
          <span style={{ flex: '0 0 auto', fontSize: 10, color: 'var(--text-muted)' }}>
            {leaves.length}
          </span>
        </div>
      </div>
    </li>
  );
}

function flattenTransfer(
  nodes: TransferNode[],
  expanded: ReadonlySet<string>,
  depth: number,
  prefix: string,
): { node: TransferNode; depth: number; path: string }[] {
  const rows: { node: TransferNode; depth: number; path: string }[] = [];
  for (const node of nodes) {
    const name = node.kind === 'folder' ? node.folder.name : node.title;
    const path = prefix ? `${prefix} / ${name}` : name;
    rows.push({ node, depth, path });
    if (node.kind === 'folder' && expanded.has(path)) {
      rows.push(...flattenTransfer(node.folder.children, expanded, depth + 1, path));
    }
  }
  return rows;
}

/** 全部叶子 URL（去重）：全选/清空的口径。 */
function allLeafUrls(nodes: TransferNode[], out = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.kind === 'bookmark') {
      out.add(node.url);
      continue;
    }
    allLeafUrls(node.folder.children, out);
  }
  return out;
}

/** 移除不含任何书签的目录（递归）：空目录不显示也不导入。 */
function pruneEmptyTransfer(nodes: TransferNode[]): TransferNode[] {
  const out: TransferNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'bookmark') {
      out.push(node);
      continue;
    }
    const children = pruneEmptyTransfer(node.folder.children);
    if (children.length === 0) {
      continue;
    }
    out.push({ ...node, folder: { ...node.folder, children } });
  }
  return out;
}

/** 全部文件夹路径（与树行 path 规则一致）：全部展开/折叠的口径。 */
function allFolderPaths(nodes: TransferNode[], prefix = '', out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.kind !== 'folder') {
      continue;
    }
    const path = prefix ? `${prefix} / ${node.folder.name}` : node.folder.name;
    out.push(path);
    allFolderPaths(node.folder.children, path, out);
  }
  return out;
}

/** 目录行展平：仅目录、带层级与 path，供第 2 步"选择已有目录"树渲染。 */
function flattenDirectoryTree(
  nodes: FileTreeRenderableNode[],
  expanded: ReadonlySet<string>,
  depth: number,
  prefix: string,
): { node: FileTreeRenderableNode; depth: number; path: string }[] {
  const rows: { node: FileTreeRenderableNode; depth: number; path: string }[] = [];
  for (const node of nodes) {
    const path = prefix ? `${prefix} / ${node.name}` : node.name;
    rows.push({ node, depth, path });
    if (node.children.length > 0 && expanded.has(node.path)) {
      rows.push(...flattenDirectoryTree(node.children, expanded, depth + 1, path));
    }
  }
  return rows;
}

/** 目录及其后代的目录总数（不含自身）：层级徽章"N 项"口径。 */
function countDirectoryDescendants(node: FileTreeRenderableNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countDirectoryDescendants(child);
  }
  return count;
}

/** 结构预览文本（等宽多行树形）：根目录 + 文件顶层节点；rootName 存在时子节点整体缩进一层。 */
function formatPreviewTree(rootLabel: string, nodes: TransferNode[], rootName?: string): string {
  const lines = [rootLabel];
  if (rootName !== undefined) {
    lines.push(`└─ ${rootName}`);
    nodes.forEach((node, i) => {
      const branch = i === nodes.length - 1 ? '   └─' : '   ├─';
      const name = node.kind === 'folder' ? node.folder.name : node.title;
      lines.push(`${branch} ${name}`);
    });
    return lines.join('\n');
  }
  nodes.forEach((node, i) => {
    const branch = i === nodes.length - 1 ? '└─' : '├─';
    const name = node.kind === 'folder' ? node.folder.name : node.title;
    lines.push(`${branch} ${name}`);
  });
  return lines.join('\n');
}

/** 收集目录树全部目录 path：步骤 2 目录树"全部展开"口径。 */
function collectDirectoryPaths(sections: {
  workspaceNodes: FileTreeRenderableNode[];
  userFolderNodes: FileTreeRenderableNode[];
}): string[] {
  const out: string[] = [];
  const walk = (nodes: FileTreeRenderableNode[]) => {
    for (const node of nodes) {
      out.push(node.path);
      walk(node.children);
    }
  };
  walk(sections.workspaceNodes);
  walk(sections.userFolderNodes);
  return out;
}

/** 把选中 key 解析为 { id, parentType }；不支持的 key 返回 null。 */
function resolveSelectedKey(key: string | null): {
  id: string;
  parentType: 'folder' | 'workspace';
} | null {
  if (!key) {
    return null;
  }
  if (key.startsWith('workspace:')) {
    return { id: key.slice('workspace:'.length), parentType: 'workspace' };
  }
  if (key.startsWith('folder:')) {
    return { id: key.slice('folder:'.length), parentType: 'folder' };
  }
  return null;
}

/** 「将要导入」清单：整目录全选中就整条列出，否则下钻，最终每条都可单独移除。 */
interface ImportPickedItem {
  id: string;
  label: string;
  count: number;
  isDir: boolean;
  node: TransferNode;
}

function resolveImportPicked(
  nodes: TransferNode[],
  excluded: ReadonlySet<string>,
  out: ImportPickedItem[] = [],
  prefix = '',
): ImportPickedItem[] {
  for (const node of nodes) {
    const leaves = collectTransferLeaves(node);
    const kept = leaves.filter((l) => l.kind === 'bookmark' && !excluded.has(l.url)).length;
    if (kept === 0) {
      continue;
    }
    const name = node.kind === 'folder' ? node.folder.name : node.title;
    const label = prefix ? `${prefix} / ${name}` : name;
    if (node.kind === 'folder' && kept < leaves.length) {
      resolveImportPicked(node.folder.children, excluded, out, label);
      continue;
    }
    out.push({
      id: node.kind === 'folder' ? `dir:${label}` : `leaf:${label}`,
      label,
      count: leaves.length,
      isDir: node.kind === 'folder',
      node,
    });
  }
  return out;
}

/** 对话框宿主：挂在 App 层，菜单项只负责开关。 */
export function BookmarkTransferDialogs() {
  const dialog = useAppStore((s) => s.bookmarkTransferDialog);
  if (!dialog) {
    return null;
  }
  return createPortal(dialog === 'export' ? <ExportDialog /> : <ImportDialog />, document.body);
}
