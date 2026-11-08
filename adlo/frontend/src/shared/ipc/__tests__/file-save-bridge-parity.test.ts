import { describe, expect, it } from 'vitest';
import { createHttpBridge } from '../../../httpBridge';
import { mockFileSave } from '../../../mock/mock-file-save';

describe('fileSave bridge contract', () => {
  const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:1' });

  it('keeps the fileSave method key set identical between http and mock bridges', () => {
    // 穷尽键 parity：契约增删必须两端同步。tauri/preview 的 fileSave 系
    // 整体覆盖（壳层专属能力），故只锁手写两端 http↔mock。
    expect(Object.keys(mockFileSave).sort()).toEqual(Object.keys(bridge.fileSave).sort());
  });

  it('reports saveToFile as NOT_SUPPORTED on httpBridge', async () => {
    // 系统原生「另存为」是壳层能力：ad-server 无对应路由，
    // 落盘由 tauri-bridge / preview-bridge 覆盖，httpBridge 恒 NOT_SUPPORTED。
    const result = await bridge.fileSave.saveToFile({
      suggestedName: 'clipboard-c1.txt',
      dataBase64: 'aGk=',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('NOT_SUPPORTED');
    // message 带方法名，排查时可定位到具体能力而非笼统 NOT_SUPPORTED。
    expect(result.ok === false && result.error.message).toContain('fileSave.saveToFile');
  });

  it('mock returns a cancelled-dialog shape', async () => {
    const result = await mockFileSave.saveToFile({
      suggestedName: 'x.txt',
      dataBase64: 'aGk=',
    });
    expect(result).toEqual({ ok: true, data: {} });
  });
});
