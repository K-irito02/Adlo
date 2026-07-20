import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useTerminalPtyLifecycle } from './useTerminalPtyLifecycle';

interface UseTerminalTabActionsParams {
  activeTab: { id: string; title: string; sessionId?: string } | undefined;
  rootPath: string | undefined;
}

/**
 * 终端标签页动作 Hook：组合 PTY 生命周期与标签重命名编辑逻辑。
 *
 * 职责：
 * - 终端会话的创建/切换/关闭/杀进程（委托 useTerminalPtyLifecycle）
 * - xterm 实例引用与数据/尺寸回调（委托 useTerminalPtyLifecycle）
 * - 标签双击重命名的内联编辑状态与回调
 */
export function useTerminalTabActions({ activeTab, rootPath }: UseTerminalTabActionsParams) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const editInputRef = useRef<HTMLInputElement | null>(null);

  const { terminalUpdateTab } = useAppStore(
    useShallow((state) => ({
      terminalUpdateTab: state.terminalUpdateTab,
    })),
  );

  const {
    xtermRef,
    sessionOutputsRef,
    handleXtermData,
    handleXtermResize,
    handleCreateTab,
    handleSelectTab,
    handleCloseTab,
    handleCloseAllTabs,
    handleKill,
  } = useTerminalPtyLifecycle({ activeTab, rootPath });

  const handleDoubleClick = useCallback((tabId: string, title: string) => {
    setEditValue(title);
    setEditingTabId(tabId);
  }, []);

  const handleEditSubmit = useCallback(() => {
    if (editingTabId && editValue.trim()) {
      terminalUpdateTab(editingTabId, { title: editValue.trim() });
    }
    setEditingTabId(null);
    setEditValue('');
  }, [editingTabId, editValue, terminalUpdateTab]);

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

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  return {
    xtermRef,
    sessionOutputsRef,
    handleXtermData,
    handleXtermResize,
    handleCreateTab,
    handleSelectTab,
    handleCloseTab,
    handleCloseAllTabs,
    handleKill,
    editingTabId,
    editValue,
    editInputRef,
    setEditValue,
    handleDoubleClick,
    handleEditSubmit,
    handleEditKeyDown,
  };
}
