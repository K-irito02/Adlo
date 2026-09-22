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
    // 预览为第一个子节点，下拉为第二个（含触发器），顺序即左右布局。
    expect(row?.children[0]?.classList.contains('adl-settings-font__preview')).toBe(true);
    expect(row?.children[1]?.querySelector('.adl-settings-dropdown__trigger')).not.toBeNull();
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
    // mouseleave 在 listbox 上派发，依赖 React 合成事件冒泡到菜单容器 div 的 onMouseLeave。
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

  it('backfills an unknown committed value as an extra option', () => {
    const custom: SettingItem = { ...mockItem, value: 'Roboto' };
    render(<FontControl item={custom} cssVar="--font-sans-custom" onChange={() => {}} t={mockT} />);
    fireEvent.click(screen.getByRole('button', { name: 'UI Font' }));
    expect(screen.getByRole('option', { name: 'Roboto' })).toBeDefined();
  });

  it('shows the default label when empty and clears on selecting Default', () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <FontControl item={mockItem} cssVar="--font-sans-custom" onChange={() => {}} t={mockT} />,
    );
    expect(screen.getByRole('button', { name: 'UI Font' }).textContent).toContain('Default');
    unmount();
    // 当前已为空时选“默认”不回调（去重）；从非空切回才落盘 ''。
    const withValue: SettingItem = { ...mockItem, value: 'Inter' };
    render(
      <FontControl item={withValue} cssVar="--font-sans-custom" onChange={onChange} t={mockT} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'UI Font' }));
    fireEvent.click(screen.getByRole('option', { name: 'Default' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('uses mono candidates for code fonts and follows parent value updates', () => {
    const monoItem: SettingItem = {
      ...mockItem,
      id: 'font:code',
      label: 'Code Font',
      value: '',
      cssVar: '--font-mono-custom',
    };
    const { rerender } = render(
      <FontControl item={monoItem} cssVar="--font-mono-custom" onChange={() => {}} t={mockT} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Code Font' }));
    expect(screen.getByRole('option', { name: 'JetBrains Mono' })).toBeDefined();
    expect(screen.queryByRole('option', { name: 'Inter' })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: 'JetBrains Mono' }));

    // 父传入新值 → CSS 变量跟写。
    rerender(
      <FontControl
        item={{ ...monoItem, value: 'Fira Code' }}
        cssVar="--font-mono-custom"
        onChange={() => {}}
        t={mockT}
      />,
    );
    expect(document.documentElement.style.getPropertyValue('--font-mono-custom')).toBe('Fira Code');
  });
});
