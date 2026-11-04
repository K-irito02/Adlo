import React from 'react';
import { IconSearch } from '@icons';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  className?: string;
}

export const SearchInput = React.memo(function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  inputRef,
  className,
}: SearchInputProps) {
  return (
    <label
      className={`adl-tool-search adl-tool-search--navigator${className ? ` ${className}` : ''}`}
    >
      <IconSearch size={12} decorative />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    </label>
  );
});
