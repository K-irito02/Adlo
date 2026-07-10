import { useEffect } from 'react';

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

  const handleAddressChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setAddress(event.target.value);
  };

  const handleAddressKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      submitAddress();
    } else if (event.key === 'Escape') {
      if (activeTabUrl !== undefined) {
        setAddress(activeTabUrl);
      }
      setAddressExpanded(false);
      addressInputRef.current?.blur();
    }
  };

  const handleAddressBlur = () => {
    setAddressExpanded(false);
    if (activeTabUrl !== undefined) {
      setAddress(activeTabUrl);
    }
  };

  const handleSearchClick = () => {
    setAddressExpanded(true);
  };

  useEffect(() => {
    if (addressExpanded) {
      addressInputRef.current?.focus();
      addressInputRef.current?.select();
    }
  }, [addressExpanded, addressInputRef]);

  return {
    address,
    addressExpanded,
    addressSearchRef,
    addressInputRef,
    handleAddressChange,
    handleAddressKeyDown,
    handleAddressBlur,
    handleSearchClick,
  };
}
