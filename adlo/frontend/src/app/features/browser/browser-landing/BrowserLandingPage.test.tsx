import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserLandingPage } from './BrowserLandingPage';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n/types';
import type { LocalPort, ShortcutSite } from '@stores/slices/browserSlice';
import type * as TauriShared from '../../../../tauri-bridge/tauri-shared';

const invokeIpc = vi.hoisted(() => vi.fn());
vi.mock('../../../../tauri-bridge/tauri-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof TauriShared>();
  return { ...actual, invokeIpc };
});

const t = {
  browserShortcuts: '快捷站点',
  browserLocalPorts: '本地端口',
  browserAddShortcut: '添加快捷站点',
  browserAddManualPort: '添加端口',
  browserRefreshPorts: '刷新端口',
  browserPortSettings: '端口设置',
  browserCustomBg: '自定义背景',
  centerTabShowInCenter: '在中心显示',
  browserContextCopyLink: '复制链接',
  browserContextCopyPid: '复制PID',
  browserCopyPidNotFound: '未找到占用该端口的进程',
  browserCopyPidUnavailable: '无法获取占用该端口的进程',
  browserCopyFailed: '复制失败',
  browserRename: '重命名',
  browserDelete: '删除',
  browserLabelPort: '重命名端口',
  browserViewDetails: '查看详情',
} as unknown as CopyDict;

const site: ShortcutSite = {
  id: 's1',
  name: 'Example',
  url: 'https://example.com/path',
  sortOrder: 1,
  createdAt: 1,
};

const port: LocalPort = {
  id: 'p1',
  host: 'localhost',
  port: 5173,
  label: 'dev',
  isAutoDiscovered: true,
  healthy: true,
  lastAliveAt: 1,
  sortOrder: 1,
};

const writeText = vi.fn();

function renderLanding() {
  return render(
    <TCopyProvider t={t} locale="zh-CN">
      <BrowserLandingPage t={t} />
    </TCopyProvider>,
  );
}

function openShortcutMenu(container: HTMLElement) {
  const card = container.querySelector('.adl-shortcut-card');
  expect(card).toBeTruthy();
  fireEvent.contextMenu(card!);
}

function openPortMenu(container: HTMLElement) {
  const card = container.querySelector('.adl-local-port-card');
  expect(card).toBeTruthy();
  fireEvent.contextMenu(card!);
}

describe('BrowserLandingPage 右键复制', () => {
  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    invokeIpc.mockReset().mockResolvedValue({ ok: true, data: [] });
    useAppStore.setState({
      browserShortcuts: [],
      browserLocalPorts: [],
      toasts: [],
    });
  });

  afterEach(() => {
    useAppStore.setState({ browserShortcuts: [], browserLocalPorts: [], toasts: [] });
  });

  it('快捷站点右键菜单包含「复制链接」，复制站点保存的 URL', () => {
    useAppStore.setState({ browserShortcuts: [site] });
    const { container } = renderLanding();
    openShortcutMenu(container);

    fireEvent.click(screen.getByRole('menuitem', { name: '复制链接' }));
    expect(writeText).toHaveBeenCalledWith('https://example.com/path');
  });

  it('端口右键菜单包含「复制链接」，复制 host:port 完整地址', () => {
    useAppStore.setState({ browserLocalPorts: [port] });
    const { container } = renderLanding();
    openPortMenu(container);

    fireEvent.click(screen.getByRole('menuitem', { name: '复制链接' }));
    expect(writeText).toHaveBeenCalledWith('http://localhost:5173');
  });

  it('端口右键「复制PID」按端口查询占用进程并复制 PID', async () => {
    useAppStore.setState({ browserLocalPorts: [port] });
    invokeIpc.mockResolvedValue({
      ok: true,
      data: {
        processes: [{ pid: 4321, name: 'node.exe', command: 'node dsh' }],
        processError: null,
      },
    });
    const { container } = renderLanding();
    openPortMenu(container);

    fireEvent.click(screen.getByRole('menuitem', { name: '复制PID' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('4321'));
    expect(invokeIpc).toHaveBeenCalledWith('browser_get_port_details', { port: 5173 });
  });

  it('多个占用进程按换行分隔写入剪贴板', async () => {
    useAppStore.setState({ browserLocalPorts: [port] });
    invokeIpc.mockResolvedValue({
      ok: true,
      data: {
        processes: [
          { pid: 4321, name: 'node.exe', command: 'node a' },
          { pid: 8765, name: 'node.exe', command: 'node b' },
        ],
        processError: null,
      },
    });
    const { container } = renderLanding();
    openPortMenu(container);

    fireEvent.click(screen.getByRole('menuitem', { name: '复制PID' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('4321\n8765'));
  });

  it('端口无占用进程时提示且不写剪贴板', async () => {
    useAppStore.setState({ browserLocalPorts: [port] });
    invokeIpc.mockResolvedValue({ ok: true, data: { processes: [], processError: null } });
    const { container } = renderLanding();
    openPortMenu(container);

    fireEvent.click(screen.getByRole('menuitem', { name: '复制PID' }));
    await waitFor(() =>
      expect(useAppStore.getState().toasts[0]?.message).toBe('未找到占用该端口的进程'),
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it('查询进程失败时提示「无法获取」而不是「未找到」', async () => {
    useAppStore.setState({ browserLocalPorts: [port] });
    invokeIpc.mockResolvedValue({ ok: false, error: { code: 'E_IPC', message: 'boom' } });
    const { container } = renderLanding();
    openPortMenu(container);

    fireEvent.click(screen.getByRole('menuitem', { name: '复制PID' }));
    await waitFor(() =>
      expect(useAppStore.getState().toasts[0]?.message).toBe('无法获取占用该端口的进程'),
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it('后端取进程信息失败（processError）时同样提示「无法获取」', async () => {
    useAppStore.setState({ browserLocalPorts: [port] });
    invokeIpc.mockResolvedValue({
      ok: true,
      data: { processes: [], processError: 'access denied' },
    });
    const { container } = renderLanding();
    openPortMenu(container);

    fireEvent.click(screen.getByRole('menuitem', { name: '复制PID' }));
    await waitFor(() =>
      expect(useAppStore.getState().toasts[0]?.message).toBe('无法获取占用该端口的进程'),
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it('剪贴板写入失败时提示复制失败', async () => {
    useAppStore.setState({ browserShortcuts: [site] });
    writeText.mockRejectedValueOnce(new Error('denied'));
    const { container } = renderLanding();
    openShortcutMenu(container);

    fireEvent.click(screen.getByRole('menuitem', { name: '复制链接' }));
    await waitFor(() => expect(useAppStore.getState().toasts[0]?.message).toBe('复制失败'));
  });
});
