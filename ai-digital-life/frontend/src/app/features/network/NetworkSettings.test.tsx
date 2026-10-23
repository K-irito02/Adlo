import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act, screen } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import { NetworkSettings } from './NetworkSettings';
import type { DshSourceStatus } from '../../../shared/ipc/dsh';

const testSource = vi.fn();
const saveSourceConfig = vi.fn();

vi.mock('../../hooks/useAppActions', () => {
  // 单例对象：保持 useAppActions 返回引用稳定（真实实现经 useShallow 也稳定），
  // 否则组件挂载 effect 依赖 [actions] 会在每次重渲染时重复拉取快照。
  const actions = {
    testSource: (...args: unknown[]) => testSource(...args),
    saveSourceConfig: (...args: unknown[]) => saveSourceConfig(...args),
  };
  return { useAppActions: () => actions };
});

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

const NPMJS_URL = 'https://registry.npmjs.org';
const NPMMIRROR_URL = 'https://registry.npmmirror.com';

function makeStatus(patch: Partial<DshSourceStatus['config']> = {}): DshSourceStatus {
  return {
    system: null,
    running: null,
    versionSource: {
      mode: 'auto',
      effective: 'host',
      resolvedByMode: { auto: 'host', host: 'host', system: 'none' },
      hostVersion: '0.1.0',
    },
    config: {
      npm_registry: NPMJS_URL,
      dsh_mirror: null,
      source_mode: 'manual',
      version_source: 'auto',
      proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
      ...patch,
    },
  };
}

function renderSettings() {
  return render(
    <TestProvider>
      <NetworkSettings />
    </TestProvider>,
  );
}

describe('NetworkSettings', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    testSource.mockReset();
    saveSourceConfig.mockReset();
    testSource.mockResolvedValue({ reachable: true, latency_ms: 12, error: null });
    saveSourceConfig.mockResolvedValue(true);
    useAppStore.setState({
      sourceStatus: null,
      networkGroupResetPending: false,
      networkBlocksAtDefault: null,
      toasts: [],
    });
  });

  it('三块结构：块头在卡外，每块头 + 卡片配对，测试块用装饰图标对齐', () => {
    useAppStore.setState({ sourceStatus: makeStatus() });
    renderSettings();
    const root = document.querySelector('.adl-network-settings');
    expect(root).not.toBeNull();
    const headers = root?.querySelectorAll('.adl-dsh-settings__header') ?? [];
    expect(headers.length).toBe(3);
    const cards = root?.querySelectorAll(':scope > .adl-settings-card') ?? [];
    // 下载源/代理/测试连接各 1 张。
    expect(cards.length).toBe(3);
    // 块头在卡片之外（设置组通用结构，不是卡内标题）。
    expect(root?.querySelector('.adl-settings-card .adl-dsh-settings__header')).toBeNull();
    // 前两块（下载源/代理设置）带恢复按钮，测试连接块带装饰图标（非按钮，仅对齐）。
    expect(headers[0]?.querySelector('[data-testid="dsh-source-reset"]')).not.toBeNull();
    expect(headers[1]?.querySelector('[data-testid="dsh-proxy-reset"]')).not.toBeNull();
    expect(headers[2]?.querySelector('button')).toBeNull();
    const staticIcon = headers[2]?.querySelector(
      'span.adl-settings-row__reset--static[aria-hidden="true"]',
    );
    expect(staticIcon).not.toBeNull();
    // 锚点已迁入 network 域（与 Task 4 搜索索引一致）。
    expect(headers[0]?.getAttribute('data-settings-anchor')).toBe('network:source');
    expect(headers[1]?.getAttribute('data-settings-anchor')).toBe('network:proxy');
    expect(headers[2]?.getAttribute('data-settings-anchor')).toBe('network:test');
  });

  it('sourceStatus 未知（拉取失败/延迟）时下拉保持可用（fail-open 回归）', () => {
    // fetch mock 只 resolve true、不写 sourceStatus → 模拟拉取失败后的 null 态。
    useAppStore.setState({ sourceStatus: null });
    renderSettings();
    expect((screen.getByLabelText('dshSettingsSource') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText('dshSettingsProxyMode') as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect((screen.getByTestId('dsh-test-button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('sourceStatus 未知时块恢复按钮只看本地选项（fail-open，不再永久砖化）', () => {
    // 拉取失败 sourceStatus 恒 null：初始源为 npmjs（非默认）→ 源恢复可用；
    // 代理初始 auto（已默认）→ 代理恢复禁用。
    useAppStore.setState({ sourceStatus: null });
    renderSettings();
    expect((screen.getByTestId('dsh-source-reset') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('dsh-proxy-reset') as HTMLButtonElement).disabled).toBe(true);
  });

  it('按 source_mode + registry 往返播种：manual+镜像 → 镜像，manual+官方 → 官方', () => {
    useAppStore.setState({ sourceStatus: makeStatus({ npm_registry: NPMMIRROR_URL }) });
    renderSettings();
    expect(screen.getByLabelText('dshSettingsSource').textContent).toContain(
      'dshSettingsSourceNpmmirror',
    );
    cleanup();

    useAppStore.setState({ sourceStatus: makeStatus({ npm_registry: NPMJS_URL }) });
    renderSettings();
    expect(screen.getByLabelText('dshSettingsSource').textContent).toContain(
      'dshSettingsSourceNpmjs',
    );
  });

  it('manual+未知地址播种为自定义并回填输入框', () => {
    useAppStore.setState({
      sourceStatus: makeStatus({ npm_registry: 'https://custom.example' }),
    });
    renderSettings();
    expect(screen.getByLabelText('dshSettingsSource').textContent).toContain(
      'dshSettingsSourceCustom',
    );
    const input = document.querySelector(
      '.adl-network-settings .adl-settings-row__control input.adl-settings-input',
    ) as HTMLInputElement;
    expect(input.value).toBe('https://custom.example');
  });

  it('auto 种子静默实测选优：取低延迟源写回，不弹成功 toast', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus({ source_mode: 'auto', npm_registry: NPMJS_URL }),
    });
    testSource
      .mockResolvedValueOnce({ reachable: true, latency_ms: 100, error: null })
      .mockResolvedValueOnce({ reachable: true, latency_ms: 30, error: null });
    renderSettings();
    expect(screen.getByLabelText('dshSettingsSource').textContent).toContain(
      'dshSettingsSourceAuto',
    );
    await waitFor(() => {
      // 检测写回为显式路径（silent=false），后台防抖路径才传 true。
      expect(saveSourceConfig).toHaveBeenCalledWith(
        {
          source_mode: 'auto',
          npm_registry: NPMMIRROR_URL,
        },
        false,
      );
    });
    // silent：静默写回，不弹「已自动选择」成功提示。
    expect(useAppStore.getState().toasts).toHaveLength(0);
    // 源选择停留在「自动检测」（检测不改用户可见选中项）。
    expect(screen.getByLabelText('dshSettingsSource').textContent).toContain(
      'dshSettingsSourceAuto',
    );
  });

  it('双源均不可达（挂载静默）：保留当前、不打扰', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus({ source_mode: 'auto', npm_registry: NPMJS_URL }),
    });
    testSource.mockResolvedValue({ reachable: false, latency_ms: null, error: 'ENOTFOUND' });
    renderSettings();
    await waitFor(() => {
      expect(testSource).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(
      useAppStore.getState().toasts.some((t) => t.message === 'dshSettingsAutoDetectFailed'),
    ).toBe(false);
    expect(saveSourceConfig).not.toHaveBeenCalled();
  });

  it('用户手动选自动检测而双源均不可达：弹失败提示并落盘 source_mode', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus({ source_mode: 'manual', npm_registry: NPMJS_URL }),
    });
    testSource.mockResolvedValue({ reachable: false, latency_ms: null, error: 'ENOTFOUND' });
    renderSettings();
    fireEvent.click(screen.getByLabelText('dshSettingsSource'));
    fireEvent.click(await screen.findByRole('option', { name: 'dshSettingsSourceAuto' }));
    await waitFor(() => {
      expect(
        useAppStore.getState().toasts.some((t) => t.message === 'dshSettingsAutoDetectFailed'),
      ).toBe(true);
    });
    // 空候选也把本次选择落盘（后端与 UI 一致），不带 registry（保持上次检测值）。
    await waitFor(() => {
      expect(saveSourceConfig).toHaveBeenCalledWith({ source_mode: 'auto' }, false);
    });
  });

  it('静默检测遇桥失败（null 结果）：不弹失败提示、不写回', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus({ source_mode: 'auto', npm_registry: NPMJS_URL }),
    });
    // 桥级失败（后端不可达）：action 返回 null，而非 reachable:false 结构。
    testSource.mockResolvedValue(null);
    renderSettings();
    await waitFor(() => {
      expect(testSource).toHaveBeenCalledTimes(2);
    });
    // 给检测后续留出完成窗口，再断言全程静默。
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(
      useAppStore.getState().toasts.some((t) => t.message === 'dshSettingsAutoDetectFailed'),
    ).toBe(false);
    expect(saveSourceConfig).not.toHaveBeenCalled();
  });

  it('静默检测单桥失败：另一路可达仍选优写回、不打扰', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus({ source_mode: 'auto', npm_registry: NPMJS_URL }),
    });
    // 官方桥失败（null），镜像可达：照常选镜像写回，全程无 toast。
    testSource
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ reachable: true, latency_ms: 30, error: null });
    renderSettings();
    await waitFor(() => {
      expect(saveSourceConfig).toHaveBeenCalledWith(
        {
          source_mode: 'auto',
          npm_registry: NPMMIRROR_URL,
        },
        false,
      );
    });
    expect(useAppStore.getState().toasts).toHaveLength(0);
  });

  it('代理字段变更经 500ms 防抖静默落盘，成功不 toast、失败 toast', async () => {
    vi.useFakeTimers();
    useAppStore.setState({
      sourceStatus: makeStatus({
        source_mode: 'manual',
        proxy: {
          mode: 'manual',
          http_proxy: null,
          https_proxy: null,
          no_proxy: null,
        },
      }),
    });
    renderSettings();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const input = screen.getByLabelText('dshSettingsProxyHttp') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'http://proxy:8080' } });
    expect(saveSourceConfig).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(501);
    });
    expect(saveSourceConfig).toHaveBeenCalledTimes(1);
    // 后台防抖路径传 silent=true（失败仅 toast，不记全局错误卡）。
    expect(saveSourceConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        source_mode: 'manual',
        proxy: expect.objectContaining({ mode: 'manual', http_proxy: 'http://proxy:8080' }),
      }),
      true,
    );
    expect(useAppStore.getState().toasts.some((t) => t.message === 'dshSettingsSaveFailed')).toBe(
      false,
    );

    saveSourceConfig.mockResolvedValueOnce(false);
    fireEvent.change(input, { target: { value: 'http://other:9090' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(501);
    });
    expect(useAppStore.getState().toasts.some((t) => t.message === 'dshSettingsSaveFailed')).toBe(
      true,
    );
  });

  it('测试按钮：点击后按钮内变结果，2 秒后恢复原文案', async () => {
    vi.useFakeTimers();
    useAppStore.setState({ sourceStatus: makeStatus({ npm_registry: NPMJS_URL }) });
    renderSettings();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const button = screen.getByTestId('dsh-test-button') as HTMLButtonElement;
    expect(button.textContent).toContain('dshSettingsTestButton');
    testSource.mockResolvedValueOnce({ reachable: true, latency_ms: 42, error: null });
    fireEvent.click(button);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(testSource).toHaveBeenCalledWith(NPMJS_URL);
    expect(button.textContent).toContain('dshSettingsTestSuccess');
    // 2 秒后恢复按钮文案。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(button.textContent).toContain('dshSettingsTestButton');
  });

  it('代理块恢复默认：确认立刻关框刷新，写 auto（乐观执行）', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus({
        source_mode: 'manual',
        proxy: {
          mode: 'manual',
          http_proxy: 'http://old:1',
          https_proxy: null,
          no_proxy: null,
        },
      }),
    });
    renderSettings();
    fireEvent.click(screen.getByTestId('dsh-proxy-reset'));
    expect(screen.getByText('settingsResetGroupConfirmTitle')).not.toBeNull();
    expect(saveSourceConfig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      // 显式恢复路径传 silent=false（失败走全局错误卡 + toast 双通道）。
      expect(saveSourceConfig).toHaveBeenCalledWith(
        {
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
        false,
      );
    });
    await waitFor(() => {
      expect(screen.queryByText('settingsResetGroupConfirmTitle')).toBeNull();
    });
    // 字段随状态清空（manual → auto 隐藏字段），代理下拉回 auto。
    expect(screen.getByLabelText('dshSettingsProxyMode').textContent).toContain(
      'dshSettingsProxyModeAuto',
    );
  });

  it('下载源块恢复默认：确认立刻关框刷新，随后静默实测', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus({ source_mode: 'manual', npm_registry: NPMMIRROR_URL }),
    });
    renderSettings();
    fireEvent.click(screen.getByTestId('dsh-source-reset'));
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(saveSourceConfig).toHaveBeenCalledWith(
        {
          source_mode: 'auto',
          npm_registry: NPMJS_URL,
        },
        false,
      );
    });
    expect(screen.getByLabelText('dshSettingsSource').textContent).toContain(
      'dshSettingsSourceAuto',
    );
    // 恢复后自动触发检测（官方 + 镜像并发实测，静默模式）。
    await waitFor(() => {
      expect(testSource).toHaveBeenCalledWith(NPMMIRROR_URL, true);
    });
  });

  it('下载源块恢复失败：弹失败提示并回滚到确认前的值', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus({ source_mode: 'manual', npm_registry: NPMMIRROR_URL }),
    });
    saveSourceConfig.mockResolvedValue(false);
    renderSettings();
    fireEvent.click(screen.getByTestId('dsh-source-reset'));
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    // 乐观执行：对话框先关（不等落盘结果）。
    await waitFor(() => {
      expect(screen.queryByText('settingsResetGroupConfirmTitle')).toBeNull();
    });
    await waitFor(() => {
      expect(useAppStore.getState().toasts.some((t) => t.message === 'dshSettingsSaveFailed')).toBe(
        true,
      );
    });
    // 回滚：下拉回到确认前的镜像选项。
    await waitFor(() => {
      expect(screen.getByLabelText('dshSettingsSource').textContent).toContain(
        'dshSettingsSourceNpmmirror',
      );
    });
  });

  it('组级恢复：承接 pending 开自有确认框，确认后一次写入源+代理默认并消费信号', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus({
        source_mode: 'manual',
        npm_registry: 'https://custom.example',
        proxy: {
          mode: 'manual',
          http_proxy: 'http://old:1',
          https_proxy: null,
          no_proxy: null,
        },
      }),
    });
    renderSettings();
    act(() => {
      useAppStore.setState({ networkGroupResetPending: true });
    });
    // 首跳不漏弹：自有确认框承接（标题与通用键同模板，但执行走 saveSourceConfig）。
    expect(await screen.findByText('settingsResetGroupConfirmTitle')).not.toBeNull();
    expect(useAppStore.getState().networkGroupResetPending).toBe(false);
    expect(saveSourceConfig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      // 网络组单计划：一次写源+代理默认（Task 5 起不再连带 dsh 版本来源）。
      expect(saveSourceConfig).toHaveBeenCalledWith(
        {
          source_mode: 'auto',
          npm_registry: NPMJS_URL,
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
        false,
      );
    });
    // 单计划：只写源+代理默认，不再顺序写版本来源。
    await waitFor(() => {
      expect(useAppStore.getState().toasts.some((t) => t.message === 'settingsResetComplete')).toBe(
        true,
      );
    });
    expect(
      saveSourceConfig.mock.calls.filter(
        ([cfg]) => (cfg as { version_source?: string }).version_source !== undefined,
      ),
    ).toHaveLength(0);
    expect(screen.getByLabelText('dshSettingsSource').textContent).toContain(
      'dshSettingsSourceAuto',
    );
    expect(screen.getByLabelText('dshSettingsProxyMode').textContent).toContain(
      'dshSettingsProxyModeAuto',
    );
  });

  it('两块全默认写聚合信号 networkBlocksAtDefault，卸载保留', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus({
        source_mode: 'auto',
        npm_registry: NPMJS_URL,
        proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
      }),
    });
    testSource.mockResolvedValue({ reachable: true, latency_ms: 10, error: null });
    const { unmount } = renderSettings();
    await waitFor(() => {
      expect(useAppStore.getState().networkBlocksAtDefault).toBe(true);
    });
    unmount();
    // 卸载不清（事项 12d 同构）：保留最后已知聚合供侧边栏禁用判定，
    // 切出后由 SettingsPanel 未激活校正随 store 变化刷新。
    expect(useAppStore.getState().networkBlocksAtDefault).toBe(true);
  });

  it('未全默认（代理非 auto）时聚合信号为 false', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus({
        source_mode: 'auto',
        npm_registry: NPMJS_URL,
        proxy: { mode: 'none', http_proxy: null, https_proxy: null, no_proxy: null },
      }),
    });
    renderSettings();
    await waitFor(() => {
      expect(useAppStore.getState().networkBlocksAtDefault).toBe(false);
    });
  });

  it('显式恢复与在途防抖落盘串行执行（调用顺序即落盘顺序）', async () => {
    vi.useFakeTimers();
    useAppStore.setState({
      sourceStatus: makeStatus({
        source_mode: 'manual',
        npm_registry: NPMMIRROR_URL,
        proxy: { mode: 'manual', http_proxy: null, https_proxy: null, no_proxy: null },
      }),
    });
    let resolveFirst!: (v: boolean) => void;
    saveSourceConfig
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((r) => {
            resolveFirst = r;
          }),
      )
      .mockResolvedValue(true);
    renderSettings();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // 改字段触发防抖保存，推进到落盘开始（第一次 persist 在途挂起）。
    fireEvent.change(screen.getByLabelText('dshSettingsProxyHttp'), {
      target: { value: 'http://proxy:8080' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(501);
    });
    expect(saveSourceConfig).toHaveBeenCalledTimes(1);
    // 在途时点代理块恢复：显式写入排队，不并发双写。
    fireEvent.click(screen.getByTestId('dsh-proxy-reset'));
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    expect(saveSourceConfig).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFirst(true);
      await vi.advanceTimersByTimeAsync(0);
    });
    // 先防抖快照（含刚填的代理地址，后台路径 silent=true），后恢复默认（清空，显式路径 false）。
    expect(saveSourceConfig).toHaveBeenCalledTimes(2);
    expect(saveSourceConfig).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        proxy: expect.objectContaining({ mode: 'manual', http_proxy: 'http://proxy:8080' }),
      }),
      true,
    );
    expect(saveSourceConfig).toHaveBeenNthCalledWith(
      2,
      {
        proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
      },
      false,
    );
  });

  it('确认落盘失败前用户已改值：不回滚，新输入优先', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus({ source_mode: 'manual', npm_registry: NPMMIRROR_URL }),
    });
    let resolveSave!: (v: boolean) => void;
    saveSourceConfig
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((r) => {
            resolveSave = r;
          }),
      )
      .mockResolvedValue(true);
    renderSettings();
    fireEvent.click(screen.getByTestId('dsh-source-reset'));
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    // 落盘挂起期间用户改选镜像（经真实下拉交互）。
    fireEvent.click(screen.getByLabelText('dshSettingsSource'));
    fireEvent.click(await screen.findByRole('option', { name: 'dshSettingsSourceNpmmirror' }));
    await act(async () => {
      resolveSave(false);
    });
    await waitFor(() => {
      expect(useAppStore.getState().toasts.some((t) => t.message === 'dshSettingsSaveFailed')).toBe(
        true,
      );
    });
    // 用户的新选择保留，不被回滚覆盖。
    expect(screen.getByLabelText('dshSettingsSource').textContent).toContain(
      'dshSettingsSourceNpmmirror',
    );
    // 收尾：被 500ms 防抖延迟的「新选择」落盘由本用例负责消费，避免该真实计时器在
    // 组件卸载后（有意保留防抖，见 NetworkSettings 卸载清理注释）泄漏到后续用例。
    await waitFor(() => {
      expect(saveSourceConfig).toHaveBeenCalledWith(
        expect.objectContaining({ npm_registry: NPMMIRROR_URL }),
        true,
      );
    });
  });

  it('sourceStatus 后到更新不覆盖编辑中表单（seed-once 锁定）', () => {
    useAppStore.setState({
      sourceStatus: makeStatus({ source_mode: 'manual', npm_registry: NPMMIRROR_URL }),
    });
    renderSettings();
    expect(screen.getByLabelText('dshSettingsSource').textContent).toContain(
      'dshSettingsSourceNpmmirror',
    );
    act(() => {
      useAppStore.setState({
        sourceStatus: makeStatus({ source_mode: 'manual', npm_registry: NPMJS_URL }),
      });
    });
    expect(screen.getByLabelText('dshSettingsSource').textContent).toContain(
      'dshSettingsSourceNpmmirror',
    );
  });

  it('块确认框开着时侧边栏重置不吞信号：pending 保留，关块框后组框出现', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus({ source_mode: 'manual', npm_registry: NPMMIRROR_URL }),
    });
    renderSettings();
    fireEvent.click(screen.getByTestId('dsh-source-reset'));
    expect(screen.getByText('settingsResetGroupConfirmTitle')).not.toBeNull();
    act(() => {
      useAppStore.setState({ networkGroupResetPending: true });
    });
    // 守卫命中：组框未弹，pending 保留（仍有一个对话框，即块确认框）。
    expect(useAppStore.getState().networkGroupResetPending).toBe(true);
    expect(screen.queryAllByText('settingsResetGroupConfirmTitle')).toHaveLength(1);
    expect(saveSourceConfig).not.toHaveBeenCalled();
    // 关掉块确认框 → effect 重试 → 组框承接并消费信号。
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    await waitFor(() => {
      expect(useAppStore.getState().networkGroupResetPending).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      // 网络组单计划：一次写源+代理默认。
      expect(saveSourceConfig).toHaveBeenCalledWith(
        {
          source_mode: 'auto',
          npm_registry: NPMJS_URL,
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
        false,
      );
    });
    // 组级单计划：版本来源不在本组写。
    expect(
      saveSourceConfig.mock.calls.filter(
        ([cfg]) => (cfg as { version_source?: string }).version_source !== undefined,
      ),
    ).toHaveLength(0);
  });

  it('组级恢复取消在途防抖：显式写入只落一次（旧快照不补写）', async () => {
    vi.useFakeTimers();
    useAppStore.setState({
      sourceStatus: makeStatus({
        source_mode: 'manual',
        npm_registry: NPMMIRROR_URL,
        proxy: { mode: 'manual', http_proxy: null, https_proxy: null, no_proxy: null },
      }),
    });
    // 检测不可达：恢复后的静默实测不产生写回，断言窗口内应只有恢复这一次写。
    testSource.mockResolvedValue({ reachable: false, latency_ms: null, error: 'ENOTFOUND' });
    renderSettings();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // 改代理字段触发 500ms 防抖保存（此刻在途、尚未落盘）。
    fireEvent.change(screen.getByLabelText('dshSettingsProxyHttp'), {
      target: { value: 'http://proxy:8080' },
    });
    expect(saveSourceConfig).not.toHaveBeenCalled();
    // 防抖窗口内触发组级恢复并确认（不推进计时器）。
    act(() => {
      useAppStore.setState({ networkGroupResetPending: true });
    });
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    // 推进超过防抖窗口：在途防抖已被 saveNow 取消，旧快照不得补写（恢复单计划一次写 + 零补写）。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(saveSourceConfig).toHaveBeenCalledTimes(1);
    // 恢复单计划：一次写源+代理默认。
    expect(saveSourceConfig).toHaveBeenNthCalledWith(
      1,
      {
        source_mode: 'auto',
        npm_registry: NPMJS_URL,
        proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
      },
      false,
    );
  });
});
