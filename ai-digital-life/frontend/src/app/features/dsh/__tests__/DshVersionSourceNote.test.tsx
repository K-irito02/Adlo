import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import type { CopyDict } from '@i18n/types';
import { TCopyProvider } from '@i18n/TCopyContext';
import { DshVersionSourceNote } from '../sub-components/DshVersionSourceNote';

const t = {
  dshVersionSourceDesc: '选择助手版本的来源',
  dshSystemManagedNote: '系统托管说明',
  dshVersionSourceDeferredNote: '下次启动生效',
  dshNoSourceHostNote: '宿主托管无版本',
  dshNoSourceAutoNote: '助手将无法拉起，请安装',
  dshVersionSourceHost: '宿主托管',
  dshVersionSourceSystem: '系统安装',
  harnessVersionSourceRunning: '运行中',
  settingsAutoResolved: '当前实际使用：{value}',
} as unknown as CopyDict;

function renderNote(props: React.ComponentProps<typeof DshVersionSourceNote>) {
  return render(
    <TCopyProvider t={t} locale="zh-CN">
      <DshVersionSourceNote {...props} />
    </TCopyProvider>,
  );
}

describe('DshVersionSourceNote', () => {
  afterEach(() => cleanup());

  it('自动检测 + 宿主版本 + 应用自启运行中：仍显示来源「宿主托管」', () => {
    renderNote({
      systemManaged: false,
      deferredSource: false,
      resolvedSource: 'host',
      effectiveSource: 'running',
      runningSource: 'host',
      mode: 'auto',
    });
    expect(screen.getByText('当前实际使用：宿主托管')).not.toBeNull();
    expect(screen.queryByText('当前实际使用：运行中')).toBeNull();
  });

  it('自动检测 + 宿主版本已装但外部助手在跑：显示「运行中」（真实来源优先）', () => {
    renderNote({
      systemManaged: false,
      deferredSource: false,
      resolvedSource: 'host',
      effectiveSource: 'running',
      runningSource: 'external',
      mode: 'auto',
    });
    expect(screen.getByText('当前实际使用：运行中')).not.toBeNull();
  });

  it('自动检测 + 外部助手在跑：显示「运行中」且不提示无法拉起', () => {
    renderNote({
      systemManaged: false,
      deferredSource: false,
      resolvedSource: 'none',
      effectiveSource: 'running',
      runningSource: 'external',
      mode: 'auto',
    });
    expect(screen.getByText('当前实际使用：运行中')).not.toBeNull();
    expect(screen.queryByText('助手将无法拉起，请安装')).toBeNull();
  });

  it('自动检测 + 完全没有来源：来源行仍显示「宿主托管」，缺失由提示行说明', () => {
    renderNote({
      systemManaged: false,
      deferredSource: false,
      resolvedSource: 'none',
      effectiveSource: 'none',
      mode: 'auto',
    });
    expect(screen.getByText('当前实际使用：宿主托管')).not.toBeNull();
    expect(screen.getByText('助手将无法拉起，请安装')).not.toBeNull();
  });

  it('非自动模式不渲染来源行', () => {
    renderNote({
      systemManaged: false,
      deferredSource: false,
      resolvedSource: 'host',
      effectiveSource: 'host',
      mode: 'host',
    });
    expect(screen.queryByText(/当前实际使用/)).toBeNull();
  });
});
