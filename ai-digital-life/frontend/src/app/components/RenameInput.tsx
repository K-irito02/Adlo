import React, { useEffect, useRef } from 'react';

interface RenameInputProps {
  initialValue: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}

export function RenameInput({ initialValue, onConfirm, onCancel }: RenameInputProps) {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const value = ref.current?.value.trim();
      if (value && value !== initialValue) {
        onConfirm(value);
      } else {
        onCancel();
      }
    } else if (event.key === 'Escape') {
      onCancel();
    }
  };

  const handleBlur = () => {
    const value = ref.current?.value.trim();
    if (value && value !== initialValue) {
      onConfirm(value);
    } else {
      onCancel();
    }
  };

  return (
    <input
      ref={ref}
      type="text"
      className="adl-rename-input"
      defaultValue={initialValue}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
