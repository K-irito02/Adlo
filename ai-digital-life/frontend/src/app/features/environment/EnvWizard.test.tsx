import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import { EnvWizard } from './EnvWizard';
import type { EnvDependencyState, EnvStatus } from '../../../shared/ipc/env';
import { openUrlByMethod } from '@features/preview/openByMethod';

vi.mock('@features/preview/openByMethod', () => ({
  openUrlByMethod: vi.fn(),
}));

const fetchEnvStatus = vi.fn();
const selectEnvSource = vi.fn();
const installEnvDep = vi.fn();
const setEnvCustomPath = vi.fn();
const recheckEnv = vi.fn();

vi.mock('@hooks/useAppActions', () => {
  // 单例对象：保持 useAppActions 返回引用稳定，避免 detecting effect 重复拉取。
  const actions = {
    fetchEnvStatus: (...args: unknown[]) => fetchEnvStatus(...args),
    selectEnvSource: (...args: unknown[]) => selectEnvSource(...args),
    installEnvDep: (...args: unknown[]) => installEnvDep(...args),
    setEnvCustomPath: (...args: unknown[]) => setEnvCustomPath(...args),
    recheckEnv: (...args: unknown[]) => recheckEnv(...args),
  };
  return { useAppActions: () => actions };
});

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT} locale="zh-CN">
      {children}
    </TCopyProvider>
  );
}

function depState(patch: Partial<EnvDependencyState> = {}): EnvDependencyState {
  return {
    mode: 'auto',
    effective: 'host',
    origin: 'path',
    installedVersion: '1.0.0',
    baselineVersion: '1.0.0',
    meetsBaseline: true,
    path: 'C:/hosted/1.0.0/bin.exe',
    ...patch,
  };
}

/** 七段 fixture：node 缺失（测安装），其余就绪。 */
function fixture(): EnvStatus {
  return {
    node: depState({
      mode: 'auto',
      effective: 'none',
      origin: 'path',
      installedVersion: null,
      baselineVersion: '22.0.0',
      meetsBaseline: false,
      path: null,
    }),
    git: depState({
      installedVersion: '2.52.0',
      baselineVersion: '2.52.0',
      path: 'C:/hosted/git/2.52.0/cmd/git.exe',
    }),
    bash: depState({
      mode: 'system',
      effective: 'system',
      installedVersion: null,
      baselineVersion: '',
      meetsBaseline: true,
      path: 'C:/Program Files/Git/bin/bash.exe',
    }),
    webview2: {
      mode: 'auto',
      effective: 'system',
      origin: 'registry',
      installedVersion: '140.0.3485.94',
      baselineVersion: '140.0.0.0',
      meetsBaseline: true,
      path: null,
    },
    adlserver: depState({
      effective: 'system',
      origin: 'bundled',
      installedVersion: null,
      baselineVersion: '',
      meetsBaseline: true,
      path: 'C:/hosted/adlserver/adl-server.exe',
    }),
    netprobe: { registryOk: true, registryLatencyMs: 12, ciTokenConfigured: false },
    task: null,
    dataDir: 'C:/data-root',
    dshReady: false,
  };
}

function allReadyFixture(): EnvStatus {
  const status = fixture();
  status.node = depState({
    mode: 'auto',
    effective: 'host',
    installedVersion: '22.0.0',
    baselineVersion: '22.0.0',
    meetsBaseline: true,
    path: 'C:/hosted/node/22.0.0/node.exe',
  });
  return status;
}

function seedStore(patch: Record<string, unknown> = {}) {
  useAppStore.setState({
    envWizardDone: false,
    envWizardSkippedAt: null,
    envStatus: null,
    envBusy: false,
    isTauri: true,
    toasts: [],
    ...patch,
  } as unknown as Parameters<typeof useAppStore.setState>[0]);
}

const writeText = vi.fn();
const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  seedStore();
  Object.assign(navigator, { clipboard: { writeText } });
  writeText.mockResolvedValue(undefined);
  fetchEnvStatus.mockResolvedValue(true);
  selectEnvSource.mockResolvedValue(true);
  installEnvDep.mockResolvedValue(true);
  setEnvCustomPath.mockResolvedValue(true);
  recheckEnv.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
});

function renderWizard() {
  return render(
    <TestProvider>
      <EnvWizard onClose={onClose} />
    </TestProvider>,
  );
}

/** 欢迎步点确认 → detecting 拉取一次 → 落到逐项卡片。 */
async function renderWizardAtItems(status: EnvStatus) {
  seedStore({ envStatus: status });
  const result = renderWizard();
  expect(screen.getByText('environmentWizardWelcome')).not.toBeNull();
  expect(fetchEnvStatus).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
  await waitFor(() => {
    expect(fetchEnvStatus).toHaveBeenCalledTimes(1);
  });
  await waitFor(() => {
    expect(screen.getByTestId('env-dep-node')).not.toBeNull();
  });
  return result;
}

describe('EnvWizard', () => {
  it('envWizardDone=false + 有缺项 → 渲染欢迎步', () => {
    seedStore({ envStatus: fixture() });
    renderWizard();
    expect(screen.getByText('environmentWizardWelcome')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'environmentWizardSkip' })).not.toBeNull();
  });

  it('点跳过 → envWizardDone=true + skippedAt 非空', () => {
    seedStore({ envStatus: fixture() });
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'environmentWizardSkip' }));
    expect(useAppStore.getState().envWizardDone).toBe(true);
    expect(useAppStore.getState().envWizardSkippedAt).not.toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('跳过→继续→完成：skippedAt 被清空，横幅不再认领', async () => {
    await renderWizardAtItems(fixture());
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'environmentWizardEnter' })).not.toBeNull();
    });
    useAppStore.setState({ envWizardSkippedAt: 123456 } as unknown as Parameters<
      typeof useAppStore.setState
    >[0]);
    fireEvent.click(screen.getByRole('button', { name: 'environmentWizardEnter' }));
    expect(useAppStore.getState().envWizardDone).toBe(true);
    expect(useAppStore.getState().envWizardSkippedAt).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('全就绪 → 不渲染（返回 null）', () => {
    seedStore({ envStatus: allReadyFixture() });
    const { container } = renderWizard();
    expect(container.innerHTML).toBe('');
  });

  it('断网 fixture → 安装按钮被复制按钮替代', async () => {
    const offline = fixture();
    offline.netprobe = { registryOk: false, registryLatencyMs: 0, ciTokenConfigured: false };
    await renderWizardAtItems(offline);
    // 向导经 portal 挂 document.body，行查询走 screen。
    const node = screen.getByTestId('env-dep-node') as HTMLElement;
    expect(within(node).queryByRole('button', { name: 'environmentInstall' })).toBeNull();
    expect(within(node).getByRole('button', { name: 'environmentCopyForAgent' })).not.toBeNull();
    expect(openUrlByMethod).not.toHaveBeenCalled();
  });
});
