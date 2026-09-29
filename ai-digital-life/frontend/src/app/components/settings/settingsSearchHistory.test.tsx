import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { SettingItem } from '@shared/ipc';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import { SettingsPanel } from './SettingsPanel';

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

function seedStore(history: string[] = []) {
  useAppStore.setState((s) => ({
    settingsSearchQuery: '',
    settingsSearchHistory: history,
    activeSettingsGroup: 'general',
    navigatorCollapsedByTool: { ...s.navigatorCollapsedByTool, settings: false },
    settingsNavigatorWidth: 200,
    updatePreferences: vi.fn(async () => true),
    showToast: vi.fn(),
  }));
}

function renderPanel(items: SettingItem[] = []) {
  return render(
    <TestProvider>
      <SettingsPanel settings={items} onChangeSetting={() => {}} />
    </TestProvider>,
  );
}

function openSearch(): HTMLInputElement {
  fireEvent.click(screen.getByRole('button', { name: 'settingsSearchLabel' }));
  return document.querySelector('#adl-settings-search-input') as HTMLInputElement;
}

const card = () => document.querySelector('.adl-settings-search-history');
const items = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('.adl-settings-search-history__item'));

describe('设置面板搜索历史卡片', () => {
  beforeEach(() => {
    seedStore();
  });

  afterEach(() => {
    cleanup();
    useAppStore.setState((s) => ({
      settingsSearchQuery: '',
      settingsSearchHistory: [],
      navigatorCollapsedByTool: { ...s.navigatorCollapsedByTool, settings: false },
    }));
  });

  it('无历史时不渲染卡片', () => {
    renderPanel();
    openSearch();
    expect(card()).toBeNull();
  });

  it('有历史且查询为空时渲染卡片，标题取 i18n 文案、条目按最近在前', () => {
    seedStore(['theme', 'font']);
    renderPanel();
    openSearch();
    expect(card()).not.toBeNull();
    expect(document.querySelector('.adl-settings-search-history__title')?.textContent).toBe(
      'settingsSearchHistory',
    );
    expect(items().map((el) => el.textContent)).toEqual(['theme', 'font']);
  });

  it('开框即开始输入（查询非空）时不渲染卡片，避免遮挡结果', () => {
    seedStore(['theme']);
    renderPanel();
    const input = openSearch();
    fireEvent.change(input, { target: { value: 'th' } });
    expect(card()).toBeNull();
  });

  it('输入框关闭原生自动填充（Edge「保存的信息」下拉不再出现）', () => {
    renderPanel();
    const input = openSearch();
    expect(input.getAttribute('autocomplete')).toBe('off');
  });

  it('每条记录的 title 只放记录全文本身（过长时卡片内省略号截断的兜底）', () => {
    const long = 'a'.repeat(120);
    seedStore([long]);
    renderPanel();
    openSearch();
    const item = items()[0];
    expect(item.getAttribute('title')).toBe(long);
    expect(item.textContent).toBe(long);
  });

  it('点击记录：以该串重新搜索并收起卡片', () => {
    seedStore(['theme']);
    renderPanel();
    const input = openSearch();
    fireEvent.click(items()[0]);
    expect(useAppStore.getState().settingsSearchQuery).toBe('theme');
    expect(input.value).toBe('theme');
    expect(card()).toBeNull();
  });

  it('悬停记录：预览写入输入框并整体选中，移出卡片即还原', () => {
    seedStore(['theme']);
    renderPanel();
    const input = openSearch();
    fireEvent.mouseEnter(items()[0]);
    expect(input.value).toBe('theme');
    // 整体选中 → 蓝色选中态只包住文字本身，不会向右延伸。
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 5]);
    // 预览不写 store：提交值仍是空查询。
    expect(useAppStore.getState().settingsSearchQuery).toBe('');

    fireEvent.mouseLeave(card() as Element);
    expect(input.value).toBe('');
  });

  it('预览态下按键即替换整段预览（不会拼成「记录 + 新字符」的脏查询）', () => {
    seedStore(['theme']);
    renderPanel();
    const input = openSearch();
    fireEvent.mouseEnter(items()[0]);
    // 选中态下浏览器会以新字符替换整段选中；jsdom 不模拟替换，直接断言 change 事件清掉预览。
    fireEvent.change(input, { target: { value: 'f' } });
    expect(input.value).toBe('f');
    expect(useAppStore.getState().settingsSearchQuery).toBe('f');
  });

  it('关闭键只收起卡片并交还输入焦点，不删除历史', () => {
    seedStore(['theme']);
    renderPanel();
    const input = openSearch();
    fireEvent.click(document.querySelector('.adl-settings-search-history__close') as Element);
    expect(card()).toBeNull();
    expect(useAppStore.getState().settingsSearchHistory).toEqual(['theme']);
    expect(document.activeElement).toBe(input);
  });

  it('收起后重新打开搜索，卡片会回来（已收起状态按搜索会话复位）', () => {
    seedStore(['theme']);
    renderPanel();
    const input = openSearch();
    fireEvent.click(document.querySelector('.adl-settings-search-history__close') as Element);
    expect(card()).toBeNull();
    // 收起搜索（Esc）再重开：复位点是 `searchOpen` 边沿（唯一复位处）。
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.querySelector('#adl-settings-search-input')).toBeNull();
    openSearch();
    expect(card()).not.toBeNull();
  });

  it('卡片内点击非可聚焦区域（标题/留白）不会关掉整个搜索', () => {
    seedStore(['theme']);
    renderPanel();
    const input = openSearch();
    // 卡片内多处不可聚焦：不阻止 mousedown 默认行为时浏览器会先清掉输入框焦点，
    // 触发面板的失焦收起（搜索栏整体消失）。此处断言「默认行为已被阻止」。
    const title = document.querySelector('.adl-settings-search-history__title') as Element;
    const notPrevented = fireEvent.mouseDown(title);
    expect(notPrevented).toBe(false);
    expect(card()).not.toBeNull();
    // 「保住输入框焦点」的另一半意图：preventDefault 后焦点仍在输入框上（activeElement）。
    expect(document.activeElement).toBe(input);
  });

  it('焦点在卡片内按 Escape：只收起卡片，查询与搜索态保留', () => {
    seedStore(['theme']);
    renderPanel();
    const input = openSearch();
    const close = document.querySelector('.adl-settings-search-history__close') as Element;
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(card()).toBeNull();
    expect(document.querySelector('#adl-settings-search-input')).toBe(input);
    expect(useAppStore.getState().settingsSearchQuery).toBe('');
  });

  it('点击卡片与输入框以外即收起卡片（搜索态本身不变）', () => {
    seedStore(['theme']);
    renderPanel();
    openSearch();
    expect(card()).not.toBeNull();
    fireEvent.pointerDown(document.body);
    expect(card()).toBeNull();
  });

  it('点击搜索结果时把当前查询记入历史（去重置顶）', () => {
    seedStore(['font']);
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsSearchLabel' }));
    const input = document.querySelector('#adl-settings-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'maxconcurrent' } });
    fireEvent.click(
      screen.getByRole('button', {
        name: (name) => name.replace(/\s+/g, '').toLowerCase() === 'maxconcurrentworkspaces',
      }),
    );
    expect(useAppStore.getState().settingsSearchHistory).toEqual(['maxconcurrent', 'font']);
  });

  it('历史去重：已在其中的查询被提到首位而非追加副本', () => {
    seedStore(['font', 'maxconcurrent']);
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsSearchLabel' }));
    const input = document.querySelector('#adl-settings-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'maxconcurrent' } });
    fireEvent.click(
      screen.getByRole('button', {
        name: (name) => name.replace(/\s+/g, '').toLowerCase() === 'maxconcurrentworkspaces',
      }),
    );
    expect(useAppStore.getState().settingsSearchHistory).toEqual(['maxconcurrent', 'font']);
  });
});
