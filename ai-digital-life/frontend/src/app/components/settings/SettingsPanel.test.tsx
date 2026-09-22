import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import { SettingsPanel } from './SettingsPanel';
import {
  DEFAULT_DEBUG_LOG_MODE,
  DEFAULT_FONTS,
  DEFAULT_LANGUAGE,
  DEFAULT_LOG_LEVEL,
  DEFAULT_TERMINAL_LOG_MODE,
  DEFAULT_THEME_MODE,
  getDefaultPreferences,
} from '../../../shared/defaultPreferences';

// 组文案配含 {group} 的真模板，使 formatT 插值得以被覆盖（裸 key 回退测不到插值）。
const GROUP_TEMPLATES: Record<string, string> = {
  settingsResetGroupToDefault: 'Reset {group} all defaults',
  settingsResetGroupConfirmTitle: 'Reset {group}?',
  settingsResetGroupConfirmMessage: '{group} group will reset',
};

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? (GROUP_TEMPLATES[key] ?? key) : ''),
}) as unknown as CopyDict;

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

function setupStore() {
  const updatePreferences = vi.fn(async () => true);
  const showToast = vi.fn();
  useAppStore.setState((s) => ({
    settingsSearchQuery: '',
    activeSettingsGroup: 'general',
    navigatorCollapsedByTool: { ...s.navigatorCollapsedByTool, settings: false },
    settingsNavigatorWidth: 200,
    updatePreferences,
    showToast,
  }));
  return { updatePreferences, showToast };
}

function renderPanel() {
  return render(
    <TestProvider>
      <SettingsPanel settings={[]} onChangeSetting={() => {}} />
    </TestProvider>,
  );
}

describe('SettingsPanel shell header', () => {
  afterEach(() => {
    cleanup();
    useAppStore.setState((s) => ({
      settingsSearchQuery: '',
      navigatorCollapsedByTool: { ...s.navigatorCollapsedByTool, settings: false },
    }));
  });

  it('初始只渲染搜索图标按钮，不展开输入框', () => {
    setupStore();
    renderPanel();
    expect(screen.getByRole('button', { name: 'settingsSearchLabel' })).not.toBeNull();
    expect(document.querySelector('#adl-settings-search-input')).toBeNull();
  });

  it('点击搜索图标后展开输入框并聚焦', () => {
    setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsSearchLabel' }));
    const input = document.querySelector('#adl-settings-search-input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('输入框按 Escape 收起并清空关键词，焦点回到搜索图标', () => {
    setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsSearchLabel' }));
    const input = document.querySelector('#adl-settings-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'theme' } });
    expect(useAppStore.getState().settingsSearchQuery).toBe('theme');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(useAppStore.getState().settingsSearchQuery).toBe('');
    expect(document.querySelector('#adl-settings-search-input')).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'settingsSearchLabel' }),
    );
  });

  it('输入框失焦到面板外收起并清空关键词', () => {
    setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsSearchLabel' }));
    const input = document.querySelector('#adl-settings-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'theme' } });
    fireEvent.blur(input, { relatedTarget: document.body });
    expect(useAppStore.getState().settingsSearchQuery).toBe('');
    expect(document.querySelector('#adl-settings-search-input')).toBeNull();
  });

  it('输入框失焦收起并清空关键词', () => {
    setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsSearchLabel' }));
    const input = document.querySelector('#adl-settings-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'theme' } });
    fireEvent.blur(input);
    expect(useAppStore.getState().settingsSearchQuery).toBe('');
    expect(document.querySelector('#adl-settings-search-input')).toBeNull();
  });

  it('toggle 右侧带有中段分隔线', () => {
    setupStore();
    renderPanel();
    const header = document.querySelector('.adl-settings-panel__header');
    expect(header?.querySelector('.adl-tool-context__separator')).not.toBeNull();
  });

  it('点击恢复全部默认先弹确认框，不直接执行', () => {
    const { updatePreferences } = setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    expect(screen.getByText('settingsResetConfirmTitle')).not.toBeNull();
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it('确认框点确认执行恢复并关闭，点取消不执行', async () => {
    const { updatePreferences, showToast } = setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(updatePreferences).toHaveBeenCalledTimes(1);
      expect(updatePreferences).toHaveBeenCalledWith(getDefaultPreferences());
      expect(showToast).toHaveBeenCalled();
    });
    expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    expect(screen.getByText('settingsResetConfirmTitle')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(updatePreferences).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();
  });

  it('blur 到面板内控件保持过滤与展开', () => {
    setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsSearchLabel' }));
    const input = document.querySelector('#adl-settings-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'theme' } });
    fireEvent.blur(input, {
      relatedTarget: screen.getByRole('button', { name: 'settingsResetAll' }),
    });
    expect(useAppStore.getState().settingsSearchQuery).toBe('theme');
    expect(document.querySelector('#adl-settings-search-input')).not.toBeNull();
  });

  it('恢复失败弹错误提示而非成功提示', async () => {
    const { updatePreferences, showToast } = setupStore();
    updatePreferences.mockResolvedValue(false);
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('settingsUpdateFailed', 'error');
    });
    expect(showToast).not.toHaveBeenCalledWith('settingsResetComplete', 'success');
  });

  it('对话框按 Escape 与点 overlay 关闭且不执行', () => {
    const { updatePreferences } = setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    fireEvent.click(screen.getByRole('dialog'));
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();
  });

  it('点击对话框内层不关闭', () => {
    const { updatePreferences } = setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    const inner = document.querySelector('.adl-confirm-dialog') as HTMLElement;
    expect(inner).not.toBeNull();
    fireEvent.click(inner);
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(screen.getByText('settingsResetConfirmTitle')).not.toBeNull();
  });

  it('确认框打开时搜索框 Escape 只关框不清空关键词', () => {
    setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    expect(screen.getByText('settingsResetConfirmTitle')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'settingsSearchLabel' }));
    const input = document.querySelector('#adl-settings-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'theme' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();
    expect(useAppStore.getState().settingsSearchQuery).toBe('theme');
    expect(document.querySelector('#adl-settings-search-input')).not.toBeNull();
  });

  it('内外各仅一处 settings-nav 类（防嵌套回归）', () => {
    setupStore();
    renderPanel();
    expect(document.querySelectorAll('.adl-settings-nav').length).toBe(1);
    const innerNav = document.querySelector('.adl-settings-panel__body nav:not([class])');
    expect(innerNav).not.toBeNull();
    expect(innerNav?.getAttribute('aria-label')).toBe('settingsTitle');
  });
});

describe('SettingsPanel group reset', () => {
  afterEach(() => {
    cleanup();
    useAppStore.setState((s) => ({
      settingsSearchQuery: '',
      navigatorCollapsedByTool: { ...s.navigatorCollapsedByTool, settings: false },
    }));
  });

  it('组级重置弹分组文案（含组名插值）而非“恢复全部”文案', async () => {
    const { updatePreferences } = setupStore();
    renderPanel();
    // mockT 组模板含 {group}：断言插值后文本，覆盖 formatT 真路径。
    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsGeneral all defaults' }));
    expect(screen.getByText('Reset settingsGeneral?')).not.toBeNull();
    expect(screen.getByText('settingsGeneral group will reset')).not.toBeNull();
    expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(updatePreferences).toHaveBeenCalledTimes(1);
    });
    // 组级 patch 全值断言：只含 general 组 6 项（不含 keybinds 等全局项），fonts 为全量默认。
    expect(updatePreferences).toHaveBeenCalledWith({
      language: DEFAULT_LANGUAGE,
      themeMode: DEFAULT_THEME_MODE,
      logLevel: DEFAULT_LOG_LEVEL,
      terminalLogMode: DEFAULT_TERMINAL_LOG_MODE,
      debugLogMode: DEFAULT_DEBUG_LOG_MODE,
      fonts: { ...DEFAULT_FONTS },
    });
    expect(screen.queryByText('Reset settingsGeneral?')).toBeNull();
  });

  it('组级重置成功弹成功提示；取消不执行且重开回全局文案', async () => {
    const { updatePreferences, showToast } = setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsGeneral all defaults' }));
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(screen.queryByText('Reset settingsGeneral?')).toBeNull();

    // 重开应回到全局文案（pendingResetGroup 已清零）。
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    expect(screen.getByText('settingsResetConfirmTitle')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsGeneral all defaults' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('settingsResetComplete', 'success');
    });
  });

  it('组级重置失败弹错误提示', async () => {
    const { updatePreferences, showToast } = setupStore();
    updatePreferences.mockResolvedValue(false);
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsGeneral all defaults' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('settingsUpdateFailed', 'error');
    });
  });
});
