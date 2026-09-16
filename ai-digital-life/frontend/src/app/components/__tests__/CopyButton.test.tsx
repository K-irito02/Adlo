import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TCopyProvider } from '@i18n/TCopyContext';
import { CopyButton } from '../CopyButton';

vi.mock('lucide-animated', () => ({
  CopyIcon: () => <svg data-testid="copy-icon" />,
}));

const mockT = {
  copySuccessClipboard: '已复制到剪贴板',
  fileCopyBranchName: '复制',
} as never;

function renderButton(props: Parameters<typeof CopyButton>[0]) {
  render(
    <TCopyProvider t={mockT} locale="zh-CN">
      <CopyButton {...props} />
    </TCopyProvider>,
  );
  return screen.getByRole('button');
}

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CopyButton', () => {
  it('writes text and shows the copied state', async () => {
    const btn = renderButton({ text: 'hello' });
    expect(btn.getAttribute('aria-label')).toBe('复制');
    fireEvent.click(btn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
    await waitFor(() => expect(btn.getAttribute('aria-label')).toBe('已复制到剪贴板'));
  });

  it('falls back to execCommand when the clipboard API is unavailable', () => {
    Object.assign(navigator, { clipboard: undefined });
    const execCommand = vi.fn();
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    const btn = renderButton({ text: 'hello' });
    fireEvent.click(btn);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('marks copied after a custom onCopy resolves true', async () => {
    const onCopy = vi.fn().mockResolvedValue(true);
    const btn = renderButton({ onCopy });
    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute('aria-label')).toBe('已复制到剪贴板'));
  });

  it('does not mark copied when a custom onCopy resolves false', async () => {
    const onCopy = vi.fn().mockResolvedValue(false);
    const btn = renderButton({ onCopy });
    fireEvent.click(btn);
    await Promise.resolve();
    await Promise.resolve();
    expect(btn.getAttribute('aria-label')).toBe('复制');
  });

  it('swallows a rejected custom onCopy without unhandled rejection', async () => {
    const onCopy = vi.fn().mockRejectedValue(new Error('boom'));
    const btn = renderButton({ onCopy });
    fireEvent.click(btn);
    await Promise.resolve();
    await Promise.resolve();
    expect(btn.getAttribute('aria-label')).toBe('复制');
  });

  it('does nothing when neither text nor onCopy is provided', () => {
    const btn = renderButton({});
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-label')).toBe('复制');
  });
});
