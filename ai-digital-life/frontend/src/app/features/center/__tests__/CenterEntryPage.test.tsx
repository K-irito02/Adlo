import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CenterEntryPage } from '../CenterEntryPage';
import { CenterPane } from '@regions/CenterPane';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n/types';

// 新建入口页只渲染三入口（dsh 版本管理已移入设置面板「DSH」组）。

const t = {
  centerLauncherLabel: '中心入口页',
  centerContentLabel: '中心内容区',
  centerBrowserTabMissing: '浏览器标签不可用',
  centerLauncherOpenDsh: '打开 deepseek harness',
  centerLauncherOpenBrowser: '打开浏览器',
  centerLauncherOpenTerminal: '打开终端',
  dshPortFreed: '端口已释放并重新启动',
  dshOpenFailed: '打开失败',
} as unknown as CopyDict;

function renderLauncher(centerTabId = 'c1') {
  return render(
    <TCopyProvider t={t} locale="zh-CN">
      <CenterEntryPage centerTabId={centerTabId} />
    </TCopyProvider>,
  );
}

beforeEach(() => {
  useAppStore.setState({
    centerTabs: [{ id: 'c1', kind: 'launcher', refId: null, createdAt: 1 }],
    centerActiveTabId: 'c1',
    browserTabs: [],
    browserTabsById: {},
    browserActiveTabId: '',
    isOpen: false,
    errorToasts: [],
    toasts: [],
  });
});

afterEach(() => {
  (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
  vi.clearAllMocks();
});

describe('CenterEntryPage', () => {
  it('渲染三个入口', () => {
    renderLauncher();
    expect(screen.getByRole('button', { name: /deepseek harness/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: '打开浏览器' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '打开终端' })).toBeTruthy();
  });

  it('三入口按钮带图标（图标 + 名称）', () => {
    renderLauncher();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button.querySelector('svg')).toBeTruthy();
    }
  });

  it('渲染带 aria-label 的 section 地标', () => {
    renderLauncher();
    expect(screen.getByRole('region', { name: '中心入口页' })).toBeTruthy();
  });

  it('点击「打开浏览器」就地转换当前 launcher 为浏览器中心标签', () => {
    renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: '打开浏览器' }));

    const s = useAppStore.getState();
    const center = s.centerTabs.find((c) => c.id === 'c1');
    expect(center?.kind).toBe('browser');
    expect(center?.refId).toBeTruthy();
    // 不新增中心标签；浏览器标签被移动到中心。
    expect(s.centerTabs).toHaveLength(1);
    expect(s.browserTabsById[center?.refId ?? '']?.location).toBe('center');
    // 面板活动标签被重夹：不再指向已转中心的标签（否则面板会双挂载同一标签）。
    expect(s.browserActiveTabId).not.toBe(center?.refId);
  });

  it('点击「打开终端」就地转换为终端选择器', () => {
    renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: '打开终端' }));

    const center = useAppStore.getState().centerTabs.find((c) => c.id === 'c1');
    expect(center).toMatchObject({ kind: 'terminal', refId: null });
  });

  it('点击「打开 deepseek harness」成功后移除 launcher 标签（显示新建的 dsh 浏览器中心标签）', async () => {
    const open = vi.fn(async () => ({
      ok: true,
      data: { url: 'http://127.0.0.1:3080', freedPort: false },
    }));
    (window as unknown as { digitalLife: unknown }).digitalLife = { dsh: { open } };

    renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: /deepseek harness/i }));

    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    // launcher 标签在 openDsh 成功后被异步移除；等待该状态落地再做断言。
    await vi.waitFor(() =>
      expect(useAppStore.getState().centerTabs.some((c) => c.id === 'c1')).toBe(false),
    );
    const s = useAppStore.getState();
    // 新建的 dsh 浏览器标签带 isDsh 且位于中心。
    const dshTab = s.browserTabs.find((tab) => tab.isDsh);
    expect(dshTab).toBeTruthy();
    expect(dshTab?.location).toBe('center');
    expect(s.centerTabs.some((c) => c.kind === 'browser' && c.refId === dshTab?.id)).toBe(true);
  });

  it('freedPort=true 时报 DSH_FREED_PORT 信息卡并移除入口页标签', async () => {
    const open = vi.fn(async () => ({
      ok: true,
      data: { url: 'http://127.0.0.1:3080', freedPort: true },
    }));
    (window as unknown as { digitalLife: unknown }).digitalLife = { dsh: { open } };

    renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: /deepseek harness/i }));

    await vi.waitFor(() => {
      expect(
        useAppStore
          .getState()
          .errorToasts.some((e) => e.code === 'DSH_FREED_PORT' && e.scope === 'dsh'),
      ).toBe(true);
    });
    await vi.waitFor(() =>
      expect(useAppStore.getState().centerTabs.some((c) => c.id === 'c1')).toBe(false),
    );
  });

  it('openDsh 失败（返回 null）时保留入口页标签', async () => {
    const open = vi.fn(async () => ({ ok: false, error: { code: 'X', message: 'fail' } }));
    (window as unknown as { digitalLife: unknown }).digitalLife = { dsh: { open } };

    renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: /deepseek harness/i }));

    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    // 失败分支不创建标签、不移除入口页（等微任务排空后断言）。
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useAppStore.getState().centerTabs.some((c) => c.id === 'c1')).toBe(true);
    expect(useAppStore.getState().browserTabs).toHaveLength(0);
  });

  it('openDsh 抛异常时弹出「打开失败」提示', async () => {
    const open = vi.fn(async () => {
      throw new Error('boom');
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = { dsh: { open } };
    const showToast = vi.fn();
    useAppStore.setState({ showToast });

    renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: /deepseek harness/i }));

    await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith('打开失败', 'error'));
  });
});

describe('CenterPane 调度', () => {
  it('centerTabs 为空时渲染 launcher 并补齐一个 launcher 标签（首启不变量）', () => {
    useAppStore.setState({ centerTabs: [], centerActiveTabId: '', isOpen: false });

    render(
      <TCopyProvider t={t} locale="zh-CN">
        <CenterPane />
      </TCopyProvider>,
    );

    expect(screen.getByRole('button', { name: /deepseek harness/i })).toBeTruthy();
    const s = useAppStore.getState();
    expect(s.centerTabs).toHaveLength(1);
    expect(s.centerTabs[0].kind).toBe('launcher');
    expect(s.centerActiveTabId).toBe(s.centerTabs[0].id);
  });

  it('内容区地标用专用 centerContentLabel（不复用标签条标签）', () => {
    useAppStore.setState({
      centerTabs: [{ id: 'c1', kind: 'launcher', refId: null, createdAt: 1 }],
      centerActiveTabId: 'c1',
      isOpen: false,
    });

    render(
      <TCopyProvider t={t} locale="zh-CN">
        <CenterPane />
      </TCopyProvider>,
    );

    expect(screen.getByRole('region', { name: '中心内容区' })).toBeTruthy();
  });

  it('centerActiveTabId 悬空时用 centerSelectTab(首个) 修复 store', () => {
    useAppStore.setState({
      centerTabs: [
        { id: 'c1', kind: 'launcher', refId: null, createdAt: 1 },
        { id: 'c2', kind: 'launcher', refId: null, createdAt: 2 },
      ],
      centerActiveTabId: 'gone',
      isOpen: false,
    });

    render(
      <TCopyProvider t={t} locale="zh-CN">
        <CenterPane />
      </TCopyProvider>,
    );

    // 修复 effect 把活动标签指向首个，而不是静默渲染首个。
    expect(useAppStore.getState().centerActiveTabId).toBe('c1');
    expect(screen.getByRole('button', { name: /deepseek harness/i })).toBeTruthy();
  });

  it('browser 中心标签 refId 为空时渲染占位，不渲染空工具栏', () => {
    useAppStore.setState({
      centerTabs: [{ id: 'c1', kind: 'browser', refId: null, createdAt: 1 }],
      centerActiveTabId: 'c1',
      isOpen: false,
    });

    render(
      <TCopyProvider t={t} locale="zh-CN">
        <CenterPane />
      </TCopyProvider>,
    );

    expect(screen.getByText('浏览器标签不可用')).toBeTruthy();
    // 空工具栏的地址栏 input 不得出现。
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
