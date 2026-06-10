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
  } = options;

  const handleAddressChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setAddress(event.target.value);
  };

  const handleAddressKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      submitAddress();
    }
  };

  const handleAddressBlur = () => {
    setAddressExpanded(false);
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

  const handleCopyUrl = (url: string) => {
    if (url) {
      navigator.clipboard?.writeText(url).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      });
    }
  };

  return {
    address,
    addressExpanded,
    addressSearchRef,
    addressInputRef,
    handleAddressChange,
    handleAddressKeyDown,
    handleAddressBlur,
    handleSearchClick,
    handleCopyUrl,
  };
}
