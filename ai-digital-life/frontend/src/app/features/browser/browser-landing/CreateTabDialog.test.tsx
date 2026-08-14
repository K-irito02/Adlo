import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CreateTabDialog } from './CreateTabDialog';

const t = {
  browserNewBookmark: '新建书签',
  browserEditBookmark: '编辑书签',
  browserBookmarkName: '书签名称',
  browserTabUrl: '网址',
  browserBookmarkSaveOnly: '仅保存',
  browserBookmarkSaveAndOpen: '保存并打开',
  browserAddPortInvalid: '网址无效',
  browserClose: '关闭',
} as Record<string, string>;

describe('CreateTabDialog', () => {
  it('renders save-and-open and save-only buttons, no cancel button', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<CreateTabDialog open t={t} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByRole('button', { name: '保存并打开' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '仅保存' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull();
  });

  it('calls onConfirm with save-and-open mode when save-and-open clicked', () => {
    const onConfirm = vi.fn();
    render(<CreateTabDialog open t={t} onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('网址'), {
      target: { value: 'example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存并打开' }));
    expect(onConfirm).toHaveBeenCalledWith('', 'https://example.com', 'save-and-open');
  });

  it('calls onConfirm with save-only mode when save-only clicked', () => {
    const onConfirm = vi.fn();
    render(<CreateTabDialog open t={t} onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('网址'), {
      target: { value: 'example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '仅保存' }));
    expect(onConfirm).toHaveBeenCalledWith('', 'https://example.com', 'save-only');
  });
});
