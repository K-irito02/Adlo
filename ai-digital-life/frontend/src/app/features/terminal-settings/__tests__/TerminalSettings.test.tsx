import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TerminalSettings, budgetBytesFromGb, budgetOptionsGb } from '../TerminalSettings';

vi.mock('@stores/slicedStore', () => ({
  useAppStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({ appInfo: { config: { terminalHistoryBudgetBytes: 1 << 30 } } }),
    { getState: () => ({ updatePreferences: vi.fn() }) },
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
    },
  }),
}));

describe('budgetOptionsGb / budgetBytesFromGb', () => {
  it('档位与换算正确', () => {
    expect(budgetOptionsGb).toEqual([1, 2, 5, 10, 20]);
    expect(budgetBytesFromGb(2)).toBe(2 * (1 << 30));
  });
});

describe('TerminalSettings', () => {
  it('渲染预算设置项与当前档位', () => {
    render(<TerminalSettings />);
    expect(screen.getByText('只读历史磁盘预算')).toBeTruthy();
    expect(screen.getByRole('combobox')).toHaveProperty('value', String(1 << 30));
  });

  it('包含「跟随磁盘剩余空间」与「自定义…」选项', () => {
    render(<TerminalSettings />);
    expect(screen.getByText('跟随磁盘剩余空间')).toBeTruthy();
    expect(screen.getByText('自定义…')).toBeTruthy();
  });

  it('切到自定义档时出现数字输入框', async () => {
    render(<TerminalSettings />);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'custom');
    expect(screen.getByRole('spinbutton')).toBeTruthy();
  });
});
