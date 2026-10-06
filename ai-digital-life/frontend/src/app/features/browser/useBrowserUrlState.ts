import { useCallback, useEffect, useMemo } from 'react';

interface UseBrowserUrlStateOptions {
  address: string;
  addressExpanded: boolean;
  addressSearchRef: React.RefObject<HTMLLabelElement | null>;
  addressInputRef: React.RefObject<HTMLInputElement | null>;
  setAddress: React.Dispatch<React.SetStateAction<string>>;
  setAddressExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  searchQueryDisplay: string;
  setSearchQueryDisplay: React.Dispatch<React.SetStateAction<string>>;
  submitAddress: () => void;
  activeTabUrl?: string;
}

export function useBrowserUrlState(options: UseBrowserUrlStateOptions) {
  const {
    address,
    addressExpanded,
    addressSearchRef,
    addressInputRef,
    setAddress,
    setAddressExpanded,
    searchQueryDisplay,
    setSearchQueryDisplay,
    submitAddress,
    activeTabUrl,
  } = options;

  const handleAddressChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQueryDisplay('');
      setAddress(event.target.value);
    },
    [setAddress, setSearchQueryDisplay],
  );

  const handleAddressKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        // 回车提交即收起地址栏并 blur（事项 8）：地址展开态属于 overlay，
        // 中心 overlay 会让 lifecycle 同 id 重入整跳过（WebView 根本不创建）
        // 或让揭示期的边界同步被跳过（WebView 停在屏外），直到切换/缩放才恢复。
        // 回车后收起是标准浏览器行为（Chrome 回车即聚焦回页面），面板不受影响
        // （面板 overlay 本就不含地址展开态）。
        setAddressExpanded(false);
        addressInputRef.current?.blur();
        submitAddress();
      } else if (event.key === 'Escape') {
        if (activeTabUrl !== undefined) {
          setAddress(activeTabUrl);
        }
        setAddressExpanded(false);
        addressInputRef.current?.blur();
      }
    },
    [submitAddress, activeTabUrl, setAddress, setAddressExpanded, addressInputRef],
  );

  const handleAddressBlur = useCallback(() => {
    setAddressExpanded(false);
    if (activeTabUrl !== undefined) {
      setAddress(activeTabUrl);
    }
  }, [setAddressExpanded, activeTabUrl, setAddress]);

  const handleSearchClick = useCallback(() => {
    setAddressExpanded(true);
  }, [setAddressExpanded]);

  // "+" button in "current tab" mode: clear the address bar and expand it
  // for editing, WITHOUT navigating or removing the current webview. The
  // current page stays visible until the user enters a new URL and presses
  // Enter. If the user clicks away without entering a URL, handleAddressBlur
  // restores the original URL via activeTabUrl.
  const handlePlusClick = useCallback(() => {
    setAddress('');
    setAddressExpanded(true);
  }, [setAddress, setAddressExpanded]);

  useEffect(() => {
    if (addressExpanded) {
      addressInputRef.current?.focus();
      addressInputRef.current?.select();
    }
  }, [addressExpanded, addressInputRef]);

  return useMemo(
    () => ({
      address,
      addressExpanded,
      addressSearchRef,
      addressInputRef,
      searchQueryDisplay,
      handleAddressChange,
      handleAddressKeyDown,
      handleAddressBlur,
      handleSearchClick,
      handlePlusClick,
    }),
    [
      address,
      addressExpanded,
      addressSearchRef,
      addressInputRef,
      searchQueryDisplay,
      handleAddressChange,
      handleAddressKeyDown,
      handleAddressBlur,
      handleSearchClick,
      handlePlusClick,
    ],
  );
}
