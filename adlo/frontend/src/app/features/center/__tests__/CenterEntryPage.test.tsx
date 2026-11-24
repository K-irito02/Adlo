import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { CenterEntryPage } from '../CenterEntryPage';
import { CenterPane } from '@regions/CenterPane';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n/types';
import type { DshSourceStatus } from '@shared/ipc/dsh';

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
  dshOpenNoVersion: '暂无可用版本',
  dshVersionBusyRetry: '稍候再试',
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
    errorToasts: [],
    toasts: [],
    // 守卫用例会写入 sourceStatus（effective none）；此处复位，避免污染后续用例的守卫判定。
    sourceStatus: null,
  });
});

afterEach(() => {
  (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
  vi.restoreAllMocks();
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
    // 本用例无面板标签，重夹后应为空串（而非仅"不等于中心标签"）。
    expect(s.browserActiveTabId).toBe('');
  });

  it('点击「打开终端」就地转换为终端选择器', () => {
    renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: '打开终端' }));

    const center = useAppStore.getState().centerTabs.find((c) => c.id === 'c1');
    expect(center).toMatchObject({ kind: 'terminal', refId: null });
  });

  it('点击「打开 deepseek harness」成功后把入口页标签就地转为 dsh 浏览器标签（不新增中心标签）', async () => {
    const open = vi.fn(async () => ({
      ok: true,
      data: { url: 'http://127.0.0.1:3080', freedPort: false },
    }));
    (window as unknown as { digitalLife: unknown }).digitalLife = { dsh: { open } };

    renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: /deepseek harness/i }));

    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => {
      const center = useAppStore.getState().centerTabs.find((c) => c.id === 'c1');
      expect(center?.kind).toBe('browser');
    });
    const s = useAppStore.getState();
    // 新建的普通浏览器标签位于中心，URL 为 dsh URL（不再带任何 dsh 专属标记）。
    const dshTab = s.browserTabs.find((tab) => tab.url === 'http://127.0.0.1:3080');
    expect(dshTab).toBeTruthy();
    expect(dshTab?.location).toBe('center');
    // 入口页标签就地在原位转为 browser，中心标签数量不变（避免打开瞬间重排闪烁）。
    expect(s.centerTabs).toHaveLength(1);
    expect(s.centerTabs[0]).toMatchObject({ id: 'c1', kind: 'browser', refId: dshTab?.id });
    expect(s.centerActiveTabId).toBe('c1');
  });

  it('freedPort=true 时报 DSH_FREED_PORT 信息卡并把入口页就地转为浏览器标签', async () => {
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
    await vi.waitFor(() => {
      const center = useAppStore.getState().centerTabs.find((c) => c.id === 'c1');
      expect(center?.kind).toBe('browser');
    });
  });

  it('复用已在中心的 dsh 标签时只聚焦它并移除入口页', async () => {
    const open = vi.fn(async () => ({
      ok: true,
      data: { url: 'http://127.0.0.1:3080', freedPort: false },
    }));
    (window as unknown as { digitalLife: unknown }).digitalLife = { dsh: { open } };
    useAppStore.setState({
      centerTabs: [
        { id: 'c1', kind: 'launcher', refId: null, createdAt: 1 },
        { id: 'c2', kind: 'browser', refId: 'bt1', createdAt: 2 },
      ],
      centerActiveTabId: 'c1',
      browserTabs: [
        { id: 'bt1', url: 'http://127.0.0.1:3080', title: 'dsh', location: 'center' },
      ] as never,
      browserTabsById: {
        bt1: { id: 'bt1', url: 'http://127.0.0.1:3080', title: 'dsh', location: 'center' },
      } as never,
      browserActiveTabId: 'bt1',
    });

    renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: /deepseek harness/i }));

    await vi.waitFor(() => {
      expect(useAppStore.getState().centerTabs.some((c) => c.id === 'c1')).toBe(false);
    });
    const s = useAppStore.getState();
    expect(s.centerTabs).toEqual([expect.objectContaining({ id: 'c2', refId: 'bt1' })]);
    expect(s.centerActiveTabId).toBe('c2');
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
    // spyOn（afterEach restoreAllMocks 复位）而非 setState 覆写，避免污染后续用例的 store。
    const showToast = vi.spyOn(useAppStore.getState(), 'showToast');

    renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: /deepseek harness/i }));

    await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith('打开失败', 'error'));
  });

  it('源状态确认无可用版本时拦截打开并 toast 提示，不调桥不建标签', async () => {
    const open = vi.fn(async () => ({
      ok: true,
      data: { url: 'http://127.0.0.1:3080', freedPort: false },
    }));
    const getSourceStatus = vi.fn(async () => ({ ok: false, error: { code: 'X', message: 'x' } }));
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      dsh: { open, getSourceStatus },
    };
    useAppStore.setState({
      sourceStatus: {
        versionSource: {
          mode: 'host',
          effective: 'none',
          resolvedByMode: { auto: 'none', host: 'none', system: 'none' },
          hostVersion: null,
        },
      } as unknown as DshSourceStatus,
    });
    // spyOn（afterEach restoreAllMocks 复位）而非 setState 覆写，避免污染后续用例。
    const showToast = vi.spyOn(useAppStore.getState(), 'showToast');

    renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: /deepseek harness/i }));

    await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith('暂无可用版本', 'warning'));
    expect(open).not.toHaveBeenCalled();
    expect(useAppStore.getState().centerTabs.some((c) => c.id === 'c1')).toBe(true);
    expect(useAppStore.getState().browserTabs).toHaveLength(0);
  });

  it('浏览器标签未激活时保留入口页标签（!newId 守卫）', () => {
    // browserOpenTab 未激活任何标签（异常/边界）：不得就地转换、不得抛错。
    vi.spyOn(useAppStore.getState(), 'browserOpenTab').mockImplementation(() => {
      useAppStore.setState({ browserActiveTabId: '' });
    });

    renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: '打开浏览器' }));

    const center = useAppStore.getState().centerTabs.find((c) => c.id === 'c1');
    expect(center?.kind).toBe('launcher');
  });

  it('openDsh 在途不禁用任何入口（重复点击给 busy 提示，迟到完成不误删）', async () => {
    let resolveOpen: (v: unknown) => void = () => {};
    const open = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve;
        }),
    );
    (window as unknown as { digitalLife: unknown }).digitalLife = { dsh: { open } };
    const showToast = vi.spyOn(useAppStore.getState(), 'showToast');

    const { container } = renderLauncher();
    fireEvent.click(screen.getByRole('button', { name: /deepseek harness/i }));

    // 在途只置 aria-busy，不禁用任何按钮（用户明确要求：永不灰化）。
    await vi.waitFor(() => {
      expect(container.querySelector('.adl-launcher-entries')?.getAttribute('aria-busy')).toBe(
        'true',
      );
      for (const button of screen.getAllByRole('button')) {
        expect((button as HTMLButtonElement).disabled).toBe(false);
      }
    });
    // 在途重复点击：走 in-flight 复用，不重复拉起，给 busy 提示。
    fireEvent.click(screen.getByRole('button', { name: /deepseek harness/i }));
    await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith('稍候再试', 'warning'));
    expect(open).toHaveBeenCalledTimes(1);
    // 在途时点开浏览器就地转换：迟到完成的 openDsh 不得移除已转换标签。
    fireEvent.click(screen.getByRole('button', { name: '打开浏览器' }));
    expect(useAppStore.getState().centerTabs.find((c) => c.id === 'c1')?.kind).toBe('browser');

    // 收尾：放行在途 promise，避免遗留未处理任务。
    resolveOpen({ ok: true, data: { url: 'http://127.0.0.1:3080', freedPort: false } });
    // 迟到完成后标签仍是用户转换出的 browser（未被误删）。
    await vi.waitFor(() => {
      const center = useAppStore.getState().centerTabs.find((c) => c.id === 'c1');
      expect(center?.kind).toBe('browser');
    });
  });
});

describe('CenterPane 调度', () => {
  it('centerTabs 为空时渲染 launcher 并补齐一个 launcher 标签（首启不变量）', () => {
    useAppStore.setState({ centerTabs: [], centerActiveTabId: '' });

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

describe('CenterEntryPage narrow-width clipping (事项 4)', () => {
  it('keeps entry labels single-line with hard clipping instead of vertical wrapping', () => {
    // jsdom 下 import.meta.url 非 file 协议，改用 cwd（vitest root = frontend）定位 CSS。
    const css = readFileSync(join(process.cwd(), 'src/styles/regions/center-entry.css'), 'utf8');
    expect(css).toContain('.adl-launcher-entry > span');
    expect(css).toContain('white-space: nowrap');
    // 卷帘门式硬裁剪（非省略号），且按钮本体不再允许换行。
    expect(css).toContain('text-overflow: clip');
    expect(css).not.toMatch(/\.adl-launcher-entry\s*\{[^}]*white-space:\s*normal/);
  });

  it('aligns icons in a fixed gutter while left-aligning text (事项 8)', () => {
    // 图标固定列纵向对齐 + 文本左对齐贴图标：等宽按钮无翻转跳动（P4-R1-R2-1）。
    const css = readFileSync(join(process.cwd(), 'src/styles/regions/center-entry.css'), 'utf8');
    expect(css).toContain('grid-template-columns: 24px minmax(0, 1fr)');
    expect(css).toContain('.adl-launcher-entry > svg');
    expect(css).toContain('text-align: left');
  });
});
