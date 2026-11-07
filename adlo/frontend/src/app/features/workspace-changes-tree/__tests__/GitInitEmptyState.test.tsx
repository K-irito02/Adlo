import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GitInitEmptyState } from '../GitInitEmptyState';
import { shouldShowGitInitEmptyState } from '../gitInitEmptyStateUtils';

const { initGitRepo } = vi.hoisted(() => ({ initGitRepo: vi.fn() }));

vi.mock('@stores/slicedStore', () => ({
  useAppStore: { getState: () => ({ initGitRepo }) },
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      changesNonGitRepoTitle: '非 Git 仓库',
      changesNonGitRepoInitAction: '初始化为 Git 仓库',
      changesNonGitRepoInitializing: '正在初始化…',
      changesNonGitRepoHintLabel: '非 Git 仓库说明',
      changesNonGitRepoHint: '# 标题\n正文',
    },
    locale: 'zh-CN',
    formatT: vi.fn(),
  }),
}));

describe('shouldShowGitInitEmptyState', () => {
  it('只在明确 isRepo=false 时显示', () => {
    expect(shouldShowGitInitEmptyState(undefined)).toBe(false);
    expect(shouldShowGitInitEmptyState({ isRepo: true })).toBe(false);
    expect(shouldShowGitInitEmptyState({ isRepo: false })).toBe(true);
  });
});

describe('GitInitEmptyState', () => {
  beforeEach(() => {
    initGitRepo.mockReset();
    initGitRepo.mockResolvedValue(true);
  });

  it('点击按钮以目标工作区路径调用 initGitRepo', () => {
    render(<GitInitEmptyState workspaceId="ws-1" workspacePath="/target-ws" />);
    fireEvent.click(screen.getByRole('button'));
    expect(initGitRepo).toHaveBeenCalledWith('ws-1', '/target-ws');
  });

  it('点击感叹号只查看说明，不触发初始化', () => {
    render(<GitInitEmptyState workspaceId="ws-1" workspacePath="/target-ws" />);
    fireEvent.click(screen.getByRole('img', { name: '非 Git 仓库说明' }));
    expect(initGitRepo).not.toHaveBeenCalled();
  });

  it('初始化期间按钮禁用并显示进行中文案', async () => {
    let resolveInit: ((value: boolean) => void) | undefined;
    initGitRepo.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveInit = resolve;
        }),
    );
    render(<GitInitEmptyState workspaceId="ws-1" workspacePath="/target-ws" />);
    const button = screen.getByRole('button') as HTMLButtonElement;
    fireEvent.click(button);

    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('正在初始化…');

    await act(async () => {
      resolveInit?.(true);
    });
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('初始化为 Git 仓库');
  });

  it('失败信息内联可见', () => {
    render(
      <GitInitEmptyState workspaceId="ws-1" workspacePath="/target-ws" error="git init failed" />,
    );
    expect(screen.getByText('git init failed')).toBeTruthy();
  });
});
