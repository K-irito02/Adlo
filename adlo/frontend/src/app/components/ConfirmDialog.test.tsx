import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

const baseProps = {
  open: true,
  title: 'Discard all',
  message: 'Cannot be undone',
  confirmLabel: 'Discard',
  cancelLabel: 'Cancel',
  onConfirm: () => {},
  onCancel: () => {},
};

describe('ConfirmDialog', () => {
  it('confirms and cancels', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while busy', () => {
    render(<ConfirmDialog {...baseProps} busy />);

    expect((screen.getByRole('button', { name: 'Discard' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('focuses the confirm button and traps Tab inside the dialog', () => {
    render(<ConfirmDialog {...baseProps} />);
    const confirm = screen.getByRole('button', { name: 'Discard' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });

    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it('renders optional details before the question', () => {
    render(
      <ConfirmDialog
        {...baseProps}
        details={
          <ul>
            <li>node.exe (PID 42)</li>
          </ul>
        }
        question="End it and restart?"
      />,
    );
    const dialog = screen.getByRole('dialog');
    const html = dialog.innerHTML;
    expect(html.indexOf('node.exe (PID 42)')).toBeGreaterThan(-1);
    expect(html.indexOf('node.exe (PID 42)')).toBeLessThan(html.indexOf('End it and restart?'));
  });
});
