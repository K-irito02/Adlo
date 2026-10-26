/**
 * 文件操作提示卡片切片
 * 提供右下角出现的文件操作提示卡片（与顶部临时 toast、右下角错误队列分离）。
 * 当前用于：新建文件/文件夹时发现同路径下已存在同名项，弹出警告卡片提示。
 */
import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';

export interface FileOpNotice {
  id: string;
  /** 用户正在执行的操作类型（新建文件 / 新建文件夹 / 存盘冲突） */
  kind: 'file' | 'folder' | 'conflict';
  /** 冲突以外的显示名称（含路径时取末段，不含路径） */
  name: string;
  /** 新建文件与同路径目录同名 → 提示检查是否遗漏文件类型后缀 */
  suffixHint?: boolean;
  /** 冲突卡片：工作区相对路径（resolve 时回填 saveFile / reconcile） */
  path?: string;
  /** 冲突卡片：文件所属工作区 id（跨工作区同名文件不串台） */
  workspaceId?: string;
  /** 冲突卡片：文件所属工作区落盘根（显式传给 saveFile，保证定向） */
  workspacePath?: string;
  timestamp: number;
}

/** 右下角提示卡片可见上限（超出部分折叠为摘要卡片，参考全局错误卡片） */
export const FILE_OP_NOTICE_LIMIT = 4;

export interface FileOpNoticeSlice {
  fileOpNotices: FileOpNotice[];
  pushFileOpNotice: (kind: 'file' | 'folder', name: string, suffixHint?: boolean) => string;
  /**
   * 推入存盘冲突卡片（同一文件 + 同一工作区只保留一张：重复推送返回既有 id，
   * 不堆卡、不改顺序——自动保存每秒重试时不刷屏）。
   */
  pushFileConflictNotice: (path: string, workspaceId?: string, workspacePath?: string) => string;
  dismissFileOpNotice: (id: string) => void;
}

export const createFileOpNoticeSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState,
): FileOpNoticeSlice => ({
  fileOpNotices: [],
  pushFileOpNotice: (kind, name, suffixHint = false) => {
    const id = createUiId('file-op');
    const notice: FileOpNotice = { id, kind, name, suffixHint, timestamp: Date.now() };
    // 状态数组同样受 FILE_OP_NOTICE_LIMIT 约束：超出时裁剪最旧条目，避免长时间会话
    // 中冲突通知累积导致数组无限增长。容器可见条数与摘要折叠逻辑不变。
    set((state) => ({
      fileOpNotices: [...state.fileOpNotices, notice].slice(-FILE_OP_NOTICE_LIMIT),
    }));
    return id;
  },
  pushFileConflictNotice: (path, workspaceId, workspacePath) => {
    const norm = path.replace(/\\/g, '/');
    const existing = get().fileOpNotices.find(
      (n) =>
        n.kind === 'conflict' &&
        (n.path ?? '').replace(/\\/g, '/') === norm &&
        (n.workspaceId ?? '') === (workspaceId ?? ''),
    );
    if (existing) {
      return existing.id;
    }
    const id = createUiId('file-op');
    const name = norm.split('/').filter(Boolean).pop() ?? norm;
    const notice: FileOpNotice = {
      id,
      kind: 'conflict',
      name,
      path: norm,
      workspaceId,
      workspacePath,
      timestamp: Date.now(),
    };
    set((state) => ({
      fileOpNotices: [...state.fileOpNotices, notice].slice(-FILE_OP_NOTICE_LIMIT),
    }));
    return id;
  },
  dismissFileOpNotice: (id) => {
    set((state) => ({
      fileOpNotices: state.fileOpNotices.filter((n) => n.id !== id),
    }));
  },
});
