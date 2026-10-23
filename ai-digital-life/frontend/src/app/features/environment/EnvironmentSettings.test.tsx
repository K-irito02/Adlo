import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import { EnvironmentSettings } from './EnvironmentSettings';
import { resetEnvSettingsCache } from './envStatusCache';
import type { EnvDependencyState, EnvStatus } from '../../../shared/ipc/env';
import { openUrlByMethod } from '@features/preview/openByMethod';
import { environmentZh } from '@i18n/zh-CN/environment';

vi.mock('@features/preview/openByMethod', () => ({
  openUrlByMethod: vi.fn(),
}));

const fetchEnvStatus = vi.fn();
const selectEnvSource = vi.fn();
const installEnvDep = vi.fn();
const uninstallEnvDep = vi.fn();
const setEnvCustomPath = vi.fn();
const recheckEnv = vi.fn();
const pollEnvTaskWhileRunning = vi.fn((): (() => void) => () => {});

vi.mock('@hooks/useAppActions', () => {
  // 单例对象：保持 useAppActions 返回引用稳定（真实实现经 useShallow 也稳定），
  // 否则组件挂载 effect 依赖 [actions] 会在每次重渲染时重复拉取环境状态。
  const actions = {
    fetchEnvStatus: (...args: unknown[]) => fetchEnvStatus(...args),
    selectEnvSource: (...args: unknown[]) => selectEnvSource(...args),
    installEnvDep: (...args: unknown[]) => installEnvDep(...args),
    uninstallEnvDep: (...args: unknown[]) => uninstallEnvDep(...args),
    setEnvCustomPath: (...args: unknown[]) => setEnvCustomPath(...args),
    recheckEnv: (...args: unknown[]) => recheckEnv(...args),
    pollEnvTaskWhileRunning: () => pollEnvTaskWhileRunning(),
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

/** 七段 fixture：node 缺失（测安装），其余就绪，bash 为系统来源（测三选一）。 */
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
      installedVersion: '5.2.21',
      baselineVersion: '5.2.21',
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
      origin: 'bundled',
      installedVersion: '0.1.0',
      baselineVersion: '0.1.0',
      path: 'C:/hosted/adlserver/adl-server.exe',
    }),
    netprobe: { registryOk: true, registryLatencyMs: 12, ciTokenConfigured: false },
    task: null,
    dshReady: false,
  };
}

const writeText = vi.fn();

function seedStore(patch: Record<string, unknown> = {}) {
  useAppStore.setState({
    envStatus: null,
    envBusy: false,
    isTauri: true,
    toasts: [],
    environmentGroupResetPending: false,
    envWizardDone: false,
    envWizardSkippedAt: null,
    ...patch,
  } as unknown as Parameters<typeof useAppStore.setState>[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetEnvSettingsCache();
  seedStore();
  Object.assign(navigator, { clipboard: { writeText } });
  writeText.mockResolvedValue(undefined);
  fetchEnvStatus.mockImplementation(async () => {
    useAppStore.setState({ envStatus: fixture() });
    return true;
  });
  selectEnvSource.mockResolvedValue(true);
  installEnvDep.mockResolvedValue(true);
  uninstallEnvDep.mockResolvedValue(true);
  setEnvCustomPath.mockResolvedValue(true);
  recheckEnv.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
});

function renderSettings() {
  return render(
    <TestProvider>
      <EnvironmentSettings />
    </TestProvider>,
  );
}

async function renderWithRows() {
  const result = renderSettings();
  // 首屏即拉取：mock 的 fetchEnvStatus 同步写 store，行随后渲染。
  await waitFor(() => {
    expect(fetchEnvStatus).toHaveBeenCalled();
  });
  for (const dep of [
    'environmentDepNode',
    'environmentDepGit',
    'environmentDepBash',
    'environmentDepWebview2',
    'environmentDepAdlserver',
    'environmentDepNet',
    'environmentDepModel',
  ]) {
    await waitFor(() => {
      expect(screen.getByText(dep)).not.toBeNull();
    });
  }
  expect(pollEnvTaskWhileRunning).toHaveBeenCalled();
  return result;
}

describe('EnvironmentSettings', () => {
  it('挂载拉取状态并渲染七依赖行 + 聚合条', async () => {
    await renderWithRows();
    // 聚合条：就绪计数 + 重测 + 复制全部。
    expect(screen.getByText('environmentAggregateReady')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'environmentRecheck' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'environmentCopyAllForAgent' })).not.toBeNull();
  });

  it('Bash 系统模式下展示只读归属文本（非可交互三选一）', async () => {
    const { container } = await renderWithRows();
    const bash = container.querySelector('[data-testid="env-dep-bash"]')!;
    // 诚实非交互：无 radiogroup/radio 控件，只读归属文本。
    expect(bash.querySelector('[role="radiogroup"]')).toBeNull();
    expect(bash.querySelector('input[type="radio"]')).toBeNull();
    expect(within(bash as HTMLElement).getByText('environmentBashVariantNote')).not.toBeNull();
  });

  it('模型行无状态灯，只有去 dsh 侧配置引导', async () => {
    const { container } = await renderWithRows();
    const model = container.querySelector('[data-testid="env-dep-model"]') as HTMLElement;
    // 红绿灯（状态 pill）绝不出现在模型行。
    expect(model.querySelector('.adl-settings-status')).toBeNull();
    expect(within(model).getByRole('button', { name: 'environmentGoToSettings' })).not.toBeNull();
  });

  it('复制按钮把诊断 JSON 写剪贴板（payload 含 dep 与 statusJson）', async () => {
    const { container } = await renderWithRows();
    const node = container.querySelector('[data-testid="env-dep-node"]') as HTMLElement;
    fireEvent.click(within(node).getByRole('button', { name: 'environmentCopyForAgentNote' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const payload = JSON.parse(writeText.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(payload.dep).toBe('node');
    expect(typeof payload.statusJson).toBe('string');
    const section = JSON.parse(payload.statusJson as string) as { baselineVersion: string };
    expect(section.baselineVersion).toBe('22.0.0');
    expect(payload.baseline).toBe('22.0.0');
    expect(payload.copyContext).toBeTruthy();
    // Phase 3：载荷附带匹配 runbook 全文（未就绪项必须有可执行指引）。
    expect(typeof payload.runbook).toBe('string');
    expect(payload.runbook as string).toContain('## 症状');
    expect(payload.runbook as string).toContain('## 检测命令');
  });

  it('来源切换调用 selectEnvSource', async () => {
    const { container } = await renderWithRows();
    const node = container.querySelector('[data-testid="env-dep-node"]') as HTMLElement;
    fireEvent.click(within(node).getByLabelText('environmentSwitch'));
    fireEvent.click(screen.getByRole('option', { name: 'environmentSourceSystem' }));
    await waitFor(() => {
      expect(selectEnvSource).toHaveBeenCalledWith('node', 'system');
    });
  });

  it('安装按钮走 ConfirmDialog 确认后调用 installEnvDep', async () => {
    const { container } = await renderWithRows();
    const node = container.querySelector('[data-testid="env-dep-node"]') as HTMLElement;
    fireEvent.click(within(node).getByRole('button', { name: 'environmentInstall' }));
    // 确认态两段点击：首击只弹框，不调安装。
    expect(installEnvDep).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(installEnvDep).toHaveBeenCalledWith('node');
    });
  });

  it('卸载/重装按钮只在宿主来源且已安装的行出现', async () => {
    const { container } = await renderWithRows();
    const git = container.querySelector('[data-testid="env-dep-git"]') as HTMLElement;
    expect(within(git).getByRole('button', { name: 'environmentUninstall' })).not.toBeNull();
    expect(within(git).getByRole('button', { name: 'environmentReinstall' })).not.toBeNull();
    // 系统来源行（bash）与缺失行（node）不得出现。
    const bash = container.querySelector('[data-testid="env-dep-bash"]') as HTMLElement;
    expect(within(bash).queryByRole('button', { name: 'environmentUninstall' })).toBeNull();
    expect(within(bash).queryByRole('button', { name: 'environmentReinstall' })).toBeNull();
    const node = container.querySelector('[data-testid="env-dep-node"]') as HTMLElement;
    expect(within(node).queryByRole('button', { name: 'environmentUninstall' })).toBeNull();
    // 非安装类托管行（adlserver）同样不在可卸载白名单内。
    const adlserver = container.querySelector('[data-testid="env-dep-adlserver"]') as HTMLElement;
    expect(within(adlserver).queryByRole('button', { name: 'environmentUninstall' })).toBeNull();
  });

  it('卸载走两段确认：首击武装（不调用），再击执行一次', async () => {
    const { container } = await renderWithRows();
    const git = container.querySelector('[data-testid="env-dep-git"]') as HTMLElement;
    const uninstall = within(git).getByRole('button', { name: 'environmentUninstall' });
    fireEvent.click(uninstall);
    expect(uninstallEnvDep).not.toHaveBeenCalled();
    expect((uninstall as HTMLButtonElement).className).toContain('danger');
    fireEvent.click(uninstall);
    await waitFor(() => {
      expect(uninstallEnvDep).toHaveBeenCalledTimes(1);
    });
    expect(uninstallEnvDep).toHaveBeenCalledWith('git', '2.52.0');
  });

  it('重装复用 installEnvDep 且传入当前已装版本', async () => {
    const { container } = await renderWithRows();
    const git = container.querySelector('[data-testid="env-dep-git"]') as HTMLElement;
    fireEvent.click(within(git).getByRole('button', { name: 'environmentReinstall' }));
    await waitFor(() => {
      expect(installEnvDep).toHaveBeenCalledWith('git', '2.52.0');
    });
  });

  it('失败任务残留 error task 不阻塞行：安装按钮可见且无进行中扫光', async () => {
    const status = fixture();
    status.task = {
      kind: 'env-node-install',
      version: '24.22.1',
      phase: 'installing',
      percent: null,
      done: 0,
      total: 0,
      cancellable: true,
      error: 'download failed',
    };
    // 不覆盖 seed 的状态：模拟 remount 后后端快照仍带 error task。
    fetchEnvStatus.mockImplementation(async () => true);
    seedStore({ envStatus: status });
    const { container } = await renderWithRows();
    const node = container.querySelector('[data-testid="env-dep-node"]') as HTMLElement;
    expect(within(node).getByRole('button', { name: 'environmentInstall' })).not.toBeNull();
    expect(node.textContent).not.toContain('environmentTaskPhaseInstalling');
  });

  it('busy 时行内安装/卸载/重装按钮全部禁用', async () => {
    fetchEnvStatus.mockImplementation(async () => true);
    seedStore({ envBusy: true, envStatus: fixture() });
    const { container } = await renderWithRows();
    const node = container.querySelector('[data-testid="env-dep-node"]') as HTMLElement;
    expect(
      (within(node).getByRole('button', { name: 'environmentInstall' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    const git = container.querySelector('[data-testid="env-dep-git"]') as HTMLElement;
    expect(
      (within(git).getByRole('button', { name: 'environmentUninstall' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (within(git).getByRole('button', { name: 'environmentReinstall' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('聚合条重测调 recheckEnv，复制全部写整包 JSON', async () => {
    await renderWithRows();
    fireEvent.click(screen.getByRole('button', { name: 'environmentRecheck' }));
    await waitFor(() => {
      expect(recheckEnv).toHaveBeenCalledWith();
    });
    fireEvent.click(screen.getByRole('button', { name: 'environmentCopyAllForAgent' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const payload = JSON.parse(writeText.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(payload.dep).toBe('all');
    expect(typeof payload.statusJson).toBe('string');
    // fixture 里 node 未就绪 → 全量载荷只带未就绪项 runbook。
    expect(typeof payload.runbook).toBe('string');
    const runbook = payload.runbook as string;
    expect(runbook).toContain('## 症状');
    expect(runbook).toContain('Node.js');
    // 就绪项（git/bash/webview2/adlserver/net）的 runbook 不得混入。
    expect(runbook).not.toContain('（env-git-bash）');
    expect(runbook).not.toContain('（env-webview2）');
    expect(runbook).not.toContain('（env-adlserver）');
    expect(runbook).not.toContain('（env-net-download）');
    // 模型行无可检测就绪信号，不参与 all 聚合。
    expect(runbook).not.toContain('（env-model-credential）');
  });

  it('全量载荷：Git 与 Bash 同时未就绪时共用 runbook 只出现一次', async () => {
    const status = fixture();
    status.node = depState({
      mode: 'auto',
      effective: 'host',
      installedVersion: '22.0.0',
      baselineVersion: '22.0.0',
      meetsBaseline: true,
      path: 'C:/hosted/node/22.0.0/node.exe',
    });
    status.git = depState({
      effective: 'none',
      installedVersion: null,
      baselineVersion: '2.52.0',
      meetsBaseline: false,
      path: null,
    });
    status.bash = depState({
      effective: 'none',
      installedVersion: null,
      baselineVersion: '5.2.21',
      meetsBaseline: false,
      path: null,
    });
    fetchEnvStatus.mockImplementation(async () => {
      useAppStore.setState({ envStatus: status });
      return true;
    });
    seedStore({ envStatus: status });
    await renderWithRows();
    fireEvent.click(screen.getByRole('button', { name: 'environmentCopyAllForAgent' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const payload = JSON.parse(writeText.mock.calls[0][0] as string) as Record<string, unknown>;
    const runbook = payload.runbook as string;
    expect(runbook).toContain('（env-git-bash）');
    // git 与 bash 共用一份 → 全文只出现一次。
    expect(runbook.split('（env-git-bash）')).toHaveLength(2);
    // 就绪的 node 不入载荷；模型行不参与 all 聚合。
    expect(runbook).not.toContain('（env-node）');
    expect(runbook).not.toContain('（env-model-credential）');
  });

  it('全量载荷：所有可检测项就绪时 runbook 为 null', async () => {
    const ready = fixture();
    ready.node = depState({
      mode: 'auto',
      effective: 'host',
      installedVersion: '22.0.0',
      baselineVersion: '22.0.0',
      meetsBaseline: true,
      path: 'C:/hosted/node/22.0.0/node.exe',
    });
    fetchEnvStatus.mockImplementation(async () => {
      useAppStore.setState({ envStatus: ready });
      return true;
    });
    seedStore({ envStatus: ready });
    await renderWithRows();
    fireEvent.click(screen.getByRole('button', { name: 'environmentCopyAllForAgent' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const payload = JSON.parse(writeText.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(payload.dep).toBe('all');
    expect(payload.runbook).toBeNull();
  });

  it('组级重置 pending 打开确认框，确认后来源回自动并清空手动路径', async () => {
    fetchEnvStatus.mockImplementation(async () => {
      const status = fixture();
      status.node = depState({
        mode: 'system',
        effective: 'system',
        installedVersion: '22.0.0',
        baselineVersion: '22.0.0',
        meetsBaseline: true,
        path: 'C:/custom/node.exe',
        customPath: 'C:/custom/node.exe',
      });
      useAppStore.setState({ envStatus: status });
      return true;
    });
    seedStore({ environmentGroupResetPending: true });
    await renderWithRows();
    expect(screen.getByRole('dialog')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(selectEnvSource).toHaveBeenCalledWith('node', 'auto');
    });
    expect(setEnvCustomPath).toHaveBeenCalledWith('node', '');
    expect(recheckEnv).toHaveBeenCalledWith();
    expect(openUrlByMethod).not.toHaveBeenCalled();
  });

  it('聚合条就绪计数只计可检测项（模型引导行不计入）', async () => {
    // fixture：node 缺失 + 其余四依赖就绪 + 注册表通 = 5/6。
    const hybridT = new Proxy({} as Record<string, string>, {
      get: (_, key) =>
        typeof key === 'string' ? ((environmentZh as Record<string, string>)[key] ?? key) : '',
    }) as unknown as CopyDict;
    seedStore({ envStatus: fixture() });
    render(
      <TCopyProvider t={hybridT} locale="zh-CN">
        <EnvironmentSettings />
      </TCopyProvider>,
    );
    expect(await screen.findByText('5/6 就绪')).not.toBeNull();
  });

  it('浏览器模式：系统级行变更控件置灰并追加仅桌面说明', async () => {
    seedStore({ isTauri: false, envStatus: fixture() });
    const { container } = renderSettings();
    const node = (await waitFor(() => {
      const el = container.querySelector('[data-testid="env-dep-node"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    })) as HTMLElement;
    expect(
      (within(node).getByRole('button', { name: 'environmentInstall' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(node.textContent).toContain('settingsAgentDesktopOnlyHint');
    const git = container.querySelector('[data-testid="env-dep-git"]') as HTMLElement;
    expect(
      (within(git).getByRole('button', { name: 'environmentUninstall' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (within(git).getByRole('button', { name: 'environmentReinstall' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(git.textContent).toContain('settingsAgentDesktopOnlyHint');
  });

  it('resume 横幅：skippedAt + 未就绪 → 显示 N 项，继续向导置回 done=false', async () => {
    // fixture：node 缺失 + 其余就绪 + 注册表通 = 1 项未就绪。
    const hybridT = new Proxy({} as Record<string, string>, {
      get: (_, key) =>
        typeof key === 'string' ? ((environmentZh as Record<string, string>)[key] ?? key) : '',
    }) as unknown as CopyDict;
    seedStore({ envStatus: fixture(), envWizardDone: true, envWizardSkippedAt: 123 });
    render(
      <TCopyProvider t={hybridT} locale="zh-CN">
        <EnvironmentSettings />
      </TCopyProvider>,
    );
    expect(await screen.findByText('上次跳过了 1 项')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '继续向导' }));
    expect(useAppStore.getState().envWizardDone).toBe(false);
  });

  it('resume 横幅：skippedAt + 全就绪 → 不显示', async () => {
    const ready = fixture();
    ready.node = depState({
      mode: 'auto',
      effective: 'host',
      installedVersion: '22.0.0',
      baselineVersion: '22.0.0',
      meetsBaseline: true,
      path: 'C:/hosted/node/22.0.0/node.exe',
    });
    fetchEnvStatus.mockImplementation(async () => {
      useAppStore.setState({ envStatus: ready });
      return true;
    });
    seedStore({ envWizardSkippedAt: 123 });
    const { container } = renderSettings();
    await waitFor(() => {
      expect(screen.getByTestId('env-aggregate')).not.toBeNull();
    });
    expect(container.querySelector('[data-testid="env-wizard-resume"]')).toBeNull();
  });
});
