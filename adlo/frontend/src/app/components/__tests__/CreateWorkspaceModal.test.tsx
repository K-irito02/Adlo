import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TCopyProvider } from '@i18n/TCopyContext';
import { zhCN } from '@i18n/zh-CN';
import { CreateWorkspaceModal } from '../CreateWorkspaceModal';

beforeEach(() => {
  localStorage.removeItem('adl_workspace_default_create_dir');
});

afterEach(() => {
  cleanup();
});

function renderModal(onOpenWorkspace = vi.fn().mockResolvedValue({ ok: true })) {
  const view = render(
    <TCopyProvider t={zhCN} locale="zh-CN">
      <CreateWorkspaceModal
        open
        onPickWorkspaceDirectory={vi.fn().mockResolvedValue(undefined)}
        onOpenWorkspace={onOpenWorkspace}
        onClose={vi.fn()}
      />
    </TCopyProvider>,
  );
  return { ...view, onOpenWorkspace };
}

function switchMode(container: HTMLElement, optionLabel: string) {
  const drop = container.querySelector('.adl-split-btn__drop');
  expect(drop).toBeTruthy();
  fireEvent.mouseEnter(drop as HTMLElement);
  fireEvent.click(screen.getByRole('button', { name: optionLabel }));
}

describe('CreateWorkspaceModal footer hint', () => {
  it('shows the create-mode hint and the trimmed create placeholder by default', () => {
    renderModal();

    expect(screen.getByPlaceholderText('输入文件夹名称或完整路径')).toBeTruthy();
    expect(screen.getByText('填好名称或路径后，点左侧「创建文件夹」继续')).toBeTruthy();
  });

  it('follows the composite button mode', () => {
    const { container } = renderModal();

    switchMode(container, '选择文件夹');
    expect(screen.getByText('先点左侧「选择文件夹」，再挑一个文件夹')).toBeTruthy();

    switchMode(container, '打开文件夹');
    expect(screen.getByPlaceholderText('输入或粘贴文件夹路径')).toBeTruthy();
    expect(screen.getByText('填好路径后，点左侧「打开文件夹」继续')).toBeTruthy();
  });

  it('creates by name under the configured default directory', async () => {
    localStorage.setItem('adl_workspace_default_create_dir', 'C:/base');
    const { onOpenWorkspace } = renderModal();

    fireEvent.change(screen.getByPlaceholderText('输入文件夹名称或完整路径'), {
      target: { value: 'my-project' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建文件夹' }));

    await waitFor(() => {
      expect(onOpenWorkspace).toHaveBeenCalledWith('C:/base/my-project', { create: true });
    });
  });

  it('passes a bare name through with create so the backend can use its default root', async () => {
    const { onOpenWorkspace } = renderModal();

    fireEvent.change(screen.getByPlaceholderText('输入文件夹名称或完整路径'), {
      target: { value: 'my-project' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建文件夹' }));

    await waitFor(() => {
      expect(onOpenWorkspace).toHaveBeenCalledWith('my-project', { create: true });
    });
  });

  it('rejects parent-directory names before joining the default directory', async () => {
    localStorage.setItem('adl_workspace_default_create_dir', 'C:/base');
    const { onOpenWorkspace } = renderModal();

    fireEvent.change(screen.getByPlaceholderText('输入文件夹名称或完整路径'), {
      target: { value: '..' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建文件夹' }));

    expect(await screen.findByText('文件夹名称不能是「.」或「..」')).toBeTruthy();
    expect(onOpenWorkspace).not.toHaveBeenCalled();
  });

  it('opens an existing path without the create flag', async () => {
    const { container, onOpenWorkspace } = renderModal();
    switchMode(container, '打开文件夹');

    fireEvent.change(screen.getByPlaceholderText('输入或粘贴文件夹路径'), {
      target: { value: 'C:/existing' },
    });
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }));

    await waitFor(() => {
      expect(onOpenWorkspace).toHaveBeenCalledWith('C:/existing');
    });
  });
});
