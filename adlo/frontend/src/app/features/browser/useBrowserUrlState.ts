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
        // 回车提交即收起地址栏并 blur（事项 8）：这是标准浏览器行为
        // （Chrome 回车后聚焦回页面）。地址展开是工具栏内联展开，不再计入
        // overlayActive，因此收起动作本身不再影响中心 WebView2 的可见性。
        // 时序说明：blur 的恢复写（旧 URL）先跑，提交写（finalUrl）后跑覆盖，
        // 最终一致；中间闪一次旧值可接受（L4）。
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
