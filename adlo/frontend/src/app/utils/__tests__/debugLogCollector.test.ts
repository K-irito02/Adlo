// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// 收集器会按运行模式选择写日志通道；测试只需验证 UI 不再挂按钮，桥接桩掉即可。
vi.mock('../../../tauri-bridge', () => ({ isTauriShell: () => false }));

describe('调试日志收集器', () => {
  it('不再挂载常驻「复制调试日志」按钮（日志文件由 Agent / 控制台 API 读取）', async () => {
    const mod = await import('../debugLogCollector');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(document.getElementById('__dl-debug-button')).toBeNull();
    // 模块在真实运行时依赖全局 API，断言其仍然暴露（只删按钮，不删收集能力）。
    expect(typeof (window as unknown as Record<string, unknown>).__exportDebugLogs).toBe(
      'function',
    );

    mod.restoreConsole();
  });
});
