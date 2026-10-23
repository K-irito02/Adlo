import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import { TCopyProvider } from '@i18n/TCopyContext';
import { EnvironmentSettings } from './EnvironmentSettings';

const t = {
  settingsEnvironment: '环境',
  environmentDesc: '运行助手所需的系统依赖，一处查看、一处安装',
} as unknown as CopyDict;

describe('EnvironmentSettings shell', () => {
  afterEach(() => {
    cleanup();
  });

  it('挂载渲染组标题（空壳；Task 7 填充七依赖行）', () => {
    const { getByText } = render(
      <TCopyProvider t={t} locale="zh-CN">
        <EnvironmentSettings />
      </TCopyProvider>,
    );
    expect(getByText('环境')).not.toBeNull();
  });
});
