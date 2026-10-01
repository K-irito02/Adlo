import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CenterLauncherPage } from '../CenterLauncherPage';
import { CenterPane } from '@regions/CenterPane';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n/types';

// 版本管理卡片复用 `WelcomePage` 的 `DshVersionManagement`（挂载即走 dsh 桥），
// 本套件只验证 launcher 的三入口与就地转换，故隔离该卡片；版本管理由 dsh 套件覆盖。
vi.mock('@features/dsh/WelcomePage', () => ({
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
  });

  it('点击「打开终端欢迎页」就地转换为终端选择器', () => {
    renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: /终端/ }));

    const center = useAppStore.getState().centerTabs.find((c) => c.id === 'c1');
    expect(center).toMatchObject({ kind: 'terminal', refId: null });
  });

  it('点击「打开 dsh」调用 openDsh 且不转换标签（过渡态）', async () => {
    const open = vi.fn(async () => ({ ok: true, data: { url: null, freedPort: false } }));
    (window as unknown as { digitalLife: unknown }).digitalLife = { dsh: { open } };

    renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: /dsh/i }));

    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const center = useAppStore.getState().centerTabs.find((c) => c.id === 'c1');
    expect(center?.kind).toBe('launcher');
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
