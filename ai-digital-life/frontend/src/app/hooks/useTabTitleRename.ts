import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 标签标题的「内联重命名」交互（编辑态 + 提交/取消/键盘 + 聚焦并全选）。
 *
 * 中心标签条（`CenterTabStrip`）与右侧终端标签动作（`useTerminalTabActions`）共用，
 * 使 trim 提交、Escape 取消、Enter 提交、聚焦全选的语义只有一份实现。
 *
 * `onCommit(tabId, title)` 由调用方提供（通常写入对应 store slice 的标题）。
 */
export function useTabTitleRename(onCommit: (tabId: string, title: string) => void) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  const handleDoubleClick = useCallback((tabId: string, title: string) => {
    setEditValue(title);
    setEditingTabId(tabId);
  }, []);

  const handleEditSubmit = useCallback(() => {
    if (editingTabId && editValue.trim()) {
      onCommit(editingTabId, editValue.trim());
    }
    setEditingTabId(null);
    setEditValue('');
  }, [editingTabId, editValue, onCommit]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleEditSubmit();
      } else if (e.key === 'Escape') {
        setEditingTabId(null);
        setEditValue('');
      }
    },
    [handleEditSubmit],
  );

  return {
    editingTabId,
    editValue,
    editInputRef,
    setEditValue,
    handleDoubleClick,
    handleEditSubmit,
    handleEditKeyDown,
  };
}
