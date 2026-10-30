import { describe, expect, it } from 'vitest';
import type { CopyDict } from '@i18n/types';
import { describeDetectFailure, describeProbeFailure } from '../probeError';

/** 只提供被测 key 的精简词典（模板与 zh-CN 同形，便于断言插值结果）。 */
const t = {
  dshSettingsTestErrorUnknown: '未知错误',
  dshSettingsTestErrorNetwork: '网络错误',
  dshSettingsTestErrorProxyUnreachable: '代理不可用（{proxy}）',
  dshSettingsTestErrorViaProxy: '经代理 {proxy} 连接失败',
  dshSettingsTestErrorHttp: '下载源返回 HTTP {status}',
  dshSettingsAutoDetectFailed: '自动检测失败，已保留当前下载源',
  dshSettingsAutoDetectFailedProxy: '自动检测失败：代理不可用（{proxy}），已保留当前下载源',
} as unknown as CopyDict;

describe('probeError', () => {
  it('names the proxy endpoint when the proxy is unreachable', () => {
    const message = describeProbeFailure(t, {
      reachable: false,
      latency_ms: null,
      error: 'builder error',
      error_kind: 'proxy_unreachable',
      proxy: 'socks5h://127.0.0.1:17890',
    });
    expect(message).toBe('代理不可用（socks5h://127.0.0.1:17890）');
    // 原始错误串绝不外泄。
    expect(message).not.toContain('builder error');
  });

  it('distinguishes "failed through proxy" from plain network failure', () => {
    expect(
      describeProbeFailure(t, {
        reachable: false,
        latency_ms: null,
        error: 'error sending request for url (https://registry.npmjs.org/)',
        error_kind: 'network',
        proxy: 'http://proxy:8080',
      }),
    ).toBe('经代理 http://proxy:8080 连接失败');

    expect(
      describeProbeFailure(t, {
        reachable: false,
        latency_ms: null,
        error: 'dns error',
        error_kind: 'network',
        proxy: null,
      }),
    ).toBe('网络错误');
  });

  it('shows the HTTP status for http-kind failures', () => {
    expect(
      describeProbeFailure(t, {
        reachable: false,
        latency_ms: null,
        error: 'HTTP 403',
        error_kind: 'http',
        http_status: 403,
      }),
    ).toBe('下载源返回 HTTP 403');
  });

  it('falls back to the generic network copy when the backend omits a kind', () => {
    expect(describeProbeFailure(t, { reachable: false, latency_ms: null, error: 'boom' })).toBe(
      '网络错误',
    );
  });

  it('reports the proxy cause when a candidate failed on the proxy', () => {
    const message = describeDetectFailure(t, [
      {
        reachable: false,
        latency_ms: null,
        error: 'x',
        error_kind: 'proxy_unreachable',
        proxy: 'socks5h://127.0.0.1:17890',
      },
      {
        reachable: false,
        latency_ms: null,
        error: 'x',
        error_kind: 'proxy_unreachable',
        proxy: 'socks5h://127.0.0.1:17890',
      },
    ]);
    expect(message).toContain('代理不可用（socks5h://127.0.0.1:17890）');
  });

  it('keeps the generic copy when no candidate blames the proxy', () => {
    const message = describeDetectFailure(t, [
      null,
      { reachable: false, latency_ms: null, error: 'x' },
    ]);
    expect(message).toBe('自动检测失败，已保留当前下载源');
  });
});
