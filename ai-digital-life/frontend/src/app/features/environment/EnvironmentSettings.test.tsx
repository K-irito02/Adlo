import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import { copyTextToClipboard, EnvironmentSettings } from './EnvironmentSettings';
import { buildAgentDiagnostic } from './diagnostic';
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
  get: (_, key) =>
    key === 'settingsRefreshAria' ? 'refresh:{target}' : typeof key === 'string' ? key : '',
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

const writeText = vi.fn();

function clipboardReport(): string {
  return writeText.mock.calls[0]?.[0] as string;
}

/** 报告里的 JSON 代码块（机器可读部分），正文其余内容是 Markdown。 */
function parseReportJson(text: string): Record<string, unknown> {
  const match = /```json\n([\s\S]*?)\n```/.exec(text);
  expect(match, 'diagnostic report must contain a json block').not.toBeNull();
  return JSON.parse(match?.[1] ?? '') as Record<string, unknown>;
}

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
  ]) {
    await waitFor(() => {
      expect(screen.getByText(dep)).not.toBeNull();
    });
  }
  return result;
}

describe('EnvironmentSettings', () => {
  it('挂载拉取状态并渲染五依赖行 + 聚合条', async () => {
    await renderWithRows();
    // 聚合条：就绪计数 + 重测 + 复制全部。
    expect(screen.getByText('environmentAggregateReady')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'environmentRecheck' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'environmentCopyAllForAgent' })).not.toBeNull();
  });

  it('按块头分组（基础依赖/系统组件），网络块已删除', async () => {
    const { container } = await renderWithRows();
    for (const key of ['environmentBlockRuntime', 'environmentBlockSystem']) {
      expect(screen.getByText(key)).not.toBeNull();
    }
    expect(screen.queryByText('environmentBlockNetwork')).toBeNull();
    const node = container.querySelector('[data-testid="env-dep-node"]') as HTMLElement;
    // 指定路径未选中时仅主体行 1 行（切到指定路径才出现输入行，切走保留路径仅隐藏）。
    expect(node.querySelectorAll('.adl-settings-row')).toHaveLength(1);

    // 次级操作下沉为行内链接。
    expect(node.querySelector('.adl-dsh-settings__inline-link')).not.toBeNull();
    const webview2 = container.querySelector('[data-testid="env-dep-webview2"]') as HTMLElement;
    expect(webview2.querySelectorAll('.adl-settings-row')).toHaveLength(1);
    // 块归属与顺序：每张依赖卡内的 env-dep-* 序列必须与 DEP_BLOCKS 一致。
    const depCards = Array.from(container.querySelectorAll('.adl-settings-card'))
      .map((card) =>
        Array.from(card.querySelectorAll('[data-testid^="env-dep-"]')).map((el) =>
          el.getAttribute('data-testid'),
        ),
      )
      .filter((ids) => ids.length > 0);
    expect(depCards).toEqual([
      ['env-dep-node', 'env-dep-git', 'env-dep-bash'],
      ['env-dep-webview2', 'env-dep-adlserver'],
    ]);
    // 网络行与模型行已删除：下载连通归网络组，凭据/模型归 dsh 侧。
    expect(container.querySelector('[data-testid="env-dep-net"]')).toBeNull();
    expect(container.querySelector('[data-testid="env-dep-model"]')).toBeNull();
  });

  it('Bash 系统模式下展示只读归属文本（非可交互三选一）', async () => {
    const { container } = await renderWithRows();
    const bash = container.querySelector('[data-testid="env-dep-bash"]')!;
    // 归属小字已删除（指定路径模式替代）：无 radiogroup/radio，问号提示替代归属说明。
    expect(bash.querySelector('[role="radiogroup"]')).toBeNull();
    expect(bash.querySelector('input[type="radio"]')).toBeNull();
    expect(within(bash as HTMLElement).queryByText('environmentBashVariantNote')).toBeNull();
    expect(bash.querySelector('.adl-icon-button--info')).not.toBeNull();
  });

  it('自动检测行不再在路径行尾重复「来源 自动检测」，显式来源仍保留', async () => {
    const { container } = await renderWithRows();
    const node = container.querySelector('[data-testid="env-dep-node"]') as HTMLElement;
    const git = container.querySelector('[data-testid="env-dep-git"]') as HTMLElement;
    const bash = container.querySelector('[data-testid="env-dep-bash"]') as HTMLElement;
    // auto：下拉已显示「自动检测」，上方还有 AutoResolvedNote，状态行不得再重复。
    expect(node.textContent).not.toContain('environmentFieldSource environmentSourceAuto');
    expect(git.textContent).not.toContain('environmentFieldSource environmentSourceAuto');
    // 显式 system 来源仍保留来源段（只有 auto 属于重复信息）。
    expect(bash.textContent).toContain('environmentFieldSource environmentSourceSystem');
  });

  it('bash 自动检测同样不重复来源；只读行（webview2）仍保留来源段', async () => {
    const autoStatus = fixture();
    autoStatus.bash = depState({
      mode: 'auto',
      effective: 'system',
      installedVersion: null,
      baselineVersion: '',
      meetsBaseline: true,
      path: 'C:/Program Files/Git/bin/bash.exe',
    });
    fetchEnvStatus.mockImplementation(async () => {
      useAppStore.setState({ envStatus: autoStatus });
      return true;
    });
    seedStore({ envStatus: autoStatus });
    const { container } = await renderWithRows();
    const bash = container.querySelector('[data-testid="env-dep-bash"]') as HTMLElement;
    const webview2 = container.querySelector('[data-testid="env-dep-webview2"]') as HTMLElement;
    expect(bash.textContent).not.toContain('environmentFieldSource environmentSourceAuto');
    expect(webview2.textContent).toContain('environmentFieldSource environmentSourceAuto');
  });

  it('指定路径选中时输入框与下拉同一行（左侧无灰色文案），切走隐藏但保留路径', async () => {
    const customStatus = {
      ...fixture(),
      node: depState({
        mode: 'custom',
        effective: 'system',
        installedVersion: '22.0.0',
        baselineVersion: '22.0.0',
        meetsBaseline: true,
        path: 'C:/custom/node.exe',
        customPath: 'C:/custom/node.exe',
      }),
    };
    fetchEnvStatus.mockImplementation(async () => {
      useAppStore.setState({ envStatus: customStatus });
      return true;
    });
    const { container } = await renderWithRows();
    const node = container.querySelector('[data-testid="env-dep-node"]') as HTMLElement;
    // 输入框并入控制列同一行，不再独占次级行：section 始终只有 1 个主行。
    expect(node.querySelectorAll('.adl-settings-row')).toHaveLength(1);
    const input = within(node).getByLabelText('environmentCustomPathLabel') as HTMLInputElement;
    expect(input.value).toBe('C:/custom/node.exe');
    // 输入框在下拉同一行（控制列首行内），且左侧无灰色文案 small。
    expect(input.closest('.adl-settings-row__control')).not.toBeNull();
    expect(input.closest('.adl-env-control__main')).not.toBeNull();
  });

  it('网络行与模型行已删除（下载连通归网络组，凭据/模型归 dsh 侧）', async () => {
    const { container } = await renderWithRows();
    expect(container.querySelector('[data-testid="env-dep-net"]')).toBeNull();
    expect(container.querySelector('[data-testid="env-dep-model"]')).toBeNull();
    expect(within(container as HTMLElement).queryByText('environmentDepNet')).toBeNull();
    expect(within(container as HTMLElement).queryByText('environmentDepModel')).toBeNull();
  });

  it('复制按钮把诊断报告写剪贴板（Markdown + 可解析 JSON 块）', async () => {
    const { container } = await renderWithRows();
    const node = container.querySelector('[data-testid="env-dep-node"]') as HTMLElement;
    fireEvent.click(within(node).getByRole('button', { name: 'environmentCopyForAgentNote' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const text = clipboardReport();
    // 人类可读部分：标题、任务、上下文、问题项、runbook。
    expect(text.startsWith('# environmentDiagnosticTitle')).toBe(true);
    expect(text).toContain('environmentDiagnosticTask');
    expect(text).toContain('environmentDiagnosticAppVersion');
    expect(text).toContain('environmentDiagnosticItem');
    expect(text).toContain('environmentDiagnosticRaw');
    expect(text).toContain('#### 症状');
    expect(text).toContain('#### 检测命令');
    // 旧载荷的「JSON 套 JSON」不得复活。
    expect(text).not.toContain('statusJson');
    const payload = parseReportJson(text);
    expect(payload.dep).toBe('node');
    expect((payload.status as { baselineVersion: string }).baselineVersion).toBe('22.0.0');
    expect(payload.baseline).toBe('22.0.0');
    expect(payload.dataDir).toBe('C:/data-root');
    expect((payload.context as { bridge: string }).bridge).toBe('tauri');
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

  it('来源钉成 system 时不显示安装按钮，并说明安装不会生效', async () => {
    const systemStatus = fixture();
    systemStatus.node = depState({
      mode: 'system',
      effective: 'none',
      installedVersion: null,
      baselineVersion: '22.0.0',
      meetsBaseline: false,
      path: null,
    });
    fetchEnvStatus.mockImplementation(async () => {
      useAppStore.setState({ envStatus: systemStatus });
      return true;
    });
    seedStore({ envStatus: systemStatus });
    const { container } = await renderWithRows();
    const node = container.querySelector('[data-testid="env-dep-node"]') as HTMLElement;
    expect(within(node).queryByRole('button', { name: 'environmentInstall' })).toBeNull();
    expect(node.textContent).toContain('environmentInstallSourceHint');
  });

  it('来源钉成 custom 时同样隐藏安装按钮，并说明安装不会生效', async () => {
    const customStatus = fixture();
    customStatus.node = depState({
      mode: 'custom',
      effective: 'none',
      installedVersion: null,
      baselineVersion: '22.0.0',
      meetsBaseline: false,
      path: null,
      customPath: '',
    });
    fetchEnvStatus.mockImplementation(async () => {
      useAppStore.setState({ envStatus: customStatus });
      return true;
    });
    seedStore({ envStatus: customStatus });
    const { container } = await renderWithRows();
    const node = container.querySelector('[data-testid="env-dep-node"]') as HTMLElement;
    expect(within(node).queryByRole('button', { name: 'environmentInstall' })).toBeNull();
    expect(node.textContent).toContain('environmentInstallSourceHint');
  });

  it('来源为 auto/host 且未就绪时仍显示安装按钮', async () => {
    const hostStatus = fixture();
    hostStatus.node = depState({
      mode: 'host',
      effective: 'none',
      installedVersion: null,
      baselineVersion: '22.0.0',
      meetsBaseline: false,
      path: null,
    });
    fetchEnvStatus.mockImplementation(async () => {
      useAppStore.setState({ envStatus: hostStatus });
      return true;
    });
    seedStore({ envStatus: hostStatus });
    const { container } = await renderWithRows();
    const node = container.querySelector('[data-testid="env-dep-node"]') as HTMLElement;
    expect(within(node).getByRole('button', { name: 'environmentInstall' })).not.toBeNull();
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

  it('Git 已装版本与基线不一致时隐藏重装（保留卸载），一致时显示重装', async () => {
    const mismatch = fixture();
    mismatch.git = depState({
      installedVersion: '2.52.0',
      baselineVersion: '2.56.0',
      meetsBaseline: false,
      path: 'C:/hosted/git/2.52.0/cmd/git.exe',
    });
    fetchEnvStatus.mockImplementation(async () => {
      useAppStore.setState({ envStatus: mismatch });
      return true;
    });
    seedStore({ envStatus: mismatch });
    const first = await renderWithRows();
    const git = first.container.querySelector('[data-testid="env-dep-git"]') as HTMLElement;
    expect(within(git).queryByRole('button', { name: 'environmentReinstall' })).toBeNull();
    expect(within(git).getByRole('button', { name: 'environmentUninstall' })).not.toBeNull();
    // 行内仍可用「安装」升到基线。
    expect(within(git).getByRole('button', { name: 'environmentInstall' })).not.toBeNull();

    cleanup();
    const equal = fixture();
    equal.git = depState({
      installedVersion: '2.56.0',
      baselineVersion: '2.56.0',
      path: 'C:/hosted/git/2.56.0/cmd/git.exe',
    });
    fetchEnvStatus.mockImplementation(async () => {
      useAppStore.setState({ envStatus: equal });
      return true;
    });
    seedStore({ envStatus: equal });
    const second = await renderWithRows();
    const equalGit = second.container.querySelector('[data-testid="env-dep-git"]') as HTMLElement;
    expect(within(equalGit).getByRole('button', { name: 'environmentReinstall' })).not.toBeNull();
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

  it('全局 busy 不再禁用无关联行：安装/卸载/重装保持可用（事项 1 细粒度）', async () => {
    fetchEnvStatus.mockImplementation(async () => true);
    seedStore({ envBusy: true, envStatus: fixture() });
    const { container } = await renderWithRows();
    const node = container.querySelector('[data-testid="env-dep-node"]') as HTMLElement;
    expect(
      (within(node).getByRole('button', { name: 'environmentInstall' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    const git = container.querySelector('[data-testid="env-dep-git"]') as HTMLElement;
    expect(
      (within(git).getByRole('button', { name: 'environmentUninstall' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (within(git).getByRole('button', { name: 'environmentReinstall' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('聚合按钮并发时各键视觉态互不覆盖（R1-ENV-01）', async () => {
    let resolveRecheck!: (v: boolean) => void;
    recheckEnv.mockImplementation(() => new Promise<boolean>((r) => (resolveRecheck = r)));
    await renderWithRows();
    const recheck = screen.getByRole('button', { name: 'environmentRecheck' });
    fireEvent.click(recheck);
    await waitFor(() => expect(recheck.getAttribute('aria-busy')).toBe('true'));
    // 重测在途时再点复制全部：后完成的复制回显成功，先点的重测仍保持 loading。
    fireEvent.click(screen.getByRole('button', { name: 'environmentCopyAllForAgent' }));
    await waitFor(() => {
      expect(
        screen
          .getByRole('button', { name: 'environmentCopyAllForAgent' })
          .querySelector('.adl-btn-loading__spinner--success'),
      ).not.toBeNull();
    });
    expect(recheck.getAttribute('aria-busy')).toBe('true');
    resolveRecheck(true);
    await waitFor(() => {
      expect(recheck.querySelector('.adl-btn-loading__spinner--success')).not.toBeNull();
    });
  });

  it('重测成功后打勾回显并自动复位（事项 1c）', async () => {
    recheckEnv.mockResolvedValue(true);
    await renderWithRows();
    const recheck = screen.getByRole('button', { name: 'environmentRecheck' });
    fireEvent.click(recheck);
    // 成功：覆盖层打勾（成功色），按钮尺寸不变（文案占位）。
    await waitFor(() => {
      expect(recheck.querySelector('.adl-btn-loading__spinner--success')).not.toBeNull();
    });
    // 回显约 1.4s 后自动复位回文案。
    await waitFor(
      () => {
        expect(recheck.querySelector('.adl-btn-loading')).toBeNull();
      },
      { timeout: 3000 },
    );
    expect(recheck.textContent).toContain('environmentRecheck');
  });

  it('重测失败后打叉回显（事项 1c）', async () => {
    recheckEnv.mockResolvedValue(false);
    await renderWithRows();
    const recheck = screen.getByRole('button', { name: 'environmentRecheck' });
    fireEvent.click(recheck);
    await waitFor(() => {
      expect(recheck.querySelector('.adl-btn-loading__spinner--error')).not.toBeNull();
    });
  });

  it('来源下拉加载时隐藏文案、圆圈居中显示在框内（事项 1b/1c）', async () => {
    let resolveSelect!: (v: boolean) => void;
    selectEnvSource.mockImplementation(
      () => new Promise<boolean>((resolve) => (resolveSelect = resolve)),
    );
    const { container } = await renderWithRows();
    const node = container.querySelector('[data-testid="env-dep-node"]') as HTMLElement;
    fireEvent.click(within(node).getByRole('button', { name: 'environmentSwitch' }));
    fireEvent.click(screen.getByRole('option', { name: 'environmentSourceSystem' }));
    const trigger = within(node).getByRole('button', { name: 'environmentSwitch' });
    // 加载态：文案隐藏占位（尺寸不变）、图标覆盖层框内居中（事项 1d）。
    await waitFor(() => {
      expect(trigger.getAttribute('aria-busy')).toBe('true');
    });
    expect(trigger.querySelector('.adl-settings-dropdown__value')?.className).toContain(
      'adl-btn-loading__text',
    );
    expect(trigger.querySelector('.adl-btn-loading__spinner')).not.toBeNull();
    resolveSelect(true);
    // 成功：框内打勾回显。
    await waitFor(() => {
      expect(trigger.querySelector('.adl-btn-loading__spinner--success')).not.toBeNull();
    });
  });

  it('聚合条重测调 recheckEnv，复制全部写全量诊断报告', async () => {
    await renderWithRows();
    fireEvent.click(screen.getByRole('button', { name: 'environmentRecheck' }));
    await waitFor(() => {
      expect(recheckEnv).toHaveBeenCalledWith();
    });
    fireEvent.click(screen.getByRole('button', { name: 'environmentCopyAllForAgent' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const text = clipboardReport();
    const payload = parseReportJson(text);
    expect(payload.dep).toBe('all');
    expect(payload.dataDir).toBe('C:/data-root');
    // fixture 里 node 未就绪 → 全量载荷只带未就绪项 runbook。
    expect(text).toContain('#### 症状');
    expect(text).toContain('Node.js');
    // 就绪项（git/bash/webview2/adlserver/net）的 runbook 不得混入。
    expect(text).not.toContain('（env-git-bash）');
    expect(text).not.toContain('（env-webview2）');
    expect(text).not.toContain('（env-adlserver）');
    expect(text).not.toContain('（env-net-download）');
    // 模型行无可检测就绪信号，不参与 all 聚合。
    expect(text).not.toContain('（env-model-credential）');
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
      baselineVersion: '',
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
    const text = clipboardReport();
    expect(text).toContain('（env-git-bash）');
    // git 与 bash 共用一份 → 全文只出现一次。
    expect(text.split('（env-git-bash）')).toHaveLength(2);
    // 就绪的 node 不入载荷；模型行不参与 all 聚合。
    expect(text).not.toContain('（env-node）');
    expect(text).not.toContain('（env-model-credential）');
  });

  it('全量载荷：所有可检测项就绪时不附操作指引，且隐藏复制入口', async () => {
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
    // 5/5 就绪时聚合条不再显示「复制全部给智能体诊断」。
    expect(screen.queryByRole('button', { name: 'environmentCopyAllForAgent' })).toBeNull();
    // 载荷本身仍可直接生成：全就绪 → 不附 runbook。
    const text = buildAgentDiagnostic('all', ready, {
      t: mockT,
      appVersion: '0.1.0',
      bridge: 'tauri',
      locale: 'zh-CN',
      copiedAt: '2026-01-01T00:00:00.000Z',
      userAgent: 'test',
    });
    const payload = parseReportJson(text);
    expect(payload.dep).toBe('all');
    // bash/adlserver 的真实 wire 是 null 版本 + 空基线；健康时全部就绪 → 无操作指引。
    const status = payload.status as EnvStatus;
    expect(status.bash.installedVersion).toBeNull();
    expect(status.adlserver.installedVersion).toBeNull();
    expect(text).toContain('environmentDiagnosticAllReady');
    expect(text).not.toContain('（env-node）');
  });

  it('全量载荷：bash/adlserver 未就绪时收录各自 runbook', async () => {
    const status = fixture();
    status.node = depState({
      mode: 'auto',
      effective: 'host',
      installedVersion: '22.0.0',
      baselineVersion: '22.0.0',
      meetsBaseline: true,
      path: 'C:/hosted/node/22.0.0/node.exe',
    });
    status.bash = depState({
      mode: 'system',
      effective: 'none',
      installedVersion: null,
      baselineVersion: '',
      meetsBaseline: false,
      path: null,
    });
    status.adlserver = depState({
      effective: 'none',
      origin: 'bundled',
      installedVersion: null,
      baselineVersion: '',
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
    const text = clipboardReport();
    expect(text).toContain('（env-git-bash）');
    expect(text).toContain('（env-adlserver）');
  });

  it('版本无关依赖的载荷 baseline 为 null（wire 空串）', async () => {
    // bash 异常（未就绪）时才渲染复制按钮：覆盖默认 fixture 的就绪态。
    fetchEnvStatus.mockImplementation(async () => {
      const status = fixture();
      status.bash = depState({
        mode: 'auto',
        effective: 'none',
        installedVersion: null,
        baselineVersion: '',
        meetsBaseline: false,
        path: null,
      });
      useAppStore.setState({ envStatus: status });
      return true;
    });
    const { container } = await renderWithRows();
    const bash = container.querySelector('[data-testid="env-dep-bash"]') as HTMLElement;
    fireEvent.click(within(bash).getByRole('button', { name: 'environmentCopyForAgentNote' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const payload = parseReportJson(clipboardReport());
    expect(payload.baseline).toBeNull();
  });

  it('组级重置 pending 打开确认框，确认后来源回自动并清空指定路径', async () => {
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

  it('聚合条就绪计数只计五个版本依赖（网络/模型不计入）', async () => {
    // fixture：node 缺失 + 其余四依赖就绪 = 4/5。
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
    expect(await screen.findByText('4/5 就绪')).not.toBeNull();
  });

  it('bash/adlserver 无版本号（真实 wire）仍按 meetsBaseline 计为就绪：5/5', async () => {
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
    const hybridT = new Proxy({} as Record<string, string>, {
      get: (_, key) =>
        typeof key === 'string' ? ((environmentZh as Record<string, string>)[key] ?? key) : '',
    }) as unknown as CopyDict;
    const { container } = render(
      <TCopyProvider t={hybridT} locale="zh-CN">
        <EnvironmentSettings />
      </TCopyProvider>,
    );
    expect(await screen.findByText('5/5 就绪')).not.toBeNull();
    const bash = container.querySelector('[data-testid="env-dep-bash"]') as HTMLElement;
    expect(bash.textContent).toContain('已检测');
    expect(bash.textContent).not.toContain('缺失');
    const adlserver = container.querySelector('[data-testid="env-dep-adlserver"]') as HTMLElement;
    expect(adlserver.textContent).toContain('已检测');
    expect(adlserver.textContent).not.toContain('缺失');
  });

  it('挂载轮询：空闲不启动；有任务/操作时启动，卸载不清除共享轮询', async () => {
    seedStore({ envStatus: fixture() });
    const first = renderSettings();
    await waitFor(() => {
      expect(fetchEnvStatus).toHaveBeenCalled();
    });
    expect(pollEnvTaskWhileRunning).not.toHaveBeenCalled();
    first.unmount();

    const stop = vi.fn();
    pollEnvTaskWhileRunning.mockReturnValueOnce(stop);
    seedStore({ envStatus: fixture(), envBusy: true });
    fetchEnvStatus.mockImplementation(async () => true);
    const second = renderSettings();
    await waitFor(() => {
      expect(pollEnvTaskWhileRunning).toHaveBeenCalledTimes(1);
    });
    second.unmount();
    // 轮询归 store 所有：卸载只是不再观察，不得停止正在进行的任务轮询。
    expect(stop).not.toHaveBeenCalled();
  });

  it('安装确认与开始 toast 使用本地化依赖名而非 slug', async () => {
    const hybridT = new Proxy({} as Record<string, string>, {
      get: (_, key) =>
        typeof key === 'string' ? ((environmentZh as Record<string, string>)[key] ?? key) : '',
    }) as unknown as CopyDict;
    seedStore({ envStatus: fixture() });
    const { container } = render(
      <TCopyProvider t={hybridT} locale="zh-CN">
        <EnvironmentSettings />
      </TCopyProvider>,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-testid="env-dep-node"]')).not.toBeNull();
    });
    const node = container.querySelector('[data-testid="env-dep-node"]') as HTMLElement;
    fireEvent.click(within(node).getByRole('button', { name: '安装' }));
    expect(await screen.findByText('确认安装 Node.js')).not.toBeNull();
    expect(screen.queryByText('确认安装 node')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(
        useAppStore.getState().toasts.some((toast) => toast.message === '开始安装 Node.js…'),
      ).toBe(true);
    });
  });

  it('浏览器模式：仅变更动作置灰；来源切换与指定路径保持可用', async () => {
    const customFixture = {
      ...fixture(),
      node: depState({
        mode: 'auto',
        effective: 'none',
        installedVersion: null,
        baselineVersion: '22.0.0',
        meetsBaseline: false,
        path: null,
      }),
      bash: depState({
        mode: 'custom',
        effective: 'none',
        installedVersion: null,
        baselineVersion: '',
        meetsBaseline: false,
        path: null,
        customPath: '',
      }),
    };
    seedStore({ isTauri: false });
    fetchEnvStatus.mockImplementation(async () => {
      useAppStore.setState({ envStatus: customFixture });
      return true;
    });
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
    expect(node.textContent).toContain('environmentInstallDesktopOnlyHint');
    // 本地配置（来源选择 + 指定路径输入）在浏览器模式仍可用（R1-07/R1-14）。
    const bash = container.querySelector('[data-testid="env-dep-bash"]') as HTMLElement;
    expect((within(bash).getByLabelText('environmentSwitch') as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(
      (within(bash).getByLabelText('environmentCustomPathLabel') as HTMLInputElement).disabled,
    ).toBe(false);
    const git = container.querySelector('[data-testid="env-dep-git"]') as HTMLElement;
    expect(
      (within(git).getByRole('button', { name: 'environmentUninstall' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (within(git).getByRole('button', { name: 'environmentReinstall' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(git.textContent).toContain('environmentInstallDesktopOnlyHint');
  });

  it('resume 横幅：skippedAt + 未就绪 → 显示 N 项，继续向导通过 nonce 重新请求', async () => {
    // fixture：node 缺失 + 其余就绪 + 注册表通 = 1 项未就绪。
    const hybridT = new Proxy({} as Record<string, string>, {
      get: (_, key) =>
        typeof key === 'string' ? ((environmentZh as Record<string, string>)[key] ?? key) : '',
    }) as unknown as CopyDict;
    seedStore({ envStatus: fixture(), envWizardDone: true, envWizardSkippedAt: 123 });
    const before = useAppStore.getState().envWizardRequestId;
    render(
      <TCopyProvider t={hybridT} locale="zh-CN">
        <EnvironmentSettings />
      </TCopyProvider>,
    );
    expect(await screen.findByText('上次跳过了 1 项')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '继续向导' }));
    expect(useAppStore.getState().envWizardDone).toBe(false);
    expect(useAppStore.getState().envWizardRequestId).toBe(before + 1);
  });

  it('resume 横幅：done 已为 false 时继续向导仍自增 nonce（避免 no-op 死按钮）', async () => {
    const hybridT = new Proxy({} as Record<string, string>, {
      get: (_, key) =>
        typeof key === 'string' ? ((environmentZh as Record<string, string>)[key] ?? key) : '',
    }) as unknown as CopyDict;
    seedStore({ envStatus: fixture(), envWizardDone: false, envWizardSkippedAt: 123 });
    const before = useAppStore.getState().envWizardRequestId;
    render(
      <TCopyProvider t={hybridT} locale="zh-CN">
        <EnvironmentSettings />
      </TCopyProvider>,
    );
    expect(await screen.findByText('上次跳过了 1 项')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '继续向导' }));
    expect(useAppStore.getState().envWizardDone).toBe(false);
    expect(useAppStore.getState().envWizardRequestId).toBe(before + 1);
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

  it('剪贴板降级返回 execCommand 的真实结果（不支持时为 false）', async () => {
    const original = document.execCommand;
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    Object.assign(navigator, { clipboard: undefined });
    try {
      await expect(copyTextToClipboard('hello')).resolves.toBe(true);
      expect(execCommand).toHaveBeenCalledWith('copy');

      execCommand.mockReturnValue(false);
      await expect(copyTextToClipboard('hello')).resolves.toBe(false);

      Object.defineProperty(document, 'execCommand', { value: undefined, configurable: true });
      await expect(copyTextToClipboard('hello')).resolves.toBe(false);
    } finally {
      Object.defineProperty(document, 'execCommand', { value: original, configurable: true });
    }
  });

  it('块级刷新只重检本块 deps，两个块互不联动', async () => {
    await renderWithRows();
    recheckEnv.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'refresh:environmentBlockRuntime' }));
    await waitFor(() => expect(recheckEnv).toHaveBeenCalledWith(['node', 'git', 'bash']));

    recheckEnv.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'refresh:environmentBlockSystem' }));
    await waitFor(() => expect(recheckEnv).toHaveBeenCalledWith(['webview2', 'adlserver']));
  });

  it('跨块连续刷新排队执行，不静默丢弃（R1-ENV-02）', async () => {
    let resolveFirst!: (v: boolean) => void;
    recheckEnv.mockImplementationOnce(() => new Promise<boolean>((r) => (resolveFirst = r)));
    recheckEnv.mockResolvedValue(true);
    await renderWithRows();
    recheckEnv.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'refresh:environmentBlockRuntime' }));
    await waitFor(() => expect(recheckEnv).toHaveBeenCalledWith(['node', 'git', 'bash']));
    fireEvent.click(screen.getByRole('button', { name: 'refresh:environmentBlockSystem' }));
    // 第一个块仍在途：第二个请求入队而不是被丢弃。
    expect(recheckEnv).toHaveBeenCalledTimes(1);

    resolveFirst(true);
    await waitFor(() => expect(recheckEnv).toHaveBeenCalledWith(['webview2', 'adlserver']));
  });

  it('行级刷新只传单个 dep', async () => {
    await renderWithRows();
    recheckEnv.mockClear();
    const nodeRow = screen.getByTestId('env-dep-node');
    fireEvent.click(within(nodeRow).getByRole('button', { name: 'refresh:environmentDepNode' }));
    await waitFor(() => expect(recheckEnv).toHaveBeenCalledWith(['node']));
  });
});
