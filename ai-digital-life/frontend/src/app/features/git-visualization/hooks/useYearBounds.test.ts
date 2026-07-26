import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { useYearBounds } from './useYearBounds';

const mockGitVisFirstCommitYear = vi.fn();

beforeEach(() => {
  (window as any).digitalLife = {
    workspace: {
      gitVisFirstCommitYear: mockGitVisFirstCommitYear,
    },
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('returns yearBounds when firstCommitYear is fetched', async () => {
  mockGitVisFirstCommitYear.mockResolvedValueOnce({ ok: true, data: 2020 });
  const { result } = renderHook(() => useYearBounds('/path/to/repo'));
  await waitFor(() =>
    expect(result.current.yearBounds).toEqual({ min: 2020, max: new Date().getFullYear() }),
  );
});

it('returns loading true while fetching', () => {
  mockGitVisFirstCommitYear.mockReturnValueOnce(new Promise(() => {}));
  const { result } = renderHook(() => useYearBounds('/path/to/repo'));
  expect(result.current.loading).toBe(true);
  expect(result.current.yearBounds).toBeNull();
});

it('returns null yearBounds when rootPath is empty', () => {
  const { result } = renderHook(() => useYearBounds(''));
  expect(result.current.yearBounds).toBeNull();
  expect(result.current.loading).toBe(false);
});

it('does not update state after unmount', async () => {
  let resolvePromise!: (v: any) => void;
  mockGitVisFirstCommitYear.mockReturnValue(
    new Promise((resolve) => {
      resolvePromise = resolve;
    }),
  );
  const { result, unmount } = renderHook(() => useYearBounds('/path/repo'));
  expect(result.current.loading).toBe(true);

  unmount();
  resolvePromise({ ok: true, data: 2020 });

  // Small delay to let microtasks settle
  await new Promise((r) => setTimeout(r, 10));
  expect(result.current.loading).toBe(true);
  expect(result.current.yearBounds).toBeNull();
});
