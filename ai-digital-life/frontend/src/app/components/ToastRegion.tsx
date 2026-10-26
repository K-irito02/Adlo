import { createPortal } from 'react-dom';
import { ErrorToastContainer } from './ErrorToast';
import { FileOpNoticeContainer } from './FileOpNotice';
import type { FileConflictChoice } from '../stores/slices/fileOpNoticeSlice';
import type { ErrorToastEntry } from '../stores/slices/errorToastSlice';
import type { FileOpNotice } from '../stores/slices/fileOpNoticeSlice';

interface ToastRegionProps {
  errorToasts: ErrorToastEntry[];
  onDismissError: (id: string) => void;
  onClearAllError: () => void;
  notices: FileOpNotice[];
  onDismissNotice: (id: string) => void;
  onResolveConflict?: (id: string, choice: FileConflictChoice) => void;
}

/**
 * 右下角提示卡片的单一固定区域容器。
 * 错误卡片与文件操作提示共用同一个固定定位区域（避免两个同位区域重叠），
 * 各自仍以独立的 labeled region 分组暴露给辅助技术。
 */
export function ToastRegion({
  errorToasts,
  onDismissError,
  onClearAllError,
  notices,
  onDismissNotice,
  onResolveConflict,
}: ToastRegionProps) {
  return createPortal(
    <div className="toast-card-region">
      <ErrorToastContainer
        errorToasts={errorToasts}
        onDismiss={onDismissError}
        onClearAll={onClearAllError}
      />
      <FileOpNoticeContainer
        notices={notices}
        onDismiss={onDismissNotice}
        onResolveConflict={onResolveConflict}
      />
    </div>,
    document.body,
  );
}
