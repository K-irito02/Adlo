import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type React from 'react';
import { useBrowserUrlState } from '../useBrowserUrlState';

function setup() {
  const setAddress = vi.fn();
  const setAddressExpanded = vi.fn();
  const setSearchQueryDisplay = vi.fn();
  const submitAddress = vi.fn();
  const input = document.createElement('input');
  document.body.appendChild(input);
  input.focus();
  const { result } = renderHook(() =>
    useBrowserUrlState({
      address: 'https://typed.example.com',
      addressExpanded: true,
      addressSearchRef: { current: null },
      addressInputRef: { current: input },
      setAddress,
      setAddressExpanded,
      searchQueryDisplay: '',
      setSearchQueryDisplay,
      submitAddress,
      activeTabUrl: 'about:blank',
    }),
  );
  return { result, setAddressExpanded, submitAddress, input };
}

describe('useBrowserUrlState', () => {
  it('Enter 提交时收起地址栏并 blur（标准浏览器行为，不依赖 overlay 门控）', () => {
    const { result, setAddressExpanded, submitAddress, input } = setup();
    const blurSpy = vi.spyOn(input, 'blur');
    act(() => {
      result.current.handleAddressKeyDown({
        key: 'Enter',
      } as React.KeyboardEvent<HTMLInputElement>);
    });
    expect(submitAddress).toHaveBeenCalledTimes(1);
    expect(setAddressExpanded).toHaveBeenCalledWith(false);
    expect(blurSpy).toHaveBeenCalledTimes(1);
    blurSpy.mockRestore();
    input.remove();
  });

  it('Escape 保持原有行为（恢复地址并收起）', () => {
    const { result, setAddressExpanded } = setup();
    act(() => {
      result.current.handleAddressKeyDown({
        key: 'Escape',
      } as React.KeyboardEvent<HTMLInputElement>);
    });
    expect(setAddressExpanded).toHaveBeenCalledWith(false);
    document.body.innerHTML = '';
  });
});
