import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommitDialog } from './CommitDialog';

const baseProps = {
  open: true,
  title: 'Commit changes',
  messageLabel: 'Commit message',
  placeholder: 'Describe',
  stageAllLabel: 'Stage all and commit',
  submitLabel: 'Commit',
  submittingLabel: 'Committing…',
  emptyMessage: 'Commit message cannot be empty',
  cancelLabel: 'Cancel',
  submitting: false,
  onCancel: () => {},
  onSubmit: () => {},
};

describe('CommitDialog', () => {
  it('defaults to staging everything and submits the trimmed message', () => {
    const onSubmit = vi.fn();
    render(<CommitDialog {...baseProps} onSubmit={onSubmit} />);

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  feat: x  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));

    expect(onSubmit).toHaveBeenCalledWith('feat: x', true);
  });

  it('honors an unchecked stage-all option', () => {
    const onSubmit = vi.fn();
    render(<CommitDialog {...baseProps} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'chore: y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));

    expect(onSubmit).toHaveBeenCalledWith('chore: y', false);
  });

  it('blocks submit for an empty message and surfaces the error', () => {
    const onSubmit = vi.fn();
    render(<CommitDialog {...baseProps} onSubmit={onSubmit} />);

    const submit = screen.getByRole('button', { name: 'Commit' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(baseProps.emptyMessage);
  });

  it('submits with Ctrl+Enter', () => {
    const onSubmit = vi.fn();
    render(<CommitDialog {...baseProps} onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'feat: keyboard' } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });

    expect(onSubmit).toHaveBeenCalledWith('feat: keyboard', true);
  });

  it('disables inputs and shows the submitting label while in flight', () => {
    const onSubmit = vi.fn();
    render(<CommitDialog {...baseProps} submitting onSubmit={onSubmit} />);

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Committing…' })).toBeTruthy();
  });

  it('shows a submit failure message inside the dialog', () => {
    render(<CommitDialog {...baseProps} error="nothing to commit" />);
    expect(
      screen.getAllByRole('alert').some((node) => node.textContent === 'nothing to commit'),
    ).toBe(true);
  });

  it('does not render when closed', () => {
    render(<CommitDialog {...baseProps} open={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
