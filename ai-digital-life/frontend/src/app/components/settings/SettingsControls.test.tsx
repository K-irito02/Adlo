import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import type { SettingItem } from '@ai-digital-life/kernel';
import { InputControl, SettingsControls } from './SettingsControls';
import { TCopyProvider } from '../../i18n/TCopyContext';
import type { CopyDict } from '../../i18n';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

describe('InputControl', () => {
  it('debounces onChange by 500ms', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const item: SettingItem = {
      id: 'test',
      groupId: 'general',
      label: 'Test',
      type: 'input',
      value: '',
    };
    render(<InputControl item={item} onChange={onChange} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('abc');
    vi.useRealTimers();
  });
});

describe('SettingsControls reset button', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders reset button for setting with default value (e.g. language input)', () => {
    const items: SettingItem[] = [
      {
        id: 'language',
        groupId: 'general',
        label: 'Language',
        type: 'input',
        value: 'en-US',
      },
    ];
    render(
      <TestProvider>
        <SettingsControls items={items} onChange={() => {}} />
      </TestProvider>
    );
    const resetBtn = screen.queryByRole('button', { name: 'settingsResetToDefault' });
    expect(resetBtn).not.toBeNull();
  });

  it('does not render reset button for readonly items', () => {
    const items: SettingItem[] = [
      {
        id: 'app.version',
        groupId: 'general',
        label: 'App Version',
        type: 'readonly',
        value: '1.0.0',
      },
    ];
    render(
      <TestProvider>
        <SettingsControls items={items} onChange={() => {}} />
      </TestProvider>
    );
    const resetBtn = screen.queryByRole('button', { name: 'settingsResetToDefault' });
    expect(resetBtn).toBeNull();
  });

  it('does not render reset button for items without a default value', () => {
    const items: SettingItem[] = [
      {
        id: 'unknown.setting',
        groupId: 'general',
        label: 'Unknown Setting',
        type: 'input',
        value: 'something',
      },
    ];
    render(
      <TestProvider>
        <SettingsControls items={items} onChange={() => {}} />
      </TestProvider>
    );
    const resetBtn = screen.queryByRole('button', { name: 'settingsResetToDefault' });
    expect(resetBtn).toBeNull();
  });

  it('clicking reset button calls onChange with default value', () => {
    const onChange = vi.fn();
    const items: SettingItem[] = [
      {
        id: 'language',
        groupId: 'general',
        label: 'Language',
        type: 'input',
        value: 'en-US',
      },
    ];
    render(
      <TestProvider>
        <SettingsControls items={items} onChange={onChange} />
      </TestProvider>
    );
    const resetBtn = screen.getByRole('button', { name: 'settingsResetToDefault' });
    fireEvent.click(resetBtn);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('language', 'zh-CN');
  });

  it('clicking reset for font setting calls onChange with empty string', () => {
    const onChange = vi.fn();
    const items: SettingItem[] = [
      {
        id: 'font:ui',
        groupId: 'general',
        label: 'UI Font',
        type: 'font',
        value: 'Inter',
        cssVar: '--font-sans-custom',
      },
    ];
    render(
      <TestProvider>
        <SettingsControls items={items} onChange={onChange} />
      </TestProvider>
    );
    const resetBtn = screen.getByRole('button', { name: 'settingsResetToDefault' });
    fireEvent.click(resetBtn);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('font:ui', '');
  });
});
