import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toast } from './Toast';

describe('Toast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds the text-shimmer class for loading toasts', () => {
    render(<Toast message="正在自动恢复…" shimmer onClose={vi.fn()} />);
    const toast = screen.getByRole('alert');
    expect(toast.querySelector('.adl-toast__message--shimmer')).not.toBeNull();
    expect(toast.textContent).toContain('正在自动恢复…');
  });

  it('keeps the plain message class for non-loading toasts', () => {
    render(<Toast message="已保存" type="success" onClose={vi.fn()} />);
    const toast = screen.getByRole('alert');
    expect(toast.querySelector('.adl-toast__message--shimmer')).toBeNull();
  });

  it('auto-closes after the default duration', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Toast message="已保存" type="success" onClose={onClose} />);
    vi.advanceTimersByTime(3000 + 300);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open indefinitely when duration is 0 (loading toast)', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Toast message="正在自动恢复…" shimmer duration={0} onClose={onClose} />);
    vi.advanceTimersByTime(600_000);
    expect(onClose).not.toHaveBeenCalled();
  });
});
