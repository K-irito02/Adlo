import { describe, it, expect } from 'vitest';

/**
 * 死 API `setLogMode` / `app_set_log_mode` 不复活护栏（Closing L-11）。
 *
 * 注释"零调用方"易腐烂：此处不断言源码文本，而断言三端桥接的 `app` 域在
 * **运行时**就没有该方法 —— 后人加回任一实现即红。
 */
import { mockDigitalLifeBridge } from '../../../mock-bridge';
import { createTauriAppBridge } from '../../../tauri-bridge/tauri-app';
import { createHttpBridge } from '../../../httpBridge';
import type { DigitalLifeBridge } from '../digital-life';

describe('app bridge has no setLogMode dead API', () => {
  it('mock app domain exposes no setLogMode', () => {
    expect('setLogMode' in mockDigitalLifeBridge.app).toBe(false);
  });

  it('tauri app domain exposes no setLogMode', () => {
    expect('setLogMode' in createTauriAppBridge()).toBe(false);
  });

  it('http app domain exposes no setLogMode', () => {
    const http = createHttpBridge({ baseUrl: 'http://127.0.0.1:9' });
    expect('setLogMode' in http.app).toBe(false);
  });

  it('preview app domain exposes no setLogMode', async () => {
    // 第四端：preview 组装体同样不得复活该方法（需 window + env，jsdom 可跑）。
    delete (window as { digitalLife?: unknown }).digitalLife;
    try {
      const { setupPreviewBridge } = await import('../../../preview-bridge/index');
      await setupPreviewBridge();
      const bridge = (window as { digitalLife: DigitalLifeBridge }).digitalLife;
      expect('setLogMode' in bridge.app).toBe(false);
    } finally {
      delete (window as { digitalLife?: unknown }).digitalLife;
    }
  });
});
