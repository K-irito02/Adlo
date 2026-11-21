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
    const { onPushOnly, onCommitAndPush } = renderDialog();
    expect(screen.getByText(zhCN.changesPushDirtyNotice)).toBeTruthy();
    expect(screen.getByText(zhCN.changesPushNoUpstreamNotice)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: zhCN.changesPushOnly }));
    expect(onPushOnly).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: zhCN.changesCommitAndPush }));
    expect(onCommitAndPush).toHaveBeenCalledTimes(1);
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
});
