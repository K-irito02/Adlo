// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// 收集器会按运行模式选择写日志通道；测试只需验证 UI 不再挂按钮，桥接桩掉即可。
vi.mock('../../../tauri-bridge', () => ({ isTauriShell: () => false }));

// 旧实现是 `async createDraggableCopyButton()`：按钮在 `await loadLocale()` 之后
// 才 appendChild 并读取按钮文案。用可控 deferred 让「locale 落定 + 微任务冲干净」
// 成为确定性断言点，避免用墙钟等待（冷启动时可能假绿）。
const localeGate = vi.hoisted(() => ({ resolve: () => {} }));
vi.mock('../../i18n/i18nLoader', () => ({
  loadLocale: () =>
    new Promise((resolve) => {
      // 返回最小的平铺 CopyDict（真实形状），确保恢复旧实现后走到 appendChild
      // 并让 DOM 断言（而不是未处理异常）变红。
      localeGate.resolve = () => resolve({ debugCopyLogs: 'Copy debug logs' });
    }),
}));

describe('调试日志收集器', () => {
  it('不再挂载常驻「复制调试日志」按钮（日志文件由 Agent / 控制台 API 读取）', async () => {
    const mod = await import('../debugLogCollector');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    // 先让旧实现依赖的 locale 落定，再冲干净微任务：若按钮被恢复，会在这里出现。
    localeGate.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('__dl-debug-button')).toBeNull();
    // 模块在真实运行时依赖全局 API，断言其仍然暴露（只删按钮，不删收集能力）。
    expect(typeof (window as unknown as Record<string, unknown>).__exportDebugLogs).toBe(
      'function',
    );

    mod.restoreConsole();
  });
});
