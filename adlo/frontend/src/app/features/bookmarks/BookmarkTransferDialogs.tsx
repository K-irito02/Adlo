import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { IconCheck, IconChevronDown, IconChevronRight, IconClose } from '@icons';
import { parseBookmarkHtml } from './bookmarkHtml';
import type { TransferNode } from './bookmarkTransferTypes';
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

function CheckBox({
  state,
  label,
  onToggle,
}: {
  state: 'checked' | 'partial' | 'none';
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

/** 导出选择树的一行。 */
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
            <span className="adl-search-ignore__label-text">{node.name || path}</span>
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

/** 导入文件内容树的一行（只读预览 + 勾选）。 */
function ImportRow({
  node,
  depth,
  path,
  excluded,
  expanded,
  onToggle,
  onToggleExpand,
}: {
  node: TransferNode;
  depth: number;
  path: string;
  excluded: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onToggleExpand: (key: string) => void;
}) {
  const key = transferKey(node);
  const isFolder = node.kind === 'folder';
  const isOpen = expanded.has(key);
  const leafIds = isFolder ? collectTransferLeafKeys(node) : [key];
  const picked = leafIds.filter((id) => !excluded.has(id)).length;
  const state = picked === 0 ? 'none' : picked === leafIds.length ? 'checked' : 'partial';
  const count = leafIds.length;
  return (
    <li className="adl-search-ignore__item">
      <div className="adl-search-ignore__row" title={path}>
        <CheckBox state={state} label={path} onToggle={() => onToggle(key)} />
        <div className="adl-search-ignore__row-body" style={{ paddingLeft: depth * INDENT }}>
          {isFolder ? (
            <button
              type="button"
              className="adl-search-ignore__toggle"
              aria-label={path}
              aria-expanded={isOpen ? 'true' : 'false'}
              onClick={() => onToggleExpand(key)}
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
            onClick={() => (isFolder ? onToggleExpand(key) : onToggle(key))}
          >
            <span className="adl-search-ignore__label-text">
              {isFolder ? node.folder.name : node.title}
            </span>
          </button>
          <span className="adl-search-ignore__label" style={{ flex: '0 0 auto', opacity: 0.6 }}>
            {count}
          </span>
        </div>
      </div>
    </li>
  );
}

function transferKey(node: TransferNode): string {
  return node.kind === 'folder'
    ? `f:${node.folder.name}:${node.folder.children.length}`
    : `b:${node.url}`;
}

function collectTransferLeafKeys(node: TransferNode, out: string[] = []): string[] {
  if (node.kind === 'bookmark') {
    out.push(transferKey(node));
    return out;
  }
  for (const child of node.folder.children) {
    collectTransferLeafKeys(child, out);
  }
  return out;
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
    if (node.kind === 'folder' && expanded.has(transferKey(node))) {
      rows.push(...flattenTransfer(node.folder.children, expanded, depth + 1, path));
    }
  }
  return rows;
}

/** 从导入树里剔掉被取消勾选的节点。 */
function pruneTransfer(nodes: TransferNode[], excluded: ReadonlySet<string>): TransferNode[] {
  const out: TransferNode[] = [];
  for (const node of nodes) {
    const key = transferKey(node);
    if (node.kind === 'bookmark') {
      if (!excluded.has(key)) {
        out.push(node);
      }
      continue;
    }
    if (excluded.has(key)) {
      continue;
    }
    const children = pruneTransfer(node.folder.children, excluded);
    if (children.length > 0) {
      out.push({ kind: 'folder', folder: { name: node.folder.name, children } });
    }
  }
  return out;
}

function useResizableSplit(initial = 240) {
  const [width, setWidth] = useState(initial);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const onPointerDown = useCallback((event: React.PointerEvent) => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }
    const rect = frame.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const raw = rect.right - ev.clientX;
      setWidth(Math.max(180, Math.min(rect.width - 300, raw)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    event.preventDefault();
  }, []);
  return { width, frameRef, onPointerDown };
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
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set([workspaceRoot.id, folderRoot.id]),
  );
  const [busy, setBusy] = useState(false);
  const split = useResizableSplit();

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

  const handleExport = useCallback(async () => {
    if (bookmarkCount === 0 || busy) {
      return;
    }
    setBusy(true);
    try {
      const ok = await exportBookmarks(exportNodes, t.bookmarkExportFileTitle as string);
      if (ok) {
        setDialog(null);
      }
    } finally {
      setBusy(false);
    }
  }, [bookmarkCount, busy, exportBookmarks, exportNodes, setDialog, t]);

  return (
    <div
      className="adl-prompt-modal"
      onClick={(e) => e.target === e.currentTarget && setDialog(null)}
    >
      <div
        className="adl-prompt-modal__panel"
        style={{ width: 'min(94vw, 780px)', padding: '14px 0 0' }}
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
            onClick={() => setDialog(null)}
          >
            <IconClose size={14} decorative />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px' }}>
          <button
            type="button"
            className="adl-btn adl-btn--secondary"
            onClick={() => setSelected(new Set())}
          >
            {t.bookmarkExportClear as string}
          </button>
        </div>

        <div
          ref={split.frameRef}
          style={{
            display: 'flex',
            margin: '0 16px',
            border: '1px solid var(--border)',
            borderRadius: 4,
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          <div
            className="adl-search-ignore__scroll"
            style={{ margin: 0, border: 0, borderRadius: 0, flex: 1, maxHeight: 420 }}
          >
            <ul className="adl-search-ignore__tree" role="tree">
              {workspaceRows.map(({ node, depth, path }) => (
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
              {folderRows.map(({ node, depth, path }) => (
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
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t.bookmarkExportResize as string}
            onPointerDown={split.onPointerDown}
            style={{
              flex: '0 0 7px',
              cursor: 'col-resize',
              borderLeft: '1px solid var(--border)',
              background: 'var(--surface-subtle)',
            }}
          />
          <div
            style={{
              flex: `0 0 ${split.width}px`,
              padding: '6px 10px',
              overflow: 'auto',
              maxHeight: 420,
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingBottom: 6 }}>
              {t.bookmarkExportPicked as string}
            </div>
            <div style={{ fontSize: 12 }}>
              {bookmarkCount} {t.bookmarkExportBookmarks as string} · {folderCount}{' '}
              {t.bookmarkExportFolders as string}
            </div>
          </div>
        </div>

        <div
          className="adl-prompt-modal__actions adl-prompt-modal__actions--fill"
          style={{ padding: '10px 16px' }}
        >
          <button
            type="button"
            className="adl-btn adl-btn--secondary"
            onClick={() => setDialog(null)}
          >
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

function ImportDialog() {
  const { t } = useTCopy();
  const setDialog = useAppStore((s) => s.setBookmarkTransferDialog);
  const importBookmarks = useAppStore((s) => s.browserImportBookmarks);
  const { workspaces, folders } = useAppStore(
    useShallow((s) => ({ workspaces: s.recentWorkspaces, folders: s.browserBookmarkFolders })),
  );
  const showToast = useAppStore((s) => s.showToast);

  const [step, setStep] = useState<1 | 2>(1);
  const [fileName, setFileName] = useState('');
  const [nodes, setNodes] = useState<TransferNode[]>([]);
  const [rootName, setRootName] = useState('');
  const [invalidCount, setInvalidCount] = useState(0);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [targetKind, setTargetKind] = useState<'new' | 'folder' | 'workspace'>('new');
  const [targetId, setTargetId] = useState('');
  const [folderName, setFolderName] = useState('');
  const [duplicatePolicy, setDuplicatePolicy] = useState<'skip' | 'allow'>('skip');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onPickFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_BOOKMARK_FILE_BYTES) {
        showToast(t.bookmarkImportTooLarge as string, 'error');
        return;
      }
      const html = await file.text();
      const parsed = parseBookmarkHtml(html);
      if (parsed.nodes.length === 0) {
        showToast(t.bookmarkImportEmpty as string, 'error');
        return;
      }
      const defaultName = parsed.rootName.trim() || file.name.replace(/\.[^.]+$/, '');
      setFileName(file.name);
      setRootName(defaultName);
      setNodes(parsed.nodes);
      setInvalidCount(parsed.invalidCount);
      setFolderName(defaultName);
      setExcluded(new Set());
      setExpanded(new Set());
      setStep(1);
    },
    [showToast, t],
  );

  const toggleExcluded = useCallback((key: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const keptNodes = useMemo(() => pruneTransfer(nodes, excluded), [nodes, excluded]);
  const keptCount = countBookmarks(keptNodes);
  const keptFolders = countFolders(keptNodes);
  const rows = flattenTransfer(nodes, expanded, 0, '');

  const handleImport = useCallback(() => {
    if (keptCount === 0) {
      return;
    }
    const target =
      targetKind === 'new'
        ? ({ kind: 'new-folder', name: folderName.trim() || rootName } as const)
        : targetKind === 'folder'
          ? ({ kind: 'folder', id: targetId } as const)
          : ({ kind: 'workspace', id: targetId } as const);
    if (targetKind !== 'new' && !targetId) {
      return;
    }
    const result = importBookmarks({ nodes: keptNodes, target, duplicatePolicy });
    const skipped =
      result.skipped > 0 ? `（${result.skipped} ${t.bookmarkImportSkipped as string}）` : '';
    showToast(
      `${t.bookmarkImportSuccess as string} ${result.importedBookmarks} ${t.bookmarkExportBookmarks as string}` +
        `${skipped}`,
      'success',
    );
    setDialog(null);
  }, [
    duplicatePolicy,
    folderName,
    importBookmarks,
    keptCount,
    keptNodes,
    rootName,
    setDialog,
    showToast,
    t,
    targetId,
    targetKind,
  ]);

  return (
    <div
      className="adl-prompt-modal"
      onClick={(e) => e.target === e.currentTarget && setDialog(null)}
    >
      <div
        className="adl-prompt-modal__panel"
        style={{ width: 'min(94vw, 560px)', padding: '14px 0 0' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px 8px',
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
            onClick={() => setDialog(null)}
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
            <div style={{ display: 'flex', gap: 8, padding: '0 16px 8px', fontSize: 11 }}>
              <span style={{ color: step === 1 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                1. {t.bookmarkImportStepPick as string}
              </span>
              <span style={{ color: step === 2 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                2. {t.bookmarkImportStepTarget as string}
              </span>
            </div>

            {step === 1 ? (
              <>
                <div
                  className="adl-search-ignore__scroll"
                  style={{ margin: '0 16px', maxHeight: 360 }}
                >
                  <ul className="adl-search-ignore__tree" role="tree">
                    {rows.map(({ node, depth, path }) => (
                      <ImportRow
                        key={`${transferKey(node)}-${path}`}
                        node={node}
                        depth={depth}
                        path={path}
                        excluded={excluded}
                        expanded={expanded}
                        onToggle={toggleExcluded}
                        onToggleExpand={toggleExpand}
                      />
                    ))}
                  </ul>
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

            <div
              className="adl-prompt-modal__actions adl-prompt-modal__actions--fill"
              style={{ padding: '10px 16px' }}
            >
              <span style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)' }}>
                {step === 1
                  ? `${t.bookmarkImportSelected as string} ${keptCount} / ${countBookmarks(nodes)}`
                  : `${t.bookmarkImportWillImport as string} ${keptCount} ${
                      t.bookmarkExportBookmarks as string
                    } · ${keptFolders} ${t.bookmarkExportFolders as string}`}
              </span>
              <button
                type="button"
                className="adl-btn adl-btn--secondary"
                onClick={() => setDialog(null)}
              >
                {t.cancel as string}
              </button>
              {step === 1 ? (
                <button
                  type="button"
                  className="adl-btn adl-btn--primary"
                  disabled={keptCount === 0}
                  onClick={() => setStep(2)}
                >
                  {t.bookmarkImportNext as string}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="adl-btn adl-btn--secondary"
                    onClick={() => setStep(1)}
                  >
                    {t.bookmarkImportBack as string}
                  </button>
                  <button
                    type="button"
                    className="adl-btn adl-btn--primary"
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

/** 对话框宿主：挂在 App 层，菜单项只负责开关。 */
export function BookmarkTransferDialogs() {
  const dialog = useAppStore((s) => s.bookmarkTransferDialog);
  if (!dialog) {
    return null;
  }
  return createPortal(dialog === 'export' ? <ExportDialog /> : <ImportDialog />, document.body);
}
