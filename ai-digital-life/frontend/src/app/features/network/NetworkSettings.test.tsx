import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import { TCopyProvider } from '@i18n/TCopyContext';
import { NetworkSettings } from './NetworkSettings';

const t = {
  settingsNetwork: '网络',
  networkDesc: '下载源连通性，一处查看、一处重试',
  dshSettingsSource: '下载源',
  dshSettingsProxy: '代理设置',
  dshSettingsTestConnection: '测试连接',
} as unknown as CopyDict;

describe('NetworkSettings shell', () => {
  afterEach(() => {
    cleanup();
  });

  it('挂载渲染组标题（空壳；Task 5 填充三块）', () => {
    const { getByText } = render(
      <TCopyProvider t={t} locale="zh-CN">
        <NetworkSettings />
      </TCopyProvider>,
    );
    expect(getByText('网络')).not.toBeNull();
  });
});
