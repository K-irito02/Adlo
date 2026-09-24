import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { budgetBytesFromGb, budgetOptionsGb } from '@features/terminal/terminalHistoryBudget';
import { TerminalHistoryBudgetSection } from '../TerminalHistoryBudgetSection';

/**
 * 偏好 store 的最小替身：
 * - `configuredBytes` 是「已落库」的值，测试可随时改写后 `rerender` 来模拟 store 回写；
 * - `updatePreferences` 是**共享的** spy（原先是每次调用都返回全新的 `vi.fn()`，无法断言），
 *   且与真实 store 一样**非乐观**——只 resolve，不自动改 `configuredBytes`。
 */
const mocks = vi.hoisted(() => ({
  state: {
    configuredBytes: 1 << 30,
    updatePreferences: vi.fn((patch: { terminalHistoryBudgetBytes?: number }) =>
      Promise.resolve(patch),
    ),
  },
}));

vi.mock('@stores/slicedStore', () => ({
  useAppStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({
        appInfo: { config: { terminalHistoryBudgetBytes: mocks.state.configuredBytes } },
      }),
    { getState: () => ({ updatePreferences: mocks.state.updatePreferences }) },
  ),
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      settingsTerminal: '终端',
      settingsTerminalHistoryGroupDesc: '管理终端的历史存储与显示行为',
      settingsTerminalHistoryBudget: '只读历史磁盘预算',
      settingsTerminalHistoryBudgetDesc: '低于上限时不会自动删除任何历史；超过后才按最旧优先淘汰',
      settingsTerminalHistoryBudgetCustom: '自定义…',
      settingsTerminalHistoryBudgetFollowDisk: '跟随磁盘剩余空间',
      settingsTerminalHistoryBudgetFollowDiskDesc: '按系统盘剩余空间估算上限，并预留 1GB 给系统',
      settingsTerminalHistoryBudgetUsed: '已用 {used}，上限 {limit}',
      settingsTerminalHistoryBudgetUnitLabel: '容量单位',
      settingsTerminalHistoryBudgetUnitMb: 'MB',
      settingsTerminalHistoryBudgetUnitGb: 'GB',
    },
  }),
}));

const FOLLOW_DISK_DESC = '按系统盘剩余空间估算上限，并预留 1GB 给系统';

beforeEach(() => {
  mocks.state.configuredBytes = 1 << 30;
  mocks.state.updatePreferences.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('budgetOptionsGb / budgetBytesFromGb', () => {
  it('档位与换算正确', () => {
    expect(budgetOptionsGb).toEqual([1, 2, 5, 10, 20]);
    expect(budgetBytesFromGb(2)).toBe(2 * (1 << 30));
  });
});

describe('TerminalHistoryBudgetSection', () => {
  it('渲染预算设置项与当前档位', () => {
    render(<TerminalHistoryBudgetSection />);
    expect(screen.getByText('只读历史磁盘预算')).toBeTruthy();
    expect(screen.getByRole('button', { name: '只读历史磁盘预算' }).textContent).toContain('1 GB');
  });

  it('包含「跟随磁盘剩余空间」与「自定义…」选项', () => {
    render(<TerminalHistoryBudgetSection />);
    fireEvent.click(screen.getByRole('button', { name: '只读历史磁盘预算' }));
    expect(screen.getByRole('option', { name: '跟随磁盘剩余空间' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '自定义…' })).toBeTruthy();
  });

  it('切到自定义档时出现数字输入框', () => {
    render(<TerminalHistoryBudgetSection />);
    fireEvent.click(screen.getByRole('button', { name: '只读历史磁盘预算' }));
    fireEvent.click(screen.getByRole('option', { name: '自定义…' }));
    expect(screen.getByRole('spinbutton')).toBeTruthy();
  });

  it('自定义档把数值输入放在档位下拉左侧', () => {
    render(<TerminalHistoryBudgetSection />);
    fireEvent.click(screen.getByRole('button', { name: '只读历史磁盘预算' }));
    fireEvent.click(screen.getByRole('option', { name: '自定义…' }));
    const input = screen.getByRole('spinbutton');
    const select = screen.getByRole('button', { name: '只读历史磁盘预算' });
    expect(
      input.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING,
      'input should appear before the preset select',
    ).toBeTruthy();
    expect(input.closest('.adl-settings-row__control--inline')).not.toBeNull();
    expect(input.classList.contains('adl-settings-input--narrow')).toBe(true);
  });

  it('预算行与已用行无分隔线、收紧间距，预算行控件垂直居中', () => {
    render(<TerminalHistoryBudgetSection />);
    const rows = document.querySelectorAll('.adl-terminal-settings > .adl-settings-row');
    expect(rows.length).toBe(2);
    expect(rows[0].classList.contains('adl-settings-row--no-divider')).toBe(true);
    expect(rows[0].classList.contains('adl-settings-row--path-center')).toBe(true);
    expect(rows[1].classList.contains('adl-settings-row--compact')).toBe(true);
  });

  it('自定义档提供 MB/GB 单位下拉，切单位按同一预算换算草稿且不提交', () => {
    mocks.state.configuredBytes = budgetBytesFromGb(3);
    render(<TerminalHistoryBudgetSection />);
    // 非档位 3GB → 自定义态，草稿 '3' GB。
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('3');
    const unitSelect = screen.getByRole('button', { name: '容量单位' });
    expect(unitSelect.textContent).toContain('GB');
    fireEvent.click(unitSelect);
    fireEvent.click(screen.getByRole('option', { name: 'MB' }));
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('3072');
    expect(screen.getByRole('button', { name: '容量单位' }).textContent).toContain('MB');
    // 切单位只是换算显示，不写桥。
    expect(mocks.state.updatePreferences).not.toHaveBeenCalled();
  });

  it('切到 MB 后输入按 MB 换算提交', () => {
    render(<TerminalHistoryBudgetSection />);
    selectBudgetOption('自定义…');
    fireEvent.click(screen.getByRole('button', { name: '容量单位' }));
    fireEvent.click(screen.getByRole('option', { name: 'MB' }));
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('1024');

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: '2048' } });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    vi.useRealTimers();

    expect(mocks.state.updatePreferences).toHaveBeenCalledTimes(1);
    expect(mocks.state.updatePreferences).toHaveBeenCalledWith({
      terminalHistoryBudgetBytes: budgetBytesFromGb(2),
    });
  });

  it('外部恢复默认在打字中途到达时丢弃在途草稿，不让旧输入覆盖', () => {
    mocks.state.configuredBytes = budgetBytesFromGb(3);
    const { rerender } = render(<TerminalHistoryBudgetSection />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: '9' } });
    // 外部写入另一非档位值：草稿重播种，仍在自定义态。
    mocks.state.configuredBytes = budgetBytesFromGb(7);
    rerender(<TerminalHistoryBudgetSection />);
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('7');
    // 外部恢复默认档：退出自定义态。
    mocks.state.configuredBytes = budgetBytesFromGb(1);
    rerender(<TerminalHistoryBudgetSection />);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(triggerLabel()).toContain('1 GB');
    // 在途草稿已被丢弃：防抖到期也不写桥。
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    vi.useRealTimers();
    expect(mocks.state.updatePreferences).not.toHaveBeenCalled();
  });
});

function triggerLabel(): string {
  return screen.getByRole('button', { name: '只读历史磁盘预算' }).textContent ?? '';
}

function selectBudgetOption(name: string) {
  fireEvent.click(screen.getByRole('button', { name: '只读历史磁盘预算' }));
  fireEvent.click(screen.getByRole('option', { name }));
}

describe('TerminalHistoryBudgetSection 自定义预算输入', () => {
  function renderInCustomMode() {
    const view = render(<TerminalHistoryBudgetSection />);
    selectBudgetOption('自定义…');
    return { ...view, input: screen.getByRole('spinbutton') as HTMLInputElement };
  }

  it('逐键输入不写回偏好，停顿 500ms 后只提交最终值', async () => {
    const { input } = renderInCustomMode();

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.change(input, { target: { value: '128' } });

    // 每次按键都写回会在并发 patch 被丢弃/写失败时静默丢掉用户输入。
    expect(mocks.state.updatePreferences).not.toHaveBeenCalled();
    expect(input.value).toBe('128');

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mocks.state.updatePreferences).toHaveBeenCalledTimes(1);
    expect(mocks.state.updatePreferences).toHaveBeenCalledWith({
      terminalHistoryBudgetBytes: budgetBytesFromGb(128),
    });
    expect(input.value).toBe('128');
  });

  it('停顿不足 500ms 的输入不会提交任何值', async () => {
    const { input } = renderInCustomMode();

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: '7' } });
    act(() => {
      vi.advanceTimersByTime(499);
    });

    expect(mocks.state.updatePreferences).not.toHaveBeenCalled();
    expect(input.value).toBe('7');
  });

  it('输入恰好等于预设档位时，store 回写不会把输入框在编辑中途卸载', async () => {
    // 起始值是非档位值 3 GB：此时编辑态是从偏好派生出来的，输入 5 GB 会让派生值翻转。
    mocks.state.configuredBytes = budgetBytesFromGb(3);
    const { rerender } = render(<TerminalHistoryBudgetSection />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('3');

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: '5' } });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    vi.useRealTimers();

    expect(mocks.state.updatePreferences).toHaveBeenCalledWith({
      terminalHistoryBudgetBytes: budgetBytesFromGb(5),
    });

    // store 把 5 GB 回写下来：它正是本组件刚提交的值，不能据此把编辑态收回去。
    mocks.state.configuredBytes = budgetBytesFromGb(5);
    rerender(<TerminalHistoryBudgetSection />);

    expect(screen.getByRole('spinbutton')).toBe(input);
    expect(triggerLabel()).toContain('自定义…');
  });

  it('外部写入非档位值时进入自定义档，草稿重新播种并跟上外部值', () => {
    const { rerender } = render(<TerminalHistoryBudgetSection />);
    expect(triggerLabel()).toContain('1 GB');

    mocks.state.configuredBytes = budgetBytesFromGb(3);
    rerender(<TerminalHistoryBudgetSection />);

    expect(triggerLabel()).toContain('自定义…');
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('3');
  });

  it('外部写回跟随磁盘时收回编辑态（如「重置全部」）', async () => {
    const { rerender } = renderInCustomMode();
    expect(screen.getByRole('spinbutton')).toBeTruthy();

    mocks.state.configuredBytes = 0;
    rerender(<TerminalHistoryBudgetSection />);

    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(triggerLabel()).toContain('跟随磁盘剩余空间');
  });

  it('存储值 0 渲染为「跟随磁盘剩余空间」档，而不是任何预设档位', () => {
    mocks.state.configuredBytes = 0;
    render(<TerminalHistoryBudgetSection />);

    expect(triggerLabel()).toContain('跟随磁盘剩余空间');
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.getByText(FOLLOW_DISK_DESC)).toBeTruthy();
    expect(screen.getByText(/上限 跟随磁盘剩余空间/)).toBeTruthy();
  });

  it('改选档位会丢弃在途的自定义输入，不让旧草稿覆盖新选择', async () => {
    const { input } = renderInCustomMode();

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: '128' } });
    selectBudgetOption('2 GB');
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mocks.state.updatePreferences).toHaveBeenCalledTimes(1);
    expect(mocks.state.updatePreferences).toHaveBeenCalledWith({
      terminalHistoryBudgetBytes: budgetBytesFromGb(2),
    });
  });

  it('从跟随磁盘切到「自定义…」时，隐藏跟随磁盘说明行并把上限换成草稿值', async () => {
    mocks.state.configuredBytes = 0;
    render(<TerminalHistoryBudgetSection />);
    expect(screen.getByText(FOLLOW_DISK_DESC)).toBeTruthy();

    selectBudgetOption('自定义…');

    expect(screen.queryByText(FOLLOW_DISK_DESC)).toBeNull();
    expect(screen.getByText(/上限 1 GB/)).toBeTruthy();
  });
});
