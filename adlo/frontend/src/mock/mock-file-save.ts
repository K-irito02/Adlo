import type { FileSaveBridge } from '../shared/ipc';

/**
 * 通用「另存为」的 mock 实现：不写盘，返回"已取消"语义。
 * 浏览器 mock 没有系统对话框，也不需要真实落盘。
 */
export const mockFileSave: FileSaveBridge = {
  saveToFile: async () => ({ ok: true, data: {} }),
};
