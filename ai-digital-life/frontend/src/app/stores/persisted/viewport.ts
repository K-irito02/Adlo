import { foldedRanges, foldEffect } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import { readJson } from '../storageHelpers';

/**
 * 会话恢复：编辑器视口（Task 27，`adl:session.editorViewport`）。
 *
 * 硬约束：只落"行号 + 偏移 + 折叠区间"这类小数值，启动后重建；
 * CodeMirror 的 EditorState 是活对象，DOM 视口更不可序列化 ——
 * 二者一律不得进本模块（32KB 同步读准入线内天然符合：单条约百字节）。
 */

/** 登记表条目 `adl:session.editorViewport` 的存储键（与 registry.ts 字面量同键） */
export const EDITOR_VIEWPORT_KEY = 'adl:session.editorViewport';

export interface PersistedViewport {
  workspaceId: string;
  relativePath: string;
  /** 像素偏移（scrollDOM.scrollTop） */
  scrollTop: number;
  /** 滚动顶部所在行号（1 起，用于文档变长/变短时的比例换算） */
  scrollTopLine: number;
  /** 折叠区间（行号对，均为 1 起的闭区间） */
  foldedRanges: [number, number][];
}

function isLineRange(value: unknown): value is [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    return false;
  }
  const [from, to] = value;
  return (
    typeof from === 'number' &&
    typeof to === 'number' &&
    Number.isInteger(from) &&
    Number.isInteger(to) &&
    from >= 1 &&
    from <= to
  );
}

/**
 * 登记表 `read` 校验器（与 readPersistedViewport 共用，同一形状只定义一处）。
 * 非法折叠区间整段忽略（不整条丢弃）；必需字段非法则整条回退。
 */
export function readEditorViewport(raw: unknown): PersistedViewport | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.workspaceId !== 'string' || typeof record.relativePath !== 'string') {
    return undefined;
  }
  if (
    typeof record.scrollTop !== 'number' ||
    !Number.isFinite(record.scrollTop) ||
    typeof record.scrollTopLine !== 'number' ||
    !Number.isFinite(record.scrollTopLine)
  ) {
    return undefined;
  }
  const foldedRanges: [number, number][] = [];
  if (Array.isArray(record.foldedRanges)) {
    for (const range of record.foldedRanges) {
      if (isLineRange(range)) {
        foldedRanges.push([range[0], range[1]]);
      }
    }
  }
  return {
    workspaceId: record.workspaceId,
    relativePath: record.relativePath,
    scrollTop: Math.max(0, record.scrollTop),
    scrollTopLine: Math.max(0, record.scrollTopLine),
    foldedRanges,
  };
}

/** 从存储直读视口（缺失 / 解析失败 / 形状非法一律回退 undefined，不抛错） */
export function readPersistedViewport(): PersistedViewport | undefined {
  const raw = readJson<unknown>(EDITOR_VIEWPORT_KEY, undefined);
  if (raw === undefined) {
    return undefined;
  }
  return readEditorViewport(raw);
}

/**
 * 越界钳制：文档足够长时保留原偏移；文档变短时按
 * docLines / scrollTopLine 比例换算到尾部；空文档返回 0。
 */
export function clampScrollTop(viewport: PersistedViewport, docLines: number): number {
  if (!Number.isFinite(docLines) || docLines <= 0) {
    return 0;
  }
  const stored = viewport.scrollTop;
  if (!Number.isFinite(stored) || stored <= 0) {
    return 0;
  }
  if (!Number.isFinite(viewport.scrollTopLine) || viewport.scrollTopLine <= 0) {
    return stored;
  }
  if (docLines >= viewport.scrollTopLine) {
    return stored;
  }
  return Math.max(0, (stored * docLines) / viewport.scrollTopLine);
}

/**
 * 从活 EditorView 采集可持久化的视口数值（文件切换时调用）。
 * 只读 scrollDOM.scrollTop、顶部行号与折叠区间 —— 不触碰 EditorState 本体。
 */
export function captureEditorViewport(
  view: EditorView,
  workspaceId: string,
  relativePath: string,
): PersistedViewport {
  const scrollTop = Number.isFinite(view.scrollDOM.scrollTop) ? view.scrollDOM.scrollTop : 0;
  let scrollTopLine = view.state.doc.lines;
  try {
    scrollTopLine = view.state.doc.lineAt(view.lineBlockAtHeight(scrollTop).from).number;
  } catch {
    // 极端布局下取不到行块：回退文档总行数（等价于"不缩放"，见 clampScrollTop）
  }
  const folded: [number, number][] = [];
  try {
    foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
      folded.push([view.state.doc.lineAt(from).number, view.state.doc.lineAt(to).number]);
    });
  } catch {
    // 折叠装饰遍历失败：视口仍可落盘，折叠置空
    folded.length = 0;
  }
  return {
    workspaceId,
    relativePath,
    scrollTop: Math.max(0, scrollTop),
    scrollTopLine: Math.max(0, scrollTopLine),
    foldedRanges: folded,
  };
}

/**
 * 把持久化视口应用到活 EditorView（CodeEditor 挂载并拿到文档行数后调用）。
 * 精确恢复像素偏移；折叠区间按行号重建，越界区间逐段跳过。
 */
export function applyEditorViewport(view: EditorView, viewport: PersistedViewport): void {
  const docLines = view.state.doc.lines;
  view.scrollDOM.scrollTop = clampScrollTop(viewport, docLines);
  const effects = [];
  for (const [start, end] of viewport.foldedRanges) {
    const clampedStart = Math.min(Math.max(1, start), docLines);
    const clampedEnd = Math.min(Math.max(1, end), docLines);
    if (clampedStart > clampedEnd) {
      continue;
    }
    try {
      effects.push(
        foldEffect.of({
          from: view.state.doc.line(clampedStart).from,
          to: view.state.doc.line(clampedEnd).to,
        }),
      );
    } catch {
      // 行号越界：跳过该区间，其余照常重建
    }
  }
  if (effects.length > 0) {
    view.dispatch({ effects });
  }
}
