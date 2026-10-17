import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { TCopyProvider } from '../../i18n/TCopyContext';
import type { CopyDict } from '../../i18n';
import { useAppStore } from '../../stores/slicedStore';
import { flushCrossSliceWrites } from '../../stores/storageHelpers';
import { themeController } from '../../utils/theme';
import { MarkdownPreview } from '@features/preview/MarkdownPreview';
import { MarkdownThemeSelector } from './MarkdownThemeSelector';

vi.mock('@features/preview/starryNight', () => ({
  ensureStarryNight: () => Promise.resolve(null),
  isStarryReady: () => false,
  subscribeStarryReady: () => () => {},
  highlightWithStarry: () => null,
}));

// `?inline` 静态资源在 vitest 下解析为空串，此处给可区分的假文本；
/// 内容模拟变量驱动单一样式表：6 组 `[data-md-theme]` 变量块 + 参数化规则。
vi.mock('@root/styles/vendor/markdown-theme-vars.css?inline', () => ({
  default: [
    '.adl-markdown-preview[data-md-theme="light"]{--md-fg-default:#1f2328;}',
    '.adl-markdown-preview[data-md-theme="light-colorblind"]{--md-fg-default:#1f2328;}',
    '.adl-markdown-preview[data-md-theme="dark"]{--md-fg-default:#f0f6fc;}',
    '.adl-markdown-preview[data-md-theme="dark-dimmed"]{--md-fg-default:#f0f6fc;}',
    '.adl-markdown-preview[data-md-theme="dark-high-contrast"]{--md-fg-default:#ffffff;}',
    '.adl-markdown-preview[data-md-theme="dark-colorblind"]{--md-fg-default:#f0f6fc;}',
    '.markdown-body{color:var(--md-fg-default);}',
  ].join('\n'),
}));

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

function themeStyle(): HTMLStyleElement | null {
  return document.head.querySelector('style[data-adl-md-style="theme"]');
}

function themeStyleCount(): number {
  return document.head.querySelectorAll('style[data-adl-md-style="theme"]').length;
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ lightMarkdownTheme: 'light', darkMarkdownTheme: 'dark' });
});

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('style[data-adl-md-style]').forEach((el) => el.remove());
});

describe('MarkdownPreview theme wiring', () => {
  it('renders markdown-body with the resolved store theme and injects one CSS pair', () => {
    const { container } = render(
      <TestProvider>
        <MarkdownPreview content="# Hi" />
      </TestProvider>,
    );
    const appTheme = themeController.getState().resolvedTheme;
    const expected = appTheme === 'light' ? 'light' : 'dark';
    const preview = container.querySelector('.adl-markdown-preview.markdown-body');
    expect(preview).not.toBeNull();
    expect(preview?.getAttribute('data-md-theme')).toBe(expected);
    // 单一样式表只注入一次，含 6 组变量定义 + 参数化规则（事项 8 方案 A）
    expect(themeStyleCount()).toBe(1);
    const text = themeStyle()?.textContent ?? '';
    for (const id of [
      'light',
      'light-colorblind',
      'dark',
      'dark-dimmed',
      'dark-high-contrast',
      'dark-colorblind',
    ]) {
      expect(text).toContain(`[data-md-theme="${id}"]`);
    }
    expect(text).toContain('var(--md-fg-default)');
  });

  it('switching themes only flips data-md-theme, stylesheet text stays constant', async () => {
    const { container } = render(
      <TestProvider>
        <MarkdownPreview content="# Hi" />
      </TestProvider>,
    );
    const appTheme = themeController.getState().resolvedTheme;
    const before = themeStyle()?.textContent;
    const target = appTheme === 'light' ? 'light-colorblind' : 'dark-dimmed';
    if (appTheme === 'light') {
      useAppStore.getState().setLightMarkdownTheme('light-colorblind');
    } else {
      useAppStore.getState().setDarkMarkdownTheme('dark-dimmed');
    }
    await waitFor(() =>
      expect(container.querySelector('.adl-markdown-preview')?.getAttribute('data-md-theme')).toBe(
        target,
      ),
    );
    // 换肤 = 属性翻转，样式表文本零变化、节点零增删
    expect(themeStyle()?.textContent).toBe(before);
    expect(themeStyleCount()).toBe(1);
  });
});

describe('MarkdownThemeSelector', () => {
  it('lists only the current app-theme group', () => {
    render(
      <TestProvider>
        <MarkdownThemeSelector />
      </TestProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'markdownThemeTooltip' }));
    const items = screen.getAllByRole('menuitemradio');
    const appTheme = themeController.getState().resolvedTheme;
    expect(items).toHaveLength(appTheme === 'light' ? 2 : 4);
  });

  it('hover previews, leave restores, click confirms and persists', async () => {
    render(
      <TestProvider>
        <MarkdownThemeSelector />
      </TestProvider>,
    );
    const appTheme = themeController.getState().resolvedTheme;
    const getTheme = () =>
      appTheme === 'light'
        ? useAppStore.getState().lightMarkdownTheme
        : useAppStore.getState().darkMarkdownTheme;
    const second = appTheme === 'light' ? 'light-colorblind' : 'dark-dimmed';
    const secondLabel =
      appTheme === 'light' ? 'markdownThemeLightColorblind' : 'markdownThemeDarkDimmed';

    fireEvent.click(screen.getByRole('button', { name: 'markdownThemeTooltip' }));
    const menu = screen.getByRole('menu');
    const option = screen.getByRole('menuitemradio', { name: new RegExp(secondLabel) });
    // 打开后首帧 hover 守卫（与图表主题选择器同机制）： pump 一帧后再悬停。
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    // 悬停即时预览正文主题
    fireEvent.mouseEnter(option);
    await waitFor(() => expect(getTheme()).toBe(second));

    // 离开菜单恢复已确认值（React 从 mouseout 合成 leave，原生 mouseleave 不冒泡）。
    fireEvent.mouseOut(menu, { relatedTarget: document.body });
    expect(getTheme()).toBe(appTheme === 'light' ? 'light' : 'dark');

    // 点击确认：菜单关闭 + 持久化落盘
    fireEvent.mouseEnter(option);
    await waitFor(() => expect(getTheme()).toBe(second));
    fireEvent.click(option);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(getTheme()).toBe(second);
    flushCrossSliceWrites();
    const stored = localStorage.getItem(
      appTheme === 'light' ? 'adl:files.markdownThemeLight' : 'adl:files.markdownThemeDark',
    );
    expect(stored).toBe(JSON.stringify(second));
  });
});
