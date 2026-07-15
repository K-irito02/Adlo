import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { FontControl } from './FontControl';
import type { SettingItem } from '@shared/ipc';
import type { CopyDict } from '../../i18n';

const mockItem: SettingItem = {
  id: 'font:ui',
  groupId: 'general',
  label: 'UI Font',
  type: 'font',
  value: '',
  cssVar: '--font-sans-custom',
};

const mockT = {
  settingsFontPreview: 'Preview text',
} as unknown as CopyDict;

describe('FontControl', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--font-sans-custom');
    document.documentElement.style.removeProperty('--font-mono-custom');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('renders input with placeholder based on cssVar', () => {
    render(
      <FontControl item={mockItem} cssVar="--font-sans-custom" onChange={() => {}} t={mockT} />
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.placeholder).toBe('Inter');
  });

  it('renders preview text from t.settingsFontPreview', () => {
    render(
      <FontControl item={mockItem} cssVar="--font-sans-custom" onChange={() => {}} t={mockT} />
    );
    expect(screen.getByText('Preview text')).toBeDefined();
  });

  it('sets CSS variable on mount when value is non-empty', () => {
    const itemWithValue: SettingItem = { ...mockItem, value: 'Inter' };
    render(
      <FontControl item={itemWithValue} cssVar="--font-sans-custom" onChange={() => {}} t={mockT} />
    );
    expect(document.documentElement.style.getPropertyValue('--font-sans-custom')).toBe('Inter');
  });

  it('removes CSS variable on mount when value is empty', () => {
    render(
      <FontControl item={mockItem} cssVar="--font-sans-custom" onChange={() => {}} t={mockT} />
    );
    expect(document.documentElement.style.getPropertyValue('--font-sans-custom')).toBe('');
  });

  it('updates CSS variable immediately on input change', () => {
    render(
      <FontControl item={mockItem} cssVar="--font-sans-custom" onChange={() => {}} t={mockT} />
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'Roboto' } });
    });
    expect(document.documentElement.style.getPropertyValue('--font-sans-custom')).toBe('Roboto');
  });

  it('removes CSS variable when input becomes empty', () => {
    const itemWithValue: SettingItem = { ...mockItem, value: 'Inter' };
    render(
      <FontControl item={itemWithValue} cssVar="--font-sans-custom" onChange={() => {}} t={mockT} />
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: '' } });
    });
    expect(document.documentElement.style.getPropertyValue('--font-sans-custom')).toBe('');
  });

  it('calls onChange after 500ms debounce', () => {
    const onChange = vi.fn();
    render(
      <FontControl item={mockItem} cssVar="--font-sans-custom" onChange={onChange} t={mockT} />
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'Roboto' } });
    });
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Roboto');
  });

  it('debounces multiple rapid changes to single onChange call', () => {
    const onChange = vi.fn();
    render(
      <FontControl item={mockItem} cssVar="--font-sans-custom" onChange={onChange} t={mockT} />
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'R' } });
      fireEvent.change(input, { target: { value: 'Ro' } });
      fireEvent.change(input, { target: { value: 'Rob' } });
      fireEvent.change(input, { target: { value: 'Roboto' } });
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Roboto');
  });
});
