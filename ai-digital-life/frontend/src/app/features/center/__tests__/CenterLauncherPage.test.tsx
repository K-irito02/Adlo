import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CenterLauncherPage } from '../CenterLauncherPage';
import { CenterPane } from '@regions/CenterPane';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n/types';

// 版本管理卡片 `DshVersionManagement`（挂载即走 dsh 桥），
// 本套件只验证 launcher 的三入口与 dsh 标签行为，故隔离该卡片；版本管理由 dsh 套件覆盖。
vi.mock('@features/dsh/DshVersionManagement', () => ({
  DshVersionManagement: () => null,
}));

const t = {
  dshTitle: 'DeepSeek Harness',
  centerLauncherOpenDsh: '打开 dsh',
  centerLauncherOpenBrowser: '打开浏览器欢迎页',
  centerLauncherOpenTerminal: '打开终端欢迎页',
} as unknown as CopyDict;

function renderLauncher(centerTabId = 'c1') {
  return render(
    <TCopyProvider t={t} locale="zh-CN">
      <CenterLauncherPage centerTabId={centerTabId} />
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
  });
});

afterEach(() => {
  (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
  vi.clearAllMocks();
});

describe('CenterLauncherPage', () => {
  it('渲染三个入口', () => {
    renderLauncher();
    expect(screen.getByRole('button', { name: /dsh/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /浏览器/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /终端/ })).toBeTruthy();
  });

  it('点击「打开浏览器欢迎页」就地转换当前 launcher 为浏览器中心标签', () => {
    renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: /浏览器/ }));

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

  it('点击「打开终端欢迎页」就地转换为终端选择器', () => {
    renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: /终端/ }));

    const center = useAppStore.getState().centerTabs.find((c) => c.id === 'c1');
    expect(center).toMatchObject({ kind: 'terminal', refId: null });
  });

  it('点击「打开 dsh」成功后移除 launcher 标签（显示新建的 dsh 浏览器中心标签）', async () => {
    const open = vi.fn(async () => ({
      ok: true,
      data: { url: 'http://127.0.0.1:3080', freedPort: false },
    }));
    (window as unknown as { digitalLife: unknown }).digitalLife = { dsh: { open } };

    renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: /dsh/i }));

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
});

describe('CenterPane 调度', () => {
  it('centerTabs 为空时渲染 launcher 并补齐一个 launcher 标签（首启不变量）', () => {
    useAppStore.setState({ centerTabs: [], centerActiveTabId: '', isOpen: false });

    render(
      <TCopyProvider t={t} locale="zh-CN">
        <CenterPane />
      </TCopyProvider>,
    );

    expect(screen.getByRole('button', { name: /dsh/i })).toBeTruthy();
    const s = useAppStore.getState();
    expect(s.centerTabs).toHaveLength(1);
    expect(s.centerTabs[0].kind).toBe('launcher');
    expect(s.centerActiveTabId).toBe(s.centerTabs[0].id);
  });
});
