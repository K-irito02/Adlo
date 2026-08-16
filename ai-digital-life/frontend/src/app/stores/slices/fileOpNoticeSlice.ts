/**
 * 文件操作提示卡片切片
 * 提供右下角出现的文件操作提示卡片（与顶部临时 toast、右下角错误队列分离）。
 * 当前用于：新建文件/文件夹时发现同路径下已存在同名项，弹出警告卡片提示。
 */
import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';

export interface FileOpNotice {
  id: string;
  /** 用户正在执行的操作类型（新建文件 / 新建文件夹） */
  kind: 'file' | 'folder';
  /** 发生冲突的名称（不含路径） */
  name: string;
  /** 新建文件与同路径目录同名 → 提示检查是否遗漏文件类型后缀 */
  suffixHint?: boolean;
  timestamp: number;
}

/** 右下角提示卡片可见上限（超出部分折叠为摘要卡片，参考全局错误卡片） */
export const FILE_OP_NOTICE_LIMIT = 4;

export interface FileOpNoticeSlice {
  fileOpNotices: FileOpNotice[];
  pushFileOpNotice: (kind: 'file' | 'folder', name: string, suffixHint?: boolean) => string;
  dismissFileOpNotice: (id: string) => void;
}

export const createFileOpNoticeSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): FileOpNoticeSlice => ({
  fileOpNotices: [],
  pushFileOpNotice: (kind, name, suffixHint = false) => {
    const id = createUiId('file-op');
    const notice: FileOpNotice = { id, kind, name, suffixHint, timestamp: Date.now() };
    // 全部保留，可见条数与摘要折叠由容器（FileOpNoticeContainer）决定，与全局错误卡片一致。
    set((state) => ({
      fileOpNotices: [...state.fileOpNotices, notice],
    }));
    return id;
  },
  dismissFileOpNotice: (id) => {
    set((state) => ({
      fileOpNotices: state.fileOpNotices.filter((n) => n.id !== id),
    }));
  },
});
