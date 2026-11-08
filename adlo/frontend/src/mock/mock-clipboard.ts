import type { ClipboardBridge } from '../shared/ipc';

/**
 * 内存版剪贴板历史 mock。浏览器 mock / 预览模式在 ad-server 不可达时的回退实现：
 * `list` 返回空、`remove`/`clear` 返回成功空结果、`update` 回显条目、URL 构造器返回空串。
 * `saveToFile` 不写盘（mock 模式没有真实条目数据可落盘），返回"已取消"语义。
 */
export const mockClipboard: ClipboardBridge = {
  list: async (_limit?: number) => ({ ok: true, data: [] }),
  remove: async (_id: string) => ({ ok: true, data: true }),
  clear: async () => ({ ok: true, data: 0 }),
  write: async (_id: string) => ({ ok: true, data: true }),
  update: async (id: string, content: string) => ({
    // mock 无存储：恒回显 kind:'text'，不保真传入条目的 kind，仅供离线演示。
    ok: true,
    data: { id, kind: 'text', content, createdAt: Date.now() },
  }),
  exportUrl: () => '',
  getThumbUrl: () => '',
  getImageUrl: () => '',
  getHtmlUrl: (_htmlPath: string) => '',
  getRtfUrl: (_rtfPath: string) => '',
  onChanged: () => () => {},
};
