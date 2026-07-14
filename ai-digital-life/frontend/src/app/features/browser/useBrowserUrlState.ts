import { useCallback, useEffect, useMemo } from 'react';

interface UseBrowserUrlStateOptions {
  address: string;
  addressExpanded: boolean;
  addressSearchRef: React.RefObject<HTMLLabelElement | null>;
  addressInputRef: React.RefObject<HTMLInputElement | null>;
  setAddress: React.Dispatch<React.SetStateAction<string>>;
  setAddressExpanded: React.Dispatch<React.SetStateAction<boolean>>;
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
    submitAddress,
    activeTabUrl,
  } = options;

  const handleAddressChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setAddress(event.target.value);
    },
    [setAddress]
  );

  const handleAddressKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        submitAddress();
      } else if (event.key === 'Escape') {
        if (activeTabUrl !== undefined) {
          setAddress(activeTabUrl);
        }
        setAddressExpanded(false);
        addressInputRef.current?.blur();
      }
    },
    [submitAddress, activeTabUrl, setAddress, setAddressExpanded, addressInputRef]
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
      handleAddressChange,
      handleAddressKeyDown,
      handleAddressBlur,
      handleSearchClick,
    }),
    [
      address,
      addressExpanded,
      addressSearchRef,
      addressInputRef,
      handleAddressChange,
      handleAddressKeyDown,
      handleAddressBlur,
      handleSearchClick,
    ]
  );
}
