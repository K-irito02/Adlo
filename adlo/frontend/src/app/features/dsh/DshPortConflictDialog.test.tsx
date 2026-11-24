import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DshPortConflictDialog } from './DshPortConflictDialog';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n/types';

const t = {
  dshPortConflictTitle: '无法打开 DeepSeek Harness',
  dshPortConflictMessage: '3080 端口正被{processes}使用。',
  dshPortConflictMessageMulti: '3080 端口正被以下进程使用：',
  dshPortConflictQuestion: '要结束占用并重启应用内的 DeepSeek Harness 吗？',
  dshPortConflictOtherWarning: '其中还有其它程序，结束它们可能会影响正在使用它们的应用。',
  dshPortConflictWarningSuffix: '',
  dshPortConflictProcess: '{name}（PID {pid}）',
  dshPortConflictConfirm: '结束并重启',
  dshPortConflictCancel: '取消',
} as unknown as CopyDict;

function renderDialog() {
  return render(
    <TCopyProvider t={t} locale="zh-CN">
      <DshPortConflictDialog />
    </TCopyProvider>,
  );
}

const dshProcess = {
  pid: 42,
  name: 'node.exe',
  cmdline: 'node dsh/lib/bin.js',
  isDsh: true,
};

describe('DshPortConflictDialog', () => {
  beforeEach(() => {
    useAppStore.setState({ dshPortConflict: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('无冲突时不渲染对话框', () => {
    renderDialog();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('单进程内联展示；确认后清空状态', () => {
    useAppStore.getState().setDshPortConflict({ port: 3080, processes: [dshProcess] });
    renderDialog();

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/node\.exe/)).toBeTruthy();
    expect(screen.getByText(/42/)).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText(/要结束占用并重启/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '结束并重启' }));
    expect(useAppStore.getState().dshPortConflict).toBeNull();
  });

  it('多进程逐行展示，且警告在问句之前', () => {
    useAppStore.getState().setDshPortConflict({
      port: 3080,
      processes: [dshProcess, { pid: 7, name: 'other.exe', cmdline: 'other', isDsh: false }],
    });
    renderDialog();

    expect(screen.getByText(/以下进程/)).toBeTruthy();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('node.exe');
    expect(items[1].textContent).toContain('other.exe');
    expect(screen.getByText(/其它程序/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(useAppStore.getState().dshPortConflict).toBeNull();
  });
});
