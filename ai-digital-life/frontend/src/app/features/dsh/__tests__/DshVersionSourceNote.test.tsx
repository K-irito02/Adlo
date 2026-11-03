import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import type { CopyDict } from '@i18n/types';
import { TCopyProvider } from '@i18n/TCopyContext';
import { DshVersionSourceNote } from '../sub-components/DshVersionSourceNote';

const t = {
  dshVersionSourceDesc: '选择助手版本的来源',
  dshVersionSourceAuto: '自动检测',
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
      systemPinned: false,
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
      systemPinned: false,
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
      systemPinned: false,
      deferredSource: false,
      resolvedSource: 'none',
      effectiveSource: 'running',
      runningSource: 'external',
      mode: 'auto',
    });
    expect(screen.getByText('当前实际使用：运行中')).not.toBeNull();
    expect(screen.queryByText('助手将无法拉起，请安装')).toBeNull();
  });

  it('自动检测 + 完全没有来源：不渲染来源行，缺失由提示行说明', () => {
    renderNote({
      systemPinned: false,
      deferredSource: false,
      resolvedSource: 'none',
      effectiveSource: 'none',
      mode: 'auto',
    });
    expect(screen.queryByText(/当前实际使用/)).toBeNull();
    expect(screen.getByText('助手将无法拉起，请安装')).not.toBeNull();
  });

  it('钉住系统安装 + 外部实例在跑：来源行隐藏（下拉已写明「系统安装」）', () => {
    renderNote({
      systemPinned: true,
      deferredSource: false,
      resolvedSource: 'system',
      effectiveSource: 'running',
      runningSource: 'external',
      mode: 'system',
    });
    expect(screen.queryByText(/当前实际使用/)).toBeNull();
    expect(screen.getByText('系统托管说明')).not.toBeNull();
  });

  it('自动检测解析为系统安装 + 外部实例在跑：报「系统安装」而不是「运行中」', () => {
    renderNote({
      systemPinned: true,
      deferredSource: false,
      resolvedSource: 'system',
      effectiveSource: 'running',
      runningSource: 'external',
      mode: 'auto',
    });
    expect(screen.getByText('当前实际使用：系统安装')).not.toBeNull();
    expect(screen.queryByText('当前实际使用：运行中')).toBeNull();
  });

  it('钉住宿主托管 + 外部实例在跑：披露「运行中」', () => {
    renderNote({
      systemPinned: false,
      deferredSource: false,
      resolvedSource: 'host',
      effectiveSource: 'running',
      runningSource: 'external',
      mode: 'host',
    });
    expect(screen.getByText('当前实际使用：运行中')).not.toBeNull();
  });

  it('钉住宿主托管 + 运行的是应用自启的宿主实例：与下拉重复，不占位', () => {
    renderNote({
      systemPinned: false,
      deferredSource: false,
      resolvedSource: 'host',
      effectiveSource: 'running',
      runningSource: 'host',
      mode: 'host',
    });
    expect(screen.queryByText(/当前实际使用/)).toBeNull();
  });

  it('钉住系统安装 + 本机已无系统副本（解析为无）+ 外部实例在跑：仍披露「运行中」', () => {
    renderNote({
      systemPinned: true,
      deferredSource: false,
      resolvedSource: 'none',
      effectiveSource: 'running',
      runningSource: 'external',
      mode: 'system',
    });
    // 解析结果不是系统安装，说明里「系统安装由你维护」不代表实际在跑的东西，
    // 蓝行必须保留唯一真实的披露。
    expect(screen.getByText('当前实际使用：运行中')).not.toBeNull();
  });

  it('钉住系统安装 + 运行的是应用自启的宿主实例：披露「宿主托管」', () => {
    renderNote({
      systemPinned: true,
      deferredSource: false,
      resolvedSource: 'system',
      effectiveSource: 'running',
      runningSource: 'host',
      mode: 'system',
    });
    expect(screen.getByText('当前实际使用：宿主托管')).not.toBeNull();
  });

  it('钉住系统安装 + 运行的就是系统安装：与下拉重复，不占位', () => {
    renderNote({
      systemPinned: true,
      deferredSource: false,
      resolvedSource: 'system',
      effectiveSource: 'running',
      runningSource: 'system',
      mode: 'system',
    });
    expect(screen.queryByText(/当前实际使用/)).toBeNull();
  });

  it('自动检测 + 宿主版本 + 未运行：显示「宿主托管」', () => {
    renderNote({
      systemPinned: false,
      deferredSource: false,
      resolvedSource: 'host',
      effectiveSource: 'host',
      mode: 'auto',
    });
    expect(screen.getByText('当前实际使用：宿主托管')).not.toBeNull();
  });

  it('来源未就绪（resolvedSource 为 null）：不渲染来源行，也不抛错', () => {
    renderNote({
      systemPinned: false,
      deferredSource: false,
      resolvedSource: null,
      effectiveSource: null,
      mode: 'auto',
    });
    expect(screen.queryByText(/当前实际使用/)).toBeNull();
  });

  it('非自动模式且无运行实例：不渲染来源行', () => {
    renderNote({
      systemPinned: false,
      deferredSource: false,
      resolvedSource: 'host',
      effectiveSource: 'host',
      mode: 'host',
    });
    expect(screen.queryByText(/当前实际使用/)).toBeNull();
  });
});
