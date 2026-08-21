import { useCallback, useEffect, useRef, useState } from 'react';
import type { BrowserNavigatorMode } from './useBrowserTabs';

interface UseBrowserNavigatorStateOptions {
  navigatorSearchInputRef: React.RefObject<HTMLInputElement | null>;
}

/**
 * BrowserPanel 导航器状态子 Hook：
 * - 持有 navigator 模式（tabs/open/list/search）、地址栏输入与展开状态
 * - 持有文件树选中路径状态（selectedTreePath + ref 镜像）
 * - 维护 submitAddress 所需的版本号 / 上次提交 url 引用
 * - 注册全局 click/window blur 监听以同步文件树选中状态
 * - 在 addressExpanded / navigatorMode==='search' 变化时自动 focus 对应输入框
 *
 * 编排层负责的 mousedown 外部点击关闭逻辑仍留在 BrowserPanel（涉及 browserMenuOpen）。
 */
export function useBrowserNavigatorState({
  navigatorSearchInputRef,
}: UseBrowserNavigatorStateOptions) {
  const [navigatorMode, setNavigatorMode] = useState<BrowserNavigatorMode>('tabs');
  const [address, setAddress] = useState('');
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [searchQueryDisplay, setSearchQueryDisplay] = useState('');
  const addressSearchRef = useRef<HTMLLabelElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedTreePath, setSelectedTreePath] = useState<string | null>(null);
  const selectedTreePathRef = useRef<string | null>(null);

  const submitVersionRef = useRef(0);
  const addressSubmittedForTabRef = useRef('');

  const handleSelectTreePath = useCallback((path: string | null) => {
    selectedTreePathRef.current = path;
    setSelectedTreePath(path);
  }, []);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const clickedEntry = target.closest('.adl-browser-entry');
      const clickedFileTreeRow = target.closest('.adl-filetree__row');

      if (clickedEntry) {
        if (clickedFileTreeRow) {
          const row = clickedFileTreeRow as HTMLElement;
          const nodePath = row.dataset.path;
          if (nodePath) {
            handleSelectTreePath(nodePath);
            return;
          }
        }
        return;
      }

      handleSelectTreePath(null);
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, [handleSelectTreePath]);

  useEffect(() => {
    const handleWindowBlur = () => {
      if (selectedTreePathRef.current !== null) {
        handleSelectTreePath(null);
      }
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [handleSelectTreePath]);

  useEffect(() => {
    if (addressExpanded) {
      addressInputRef.current?.focus();
      addressInputRef.current?.select();
    }
  }, [addressExpanded, addressInputRef]);

  useEffect(() => {
    if (navigatorMode === 'search') {
      navigatorSearchInputRef.current?.focus();
      navigatorSearchInputRef.current?.select();
    }
  }, [navigatorMode, navigatorSearchInputRef]);

  return {
    navigatorMode,
    setNavigatorMode,
    address,
    setAddress,
    addressExpanded,
    setAddressExpanded,
    searchQueryDisplay,
    setSearchQueryDisplay,
    addressSearchRef,
    addressInputRef,
    selectedTreePath,
    selectedTreePathRef,
    handleSelectTreePath,
    submitVersionRef,
    addressSubmittedForTabRef,
  };
}
