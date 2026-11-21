import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { zhCN } from '@i18n/zh-CN';
import { PushPreflightDialog } from './PushPreflightDialog';

function renderDialog(overrides: Partial<Parameters<typeof PushPreflightDialog>[0]> = {}) {
  const onCancel = vi.fn();
  const onPushOnly = vi.fn();
  const onCommitAndPush = vi.fn();
  const view = render(
    <PushPreflightDialog
      open
      dirty
      hasUpstream={false}
      branch="main"
      t={zhCN}
      onCancel={onCancel}
      onPushOnly={onPushOnly}
      onCommitAndPush={onCommitAndPush}
      {...overrides}
    />,
  );
  return { ...view, onCancel, onPushOnly, onCommitAndPush };
}

describe('PushPreflightDialog', () => {
  it('dirty + no upstream：合并展示两条提示与三个动作', () => {
    const { onCancel, onPushOnly, onCommitAndPush } = renderDialog();
    expect(screen.getByText(zhCN.changesPushDirtyNotice)).toBeTruthy();
    expect(screen.getByText(zhCN.changesPushNoUpstreamNotice)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: zhCN.changesPushOnly }));
    expect(onPushOnly).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: zhCN.changesCommitAndPush }));
    expect(onCommitAndPush).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: zhCN.cancel }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('中间动作与取消/主按钮同属 soft 语义变体', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: zhCN.changesPushOnly }).className).toContain(
      'adl-btn--neutral-soft',
    );
  });

  it('clean + no upstream：只保留推送并设置上游', () => {
    const { onPushOnly } = renderDialog({ dirty: false });
    expect(screen.queryByRole('button', { name: zhCN.changesPushOnly })).toBeNull();
    const primary = screen.getByRole('button', { name: zhCN.changesPushAndSetUpstream });
    fireEvent.click(primary);
    expect(onPushOnly).toHaveBeenCalledTimes(1);
  });

  it('Escape 取消', () => {
    const { onCancel } = renderDialog();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('初始焦点在主按钮，Tab 在对话框内环绕（aria-modal 契约）', () => {
    renderDialog();
    const primary = screen.getByRole('button', { name: zhCN.changesCommitAndPush });
    expect(document.activeElement).toBe(primary);

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: zhCN.cancel }));
  });
});
