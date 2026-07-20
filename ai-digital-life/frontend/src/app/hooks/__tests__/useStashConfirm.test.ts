import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStashConfirm } from '../useStashConfirm';
import type { GitSnapshot } from '@ai-digital-life/kernel';

const cleanSnapshot: GitSnapshot = {
  isRepo: true,
  branch: 'main',
  head: 'abc123',
  staged: [] as string[],
  unstaged: [] as string[],
  untracked: [] as string[],
  conflicts: [] as string[],
  ahead: undefined,
  behind: undefined,
  capturedAt: 0,
};

const dirtySnapshot: GitSnapshot = {
  ...cleanSnapshot,
  staged: ['file.ts'],
};

describe('useStashConfirm', () => {
  it('switches directly when clean', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useStashConfirm({ snapshot: cleanSnapshot, onConfirm }));
    act(() => result.current.initiateSwitch({ branchName: 'feature', allowStash: false }));
    expect(onConfirm).toHaveBeenCalledWith({
      kind: 'switch',
      input: { branchName: 'feature', allowStash: false },
    });
    expect(result.current.needsConfirm).toBe(false);
  });

  it('sets pending when dirty', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useStashConfirm({ snapshot: dirtySnapshot, onConfirm }));
    act(() => result.current.initiateSwitch({ branchName: 'feature', allowStash: false }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(result.current.needsConfirm).toBe(true);
  });

  it('calls onConfirm with allowStash:true after confirm', async () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useStashConfirm({ snapshot: dirtySnapshot, onConfirm }));
    act(() => result.current.initiateSwitch({ branchName: 'feature', allowStash: false }));
    await act(async () => result.current.confirm());
    expect(onConfirm).toHaveBeenCalledWith({
      kind: 'switch',
      input: { branchName: 'feature', allowStash: true },
    });
  });

  it('clears pending on cancel', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useStashConfirm({ snapshot: dirtySnapshot, onConfirm }));
    act(() => result.current.initiateSwitch({ branchName: 'feature', allowStash: false }));
    act(() => result.current.cancel());
    expect(result.current.needsConfirm).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('initiateCreate works directly when clean', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useStashConfirm({ snapshot: cleanSnapshot, onConfirm }));
    act(() =>
      result.current.initiateCreate({
        branchName: 'new-branch',
        baseBranch: 'main',
        allowStash: false,
      }),
    );
    expect(onConfirm).toHaveBeenCalledWith({
      kind: 'create',
      input: { branchName: 'new-branch', baseBranch: 'main', allowStash: false },
    });
    expect(result.current.needsConfirm).toBe(false);
  });

  it('initiateCreate sets pending when dirty', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useStashConfirm({ snapshot: dirtySnapshot, onConfirm }));
    act(() =>
      result.current.initiateCreate({
        branchName: 'new-branch',
        baseBranch: 'main',
        allowStash: false,
      }),
    );
    expect(onConfirm).not.toHaveBeenCalled();
    expect(result.current.needsConfirm).toBe(true);
  });

  it('initiateCreate confirms with allowStash:true when dirty', async () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useStashConfirm({ snapshot: dirtySnapshot, onConfirm }));
    act(() =>
      result.current.initiateCreate({
        branchName: 'new-branch',
        baseBranch: 'main',
        allowStash: false,
      }),
    );
    await act(async () => result.current.confirm());
    expect(onConfirm).toHaveBeenCalledWith({
      kind: 'create',
      input: { branchName: 'new-branch', baseBranch: 'main', allowStash: true },
    });
    expect(result.current.needsConfirm).toBe(false);
  });

  it('sets pendingAction via setPending', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useStashConfirm({ snapshot: cleanSnapshot, onConfirm }));
    const action = { kind: 'switch' as const, input: { branchName: 'feature', allowStash: false } };
    act(() => result.current.setPendingAction(action));
    expect(result.current.pendingAction).toEqual(action);
    expect(result.current.needsConfirm).toBe(true);
  });

  it('noops confirm when no pending action', async () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useStashConfirm({ snapshot: cleanSnapshot, onConfirm }));
    await act(async () => result.current.confirm());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('handles undefined snapshot gracefully', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useStashConfirm({ snapshot: undefined, onConfirm }));
    act(() => result.current.initiateSwitch({ branchName: 'feature', allowStash: false }));
    // undefined snapshot = no dirty changes, so switches directly
    expect(onConfirm).toHaveBeenCalledWith({
      kind: 'switch',
      input: { branchName: 'feature', allowStash: false },
    });
    expect(result.current.needsConfirm).toBe(false);
  });
});
