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
      setAddress(event.target.value);
    },
    [setAddress],
  );

  const handleAddressKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        submitAddress();
      } else if (event.key === 'Escape') {
        setSearchQueryDisplay('');
        if (activeTabUrl !== undefined) {
          setAddress(activeTabUrl);
        }
        setAddressExpanded(false);
        addressInputRef.current?.blur();
      }
    },
    [submitAddress, activeTabUrl, setAddress, setAddressExpanded, addressInputRef, setSearchQueryDisplay],
  );

  const handleAddressBlur = useCallback(() => {
    console.info('[ADL-DEBUG][address] blur', {
      activeTabUrl,
      restoreTo: activeTabUrl ?? '(undefined)',
    });
    setSearchQueryDisplay('');
    setAddressExpanded(false);
    if (activeTabUrl !== undefined) {
      setAddress(activeTabUrl);
    }
  }, [setAddressExpanded, activeTabUrl, setAddress, setSearchQueryDisplay]);

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
