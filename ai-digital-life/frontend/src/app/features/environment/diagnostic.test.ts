import { describe, it, expect } from 'vitest';
import { buildAgentDiagnostic } from './diagnostic';
import { environmentZh } from '@i18n/zh-CN/environment';
import type { CopyDict } from '@i18n';
import type { EnvDependencyState, EnvStatus } from '../../../shared/ipc/env';

const t = environmentZh as unknown as CopyDict;

function dep(patch: Partial<EnvDependencyState> = {}): EnvDependencyState {
  return {
    mode: 'auto',
    effective: 'host',
    origin: 'path',
    installedVersion: '24.22.1',
    baselineVersion: '24.22.1',
    meetsBaseline: true,
    path: 'C:/data/env-hosted/node/24.22.1/node.exe',
    ...patch,
  };
}

function status(patch: Partial<EnvStatus> = {}): EnvStatus {
  return {
    node: dep(),
    git: dep(),
    bash: dep({
      effective: 'system',
      installedVersion: null,
      baselineVersion: '',
      path: 'C:/Git/bin/bash.exe',
    }),
    webview2: dep({
      origin: 'registry',
      installedVersion: '140.0.3485.94',
      baselineVersion: '140.0.0.0',
      path: null,
    }),
    adlserver: dep({
      origin: 'bundled',
      installedVersion: null,
      baselineVersion: '',
      path: 'C:/app/adl-server.exe',
    }),
    netprobe: { registryOk: true, registryLatencyMs: 12, ciTokenConfigured: false },
    task: null,
    dataDir: 'C:/data',
    dshReady: true,
    ...patch,
  };
}

const meta = {
  t,
  appVersion: '0.1.0',
  bridge: 'tauri' as const,
  locale: 'zh-CN',
  copiedAt: '2026-11-03T00:00:00.000Z',
  userAgent: 'Mozilla/5.0 Windows NT 10.0',
};

function jsonBlock(text: string): Record<string, unknown> {
  const match = /```json\n([\s\S]*?)\n```/.exec(text);
  expect(match).not.toBeNull();
  return JSON.parse(match?.[1] ?? '') as Record<string, unknown>;
}

describe('agent diagnostic report', () => {
  it('single item: status reason, source resolution and runbook are explicit', () => {
    const text = buildAgentDiagnostic(
      'node',
      status({
        node: dep({
          mode: 'system',
          effective: 'system',
          installedVersion: '24.15.0',
          path: 'D:/nodejs/node.exe',
          meetsBaseline: false,
        }),
      }),
      meta,
    );
    expect(text).toContain('# AI Digital Life 环境诊断报告');
    expect(text).toContain('## 给你的任务');
    expect(text).toContain('应用版本: 0.1.0');
    expect(text).toContain('Node.js — 版本过低');
    expect(text).toContain('版本低于基线 24.22.1');
    expect(text).toContain('来源: 系统安装');
    expect(text).toContain('实际生效: 系统安装');
    expect(text).toContain('`D:/nodejs/node.exe`');
    expect(text).toContain('## 应用内置排障手册');
    expect(text).toContain('（env-node）');
    const payload = jsonBlock(text);
    expect(payload.dep).toBe('node');
    expect((payload.status as EnvDependencyState).installedVersion).toBe('24.15.0');
    expect((payload.context as { appVersion: string }).appVersion).toBe('0.1.0');
  });

  it('all items: unmet deps come first and every dep is listed', () => {
    const text = buildAgentDiagnostic(
      'all',
      status({
        node: dep({ effective: 'none', installedVersion: null, path: null, meetsBaseline: false }),
        dshReady: false,
      }),
      meta,
    );
    expect(text).toContain('全部环境依赖（未就绪项优先）');
    expect(text).toContain('就绪 5/6');
    // 未就绪的 Node.js 必须排在就绪的 Git 之前。
    expect(text.indexOf('#### Node.js')).toBeLessThan(text.indexOf('#### Git'));
    expect(text).toContain('#### 网络与凭据');
    expect(text).toContain('#### 模型凭据 — 需在助手侧配置');
    expect(text).toContain('助手 (dsh) 可运行（按 Node 基线）');
    // 全量 runbook 仅收录未就绪项；模型不参与聚合，网络仅在未连通时参与。
    expect(text).toContain('（env-node）');
    expect(text).not.toContain('（env-git-bash）');
    // runbook 内联时剥掉 frontmatter 并降两级标题。
    expect(text).toContain('#### 症状');
    expect(text).not.toContain('dep: node');
    const payload = jsonBlock(text);
    expect(payload.dep).toBe('all');
  });

  it('all items: unreachable network prevents the all-clear conclusion', () => {
    const text = buildAgentDiagnostic(
      'all',
      status({
        netprobe: { registryOk: false, registryLatencyMs: 0, ciTokenConfigured: false },
        dshReady: false,
      }),
      meta,
    );
    // 5 个版本依赖就绪 + 网络未连通 = 5/6；不得说“所有可检测项均已就绪”。
    expect(text).toContain('就绪 5/6');
    expect(text).toContain('网络与凭据 — 未连通');
    expect(text).not.toContain('所有可检测项均已就绪');
    expect(text).toContain('（env-net-download）');
  });

  it('versionless dependency that is missing shows a dash, not “detected”', () => {
    const text = buildAgentDiagnostic(
      'bash',
      status({
        bash: dep({
          effective: 'none',
          installedVersion: null,
          baselineVersion: '',
          path: null,
          meetsBaseline: false,
        }),
      }),
      meta,
    );
    expect(text).toContain('版本: —');
    expect(text).not.toContain('版本: 已检测');
    expect(text).toContain('未检测到可用安装');
  });
});
