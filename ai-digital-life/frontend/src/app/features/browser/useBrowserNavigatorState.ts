import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';

interface UseBrowserNavigatorStateOptions {
  navigatorSearchInputRef: React.RefObject<HTMLInputElement | null>;
}

/**
 * BrowserPanel 导航器状态子 Hook：
 * - 导航器模式（tabs/open/list/search）与文件树选中路径上提 store
 *  （`adl:browser.navigatorMode` / `adl:browser.selectedTreePath`，Task 24），
 *   对外 API 不变；地址栏输入与展开状态仍是瞬态本地 state（不登记）。
 * - 持有文件树选中路径的 ref 镜像
 * - 维护 submitAddress 所需的版本号 / 上次提交 url 引用
 * - 注册全局 click/window blur 监听以同步文件树选中状态
 *   （"点击外部即清空"保留 —— 清空同样落盘 null，重启不恢复已放弃项）
 * - 在 addressExpanded / navigatorMode==='search' 变化时自动 focus 对应输入框
 *
 * 编排层负责的 mousedown 外部点击关闭逻辑仍留在 BrowserPanel（涉及 browserMenuOpen）。
 */
export function useBrowserNavigatorState({
  navigatorSearchInputRef,
}: UseBrowserNavigatorStateOptions) {
  const navigatorMode = useAppStore((s) => s.browserNavigatorMode);
  const setNavigatorMode = useAppStore((s) => s.setBrowserNavigatorMode);
  const [address, setAddress] = useState('');
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [searchQueryDisplay, setSearchQueryDisplay] = useState('');
  const addressSearchRef = useRef<HTMLLabelElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);

  const selectedTreePath = useAppStore((s) => s.browserSelectedTreePath);
  const setSelectedTreePath = useAppStore((s) => s.setBrowserSelectedTreePath);
  // 初值取首渲染快照（含重启水合值），之后调用处同步写（blur 处理读 ref）
  const selectedTreePathRef = useRef<string | null>(selectedTreePath);
  // ref 与原实现一致保持同步镜像（blur 处理读 ref，须与调用同 tick 可见）
  const handleSelectTreePath = useCallback(
    (path: string | null) => {
      selectedTreePathRef.current = path;
      setSelectedTreePath(path);
    },
    [setSelectedTreePath],
  );

  const submitVersionRef = useRef(0);
  const addressSubmittedForTabRef = useRef('');

  const handleGlobalClick = useCallback(
    (e: MouseEvent) => {
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
    },
    [handleSelectTreePath],
  );

  useEffect(() => {
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, [handleGlobalClick]);

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
