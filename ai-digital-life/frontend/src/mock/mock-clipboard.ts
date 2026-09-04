import type { ClipboardBridge } from "../shared/ipc";

/**
 * 内存版剪贴板历史 mock。浏览器 mock / 预览模式在 ad-server 不可达时的回退实现：
 * `list` 返回空、`remove`/`clear` 返回成功空结果。
 */
export const mockClipboard: ClipboardBridge = {
  list: async (_limit?: number) => ({ ok: true, data: [] }),
  remove: async (_id: string) => ({ ok: true, data: true }),
  clear: async () => ({ ok: true, data: 0 }),
  writeImage: async (_id: string) => ({ ok: true, data: true }),
  getThumbUrl: () => '',
};