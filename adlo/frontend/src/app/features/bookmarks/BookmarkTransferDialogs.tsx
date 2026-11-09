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
  IconClose,
  IconFoldVertical,
  IconUnfoldVertical,
} from '@icons';
import { parseBookmarkHtml } from './bookmarkHtml';
import type { TransferNode } from './bookmarkTransferTypes';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import {
  buildBookmarkSelectionTree,
  buildExportNodes,
  collectLeafIds,
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
    const path = prefix ? `${prefix} / ${node.name}` : node.name;
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
    const label = prefix ? `${prefix} / ${node.name}` : node.name;
    if (state === 'checked' || node.kind === 'bookmark') {
      out.push({ id: node.id, label, count: node.bookmarkCount, isDir: node.kind !== 'bookmark' });
    } else {
      resolvePicked(node.children, selected, out, label);
    }
  }
  return out;
}

function ExportDialog() {
  const { t } = useTCopy();
  const { exportBookmarks } = useBookmarkTransfer();
  const setDialog = useAppStore((s) => s.setBookmarkTransferDialog);
  const { workspaces, folders, workspaceBookmarks } = useAppStore(
    useShallow((s) => ({
      workspaces: s.recentWorkspaces,
      folders: s.browserBookmarkFolders,
      workspaceBookmarks: s.browserWorkspaceBookmarks,
    })),
  );

  const { workspaceRoot, folderRoot } = useMemo(
    () => buildBookmarkSelectionTree({ workspaces, folders, workspaceBookmarks }),
    [workspaces, folders, workspaceBookmarks],
  );

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const split = useResizableSplit();
  const close = useCallback(() => setDialog(null), [setDialog]);
  const panelRef = useDialogA11y(true, close);

  const roots = useMemo(() => [workspaceRoot, folderRoot], [workspaceRoot, folderRoot]);
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

  const workspaceRows = flattenSelection(
    [workspaceRoot],
    expanded,
    0,
    t.bookmarkExportWorkspaceRoot as string,
  );
  const folderRows = flattenSelection(
    [folderRoot],
    expanded,
    0,
    t.bookmarkExportFolderRoot as string,
  );

  const exportNodes = useMemo(
    () => [...buildExportNodes(workspaceRoot, selected), ...buildExportNodes(folderRoot, selected)],
    [workspaceRoot, folderRoot, selected],
  );
  const bookmarkCount = countBookmarks(exportNodes);
  const folderCount = countFolders(exportNodes);
  const picked = useMemo(() => resolvePicked(roots, selected), [roots, selected]);

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
        style={{ width: 'min(94vw, 780px)', padding: '10px 0 0' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px 8px',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600 }}>{t.bookmarkExportTitle as string}</span>
          <button
            type="button"
            className="adl-prompt-modal__header-close"
            aria-label={t.close as string}
            onClick={close}
          >
            <IconClose size={14} decorative />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="adl-btn adl-btn--secondary"
            onClick={() => setSelected(new Set(allLeafIds))}
          >
            {t.bookmarkExportSelectAll as string}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--secondary"
            onClick={() => setSelected(new Set())}
          >
            {t.bookmarkExportClear as string}
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="adl-btn adl-btn--secondary"
            onClick={() => setExpanded(new Set(allDirIds))}
          >
            {t.expandAll as string}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--secondary"
            onClick={() => setExpanded(new Set())}
          >
            {t.collapseAll as string}
          </button>
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
          }}
        >
          <CustomScrollArea
            shellClassName="adl-search-ignore__scroll adl-search-ignore__scroll--flush"
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
              height: 420,
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
                  <span style={{ color: 'var(--text-muted)' }}>{item.isDir ? item.count : ''}</span>
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

        <div
          className="adl-prompt-modal__actions adl-prompt-modal__actions--fill"
          style={{ padding: '10px 16px' }}
        >
          <span style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)' }}>
            {bookmarkCount} {t.bookmarkExportBookmarks as string} · {folderCount}{' '}
            {t.bookmarkExportFolders as string}
          </span>
          <button type="button" className="adl-btn adl-btn--secondary" onClick={close}>
            {t.cancel as string}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary"
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
  // 菜单路径在挂载前已选完文件并暂存解析结果到 store；此处一次性消费，避免下次打开复用旧数据
  const [draft] = useState(() => useAppStore.getState().bookmarkImportDraft);
  const defaultFolderName = useMemo(() => {
    const base = (t.bookmarkImportDefaultName as string) || 'bookmarks';
    const now = new Date();
    return `${base}_${now.getFullYear()}_${now.getMonth() + 1}_${now.getDate()}`;
  }, [t]);

  const [step, setStep] = useState<1 | 2>(1);
  const [fileName, setFileName] = useState(draft?.fileName ?? '');
  const [nodes, setNodes] = useState<TransferNode[]>(draft?.nodes ?? []);
  const [invalidCount, setInvalidCount] = useState(draft?.invalidCount ?? 0);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [targetKind, setTargetKind] = useState<'new' | 'folder' | 'workspace'>('new');
  const [targetId, setTargetId] = useState('');
  const [folderName, setFolderName] = useState(draft ? defaultFolderName : '');
  const [duplicatePolicy, setDuplicatePolicy] = useState<'skip' | 'allow'>('skip');
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
      const html = await file.text();
      const parsed = parseBookmarkHtml(html);
      const validCount = countBookmarks(parsed.nodes);
      if (validCount === 0) {
        // 只含无效链接的文件按"解析失败"处理：不进入选择步骤
        showToast(t.bookmarkImportEmpty as string, 'error');
        return;
      }
      setFileName(file.name);
      setNodes(parsed.nodes);
      setInvalidCount(parsed.invalidCount);
      setFolderName(defaultFolderName);
      setExcluded(new Set());
      setExpanded(new Set(allFolderPaths(parsed.nodes)));
      setStep(1);
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
  const goToStep = useCallback(
    (target: 1 | 2) => {
      if (target === 2 && keptCount === 0) {
        return;
      }
      setStep(target);
    },
    [keptCount],
  );

  const handleImport = useCallback(() => {
    if (keptCount === 0) {
      return;
    }
    if (targetKind !== 'new' && !targetId) {
      return;
    }
    const target =
      targetKind === 'new'
        ? ({ kind: 'new-folder', name: folderName.trim() || defaultFolderName } as const)
        : targetKind === 'folder'
          ? ({ kind: 'folder', id: targetId } as const)
          : ({ kind: 'workspace', id: targetId } as const);
    const result = importBookmarks({ nodes: keptNodes, target, duplicatePolicy });
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
  }, [
    close,
    defaultFolderName,
    duplicatePolicy,
    folderName,
    formatT,
    importBookmarks,
    keptCount,
    keptNodes,
    showToast,
    t,
    targetId,
    targetKind,
  ]);

  return (
    <div className="adl-prompt-modal" onClick={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={panelRef}
        className="adl-prompt-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={t.bookmarkImportTitle as string}
        tabIndex={-1}
        style={{ width: 'min(94vw, 780px)', padding: '10px 0 0' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px 6px',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {t.bookmarkImportTitle as string}
            {fileName ? (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
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
          <>
            {/* 顶部两块区域（胜出方案 A · 分段控制器，按反馈落地） */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '0 16px 6px' }}>
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
                  aria-pressed={allExpanded}
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
              <>
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
                      flex: '0 0 7px',
                      cursor: 'col-resize',
                      borderLeft: '1px solid var(--border)',
                      background: 'var(--surface-subtle)',
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
              </>
            ) : (
              <div style={{ padding: '4px 16px' }}>
                <label
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    fontSize: 12,
                    padding: '6px 0',
                  }}
                >
                  <span style={{ flex: '0 0 76px', color: 'var(--text-secondary)', fontSize: 11 }}>
                    {t.bookmarkImportTargetLabel as string}
                  </span>
                  <select
                    className="pt-select"
                    style={{ flex: 1 }}
                    value={targetKind === 'new' ? 'new' : `${targetKind}:${targetId}`}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (value === 'new') {
                        setTargetKind('new');
                        setTargetId('');
                        return;
                      }
                      const [kind, id] = value.split(':');
                      setTargetKind(kind as 'folder' | 'workspace');
                      setTargetId(id ?? '');
                    }}
                  >
                    <option value="new">{t.bookmarkImportTargetNew as string}</option>
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={`workspace:${ws.id}`}>
                        {ws.name || ws.path}
                      </option>
                    ))}
                    {folders.map((folder) => (
                      <option key={folder.id} value={`folder:${folder.id}`}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </label>
                {targetKind === 'new' ? (
                  <label
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      fontSize: 12,
                      padding: '6px 0',
                    }}
                  >
                    <span
                      style={{ flex: '0 0 76px', color: 'var(--text-secondary)', fontSize: 11 }}
                    >
                      {t.bookmarkImportFolderName as string}
                    </span>
                    <input
                      className="pt-input"
                      style={{ flex: 1 }}
                      value={folderName}
                      onChange={(event) => setFolderName(event.currentTarget.value)}
                    />
                  </label>
                ) : null}
                <div style={{ display: 'flex', gap: 14, padding: '6px 0 6px 84px', fontSize: 12 }}>
                  <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                    <input
                      type="radio"
                      name="bm-dup"
                      checked={duplicatePolicy === 'skip'}
                      onChange={() => setDuplicatePolicy('skip')}
                    />
                    {t.bookmarkImportSkip as string}
                  </label>
                  <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                    <input
                      type="radio"
                      name="bm-dup"
                      checked={duplicatePolicy === 'allow'}
                      onChange={() => setDuplicatePolicy('allow')}
                    />
                    {t.bookmarkImportAllow as string}
                  </label>
                </div>
                <p style={{ margin: '0 0 0 84px', fontSize: 10, color: 'var(--text-muted)' }}>
                  {t.bookmarkImportDupHint as string}
                </p>
              </div>
            )}

            {step === 2 ? (
              <span
                style={{
                  display: 'block',
                  padding: '2px 16px 6px',
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                }}
              >
                {formatT(t as CopyDict, 'bookmarkImportWillImport', {
                  count: keptCount,
                  folders: keptFolders,
                })}
              </span>
            ) : null}
            <div
              className="adl-prompt-modal__actions adl-prompt-modal__actions--fill"
              style={{ padding: '0 16px 14px' }}
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
                    disabled={keptCount === 0 || (targetKind !== 'new' && !targetId)}
                    onClick={handleImport}
                  >
                    {t.bookmarkImportConfirm as string}
                  </button>
                </>
              )}
            </div>
          </>
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
