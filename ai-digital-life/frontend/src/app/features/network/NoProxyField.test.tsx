import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { NoProxyField } from './NoProxyField';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => {
    if (key === 'dshSettingsNoProxyCount') {
      return '{current}/{total}';
    }
    if (key === 'dshSettingsNoProxyItemCount') {
      return '{count} 项';
    }
    return typeof key === 'string' ? key : '';
  },
}) as unknown as CopyDict;

function renderField(value: string, onChange = vi.fn()) {
  render(
    <TCopyProvider t={mockT} locale="zh-CN">
      <NoProxyField value={value} onChange={onChange} />
    </TCopyProvider>,
  );
  return onChange;
}

describe('NoProxyField', () => {
  afterEach(() => cleanup());

  it('单行翻页：一次显示一条，上下箭头循环并更新 n/total', () => {
    renderField('localhost\n127.0.0.1');
    const input = screen.getByRole('textbox', {
      name: 'dshSettingsProxyNoProxy',
    }) as HTMLInputElement;
    expect(input.value).toBe('localhost');
    expect(screen.getByText('1/2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'dshSettingsNoProxyNext' }));
    expect(input.value).toBe('127.0.0.1');
    expect(screen.getByText('2/2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'dshSettingsNoProxyNext' }));
    expect(input.value).toBe('localhost');
  });

  it('编辑当前条目只替换该条，并以换行分隔写回', () => {
    const onChange = renderField('localhost\n127.0.0.1');
    const input = screen.getByRole('textbox', {
      name: 'dshSettingsProxyNoProxy',
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'localhost.local' } });
    expect(onChange).toHaveBeenCalledWith('localhost.local\n127.0.0.1');
  });

  it('Enter 在输入框内新增一条并聚焦新条目（不打开弹层）', () => {
    const onChange = renderField('localhost');
    const input = screen.getByRole('textbox', {
      name: 'dshSettingsProxyNoProxy',
    }) as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('');
    expect(screen.getByText('2/2')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '127.0.0.1' } });
    expect(onChange).toHaveBeenCalledWith('localhost\n127.0.0.1');
  });

  it('Shift+Enter 与 Enter 行为一致', () => {
    renderField('localhost');
    const input = screen.getByRole('textbox', {
      name: 'dshSettingsProxyNoProxy',
    }) as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(input.value).toBe('');
    expect(screen.getByText('2/2')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('兼容历史逗号分隔：展开后按行显示', async () => {
    renderField('localhost,127.0.0.1');
    fireEvent.click(screen.getByRole('button', { name: 'dshSettingsNoProxyExpand' }));
    const dialog = await screen.findByRole('dialog');
    const editor = within(dialog).getByRole('textbox', {
      name: 'dshSettingsProxyNoProxy',
    }) as HTMLTextAreaElement;
    expect(editor.value).toBe('localhost\n127.0.0.1');
  });

  it('展开弹层：多行编辑、条目计数、自动保存提示与图标关闭', async () => {
    const onChange = renderField('localhost\n127.0.0.1');
    fireEvent.click(screen.getByRole('button', { name: 'dshSettingsNoProxyExpand' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('2 项')).toBeTruthy();
    expect(within(dialog).getByText('dshSettingsNoProxyEditorHint')).toBeTruthy();

    const editor = within(dialog).getByRole('textbox', {
      name: 'dshSettingsProxyNoProxy',
    });
    fireEvent.change(editor, { target: { value: 'localhost\napi.internal' } });
    expect(onChange).toHaveBeenCalledWith('localhost\napi.internal');

    fireEvent.click(within(dialog).getByRole('button', { name: 'dshSettingsNoProxyClose' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
