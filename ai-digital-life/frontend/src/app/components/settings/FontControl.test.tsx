import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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
  settingsFontDefault: 'Default',
} as unknown as CopyDict;

describe('FontControl', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--font-sans-custom');
    document.documentElement.style.removeProperty('--font-mono-custom');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders preview text from t.settingsFontPreview', () => {
    render(
      <FontControl item={mockItem} cssVar="--font-sans-custom" onChange={() => {}} t={mockT} />,
    );
    expect(screen.getByText('Preview text')).toBeDefined();
  });

  it('renders dropdown trigger with default label when value is empty', () => {
    render(
      <FontControl item={mockItem} cssVar="--font-sans-custom" onChange={() => {}} t={mockT} />,
    );
    expect(screen.getByRole('button', { name: 'UI Font' })).toBeDefined();
  });

  it('renders preview on the left of the dropdown trigger', () => {
    const { container } = render(
      <FontControl item={mockItem} cssVar="--font-sans-custom" onChange={() => {}} t={mockT} />,
    );
    const row = container.querySelector('.adl-settings-font--row');
    expect(row).not.toBeNull();
    const preview = row?.querySelector('.adl-settings-font__preview');
    const trigger = row?.querySelector('.adl-settings-dropdown__trigger');
    expect(preview).not.toBeNull();
    expect(trigger).not.toBeNull();
    // 预览在 DOM 顺序上先于下拉触发器（视觉左侧）。
    expect(row?.children[0]?.contains(preview ?? null) ?? preview === row?.children[0]).toBe(true);
  });

  it('sets CSS variable on mount when value is non-empty', () => {
    const itemWithValue: SettingItem = { ...mockItem, value: 'Inter' };
    render(
      <FontControl
        item={itemWithValue}
        cssVar="--font-sans-custom"
        onChange={() => {}}
        t={mockT}
      />,
    );
    expect(document.documentElement.style.getPropertyValue('--font-sans-custom')).toBe('Inter');
  });

  it('removes CSS variable on mount when value is empty', () => {
    render(
      <FontControl item={mockItem} cssVar="--font-sans-custom" onChange={() => {}} t={mockT} />,
    );
    expect(document.documentElement.style.getPropertyValue('--font-sans-custom')).toBe('');
  });

  it('hovering an option previews only the preview box, app fonts stay put', () => {
    const { container } = render(
      <FontControl item={mockItem} cssVar="--font-sans-custom" onChange={() => {}} t={mockT} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'UI Font' }));
    const options = screen.getAllByRole('option');
    const inter = options.find((o) => o.textContent?.includes('Inter'));
    expect(inter).toBeDefined();
    fireEvent.mouseEnter(inter!);
    // 预览字样换字体…
    const preview = container.querySelector('.adl-settings-font__preview') as HTMLElement;
    expect(preview.style.fontFamily).toBe('Inter');
    // …但应用级 CSS 变量纹丝不动。
    expect(document.documentElement.style.getPropertyValue('--font-sans-custom')).toBe('');
    fireEvent.mouseLeave(screen.getByRole('listbox'));
    expect(preview.style.fontFamily).toBe('');
  });

  it('clicking an option confirms via onChange', () => {
    const onChange = vi.fn();
    render(
      <FontControl item={mockItem} cssVar="--font-sans-custom" onChange={onChange} t={mockT} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'UI Font' }));
    const options = screen.getAllByRole('option');
    const inter = options.find((o) => o.textContent?.includes('Inter'));
    fireEvent.click(inter!);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Inter');
  });
});
