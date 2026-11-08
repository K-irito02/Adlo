import type { ClipboardItem, IpcResult } from '@adlo/kernel';

export type { ClipboardItem, IpcResult };

/**
 * 系统剪贴板历史桥接能力
 * 用于: 查询最近剪贴板历史、删除单项、清空所有历史、写回、缩略图/原图 URL
 * 后端路由: GET /clipboard/list / POST /clipboard/remove / POST /clipboard/clear
 *          / POST /clipboard/write / POST /clipboard/update / GET /clipboard/thumb/:filename / GET /clipboard/image/:filename
 *          / GET /clipboard/html/:filename / GET /clipboard/rtf/:filename / GET /clipboard/export
 * Tauri 模式：clipboard 域由 `tauri-bridge/index.ts` 的 `...http` 继承 `createHttpBridge` 实现，
 * 因此以下 `@see tauri-bridge` 指该继承点，而非 Tauri 侧独立实现。
 */
export interface ClipboardBridge {
  /**
   * 获取最近剪贴板历史
   * @param limit 最多返回条数
   * @returns 剪贴板历史条目列表
   * @command GET /clipboard/list?limit=N
   * @see tauri-bridge/index.ts（...http 继承）→ clipboard.list
   * @see mock-bridge.ts → clipboard.list
   * @see preview-bridge/index.ts → clipboard.list
   */
  list: (limit?: number) => Promise<IpcResult<ClipboardItem[]>>;
  /**
   * 删除单条剪贴板历史
   * @param id 条目 ID
   * @returns 是否删除成功
   * @command POST /clipboard/remove (body { id })
   * @see tauri-bridge/index.ts（...http 继承）→ clipboard.remove
   * @see mock-bridge.ts → clipboard.remove
   * @see preview-bridge/index.ts → clipboard.remove
   */
  remove: (id: string) => Promise<IpcResult<boolean>>;
  /**
   * 清空全部剪贴板历史
   * @returns 被清空的条目数量
   * @command POST /clipboard/clear (body {})
   * @see tauri-bridge/index.ts（...http 继承）→ clipboard.clear
   * @see mock-bridge.ts → clipboard.clear
   * @see preview-bridge/index.ts → clipboard.clear
   */
  clear: () => Promise<IpcResult<number>>;
  /**
   * 把一条剪贴板历史写回系统剪贴板（"再次复制"），按 kind 分发 text/html/rtf/image。
   * @param id 条目 ID
   * @returns 是否写入成功
   * @command POST /clipboard/write (body { id })
   * @see tauri-bridge/index.ts（...http 继承）→ clipboard.write
   * @see mock-bridge.ts → clipboard.write
   * @see preview-bridge/index.ts → clipboard.write
   */
  write: (id: string) => Promise<IpcResult<boolean>>;
  /**
   * 原地保存一条文本条目的编辑结果（`kind === 'text'` 与 `'html'` 可编辑；
   * html 编辑的是纯文本侧 `content`，sidecar 只由捕获写入）。
   * 保持条目 id 与 `createdAt` 不变（列表按 createdAt 倒序 → 位置不变）。
   * @param id 条目 ID
   * @param content 编辑后的文本内容（空白内容会被后端拒绝）
   * @returns 更新后的剪贴板条目
   * @command POST /clipboard/update (body { id, content })
   * @see tauri-bridge/index.ts（...http 继承）→ clipboard.update
   * @see mock-bridge.ts → clipboard.update
   * @see preview-bridge/index.ts → clipboard.update
   */
  update: (id: string, content: string) => Promise<IpcResult<ClipboardItem>>;
  /**
   * 把一条剪贴板条目的载荷转成可下载文件 URL（`/clipboard/export?id=<id>`），
   * **作为 `fileSave.saveToFile` 的取字节来源**（非直接下载通道：跨域 `<a download>`
   * 不生效，落盘走 `fileSave.saveToFile`）。同步返回，不发起网络请求。
   * @param id 条目 ID
   * @returns 可下载文件 URL；mock 模式返回空串。
   * @see tauri-bridge/index.ts（...http 继承）→ clipboard.exportUrl
   * @see mock-bridge.ts → clipboard.exportUrl
   * @see preview-bridge/index.ts → clipboard.exportUrl
   */
  exportUrl: (id: string) => string;
  /**
   * 把 HTML 载荷 sidecar 路径转成可访问 URL（`/clipboard/html/<filename>`）。
   * 同步返回，不发起网络请求。
   * @param htmlPath 后端 HTML 文件路径
   * @returns 可访问的 HTML URL；路径为空（或退化）时返回空串。
   * @see tauri-bridge/index.ts（...http 继承）→ clipboard.getHtmlUrl
   * @see mock-bridge.ts → clipboard.getHtmlUrl
   * @see preview-bridge/index.ts → clipboard.getHtmlUrl
   */
  getHtmlUrl: (htmlPath: string) => string;
  /**
   * 把 RTF 载荷 sidecar 路径转成可访问 URL（`/clipboard/rtf/<filename>`）。
   * 同步返回，不发起网络请求。
   * @param rtfPath 后端 RTF 文件路径
   * @returns 可访问的 RTF URL；路径为空（或退化）时返回空串。
   * @see tauri-bridge/index.ts（...http 继承）→ clipboard.getRtfUrl
   * @see mock-bridge.ts → clipboard.getRtfUrl
   * @see preview-bridge/index.ts → clipboard.getRtfUrl
   */
  getRtfUrl: (rtfPath: string) => string;
  /**
   * 把一条图片条目的缩略图路径（后端落盘的 `thumbPath`）转成前端可访问的 URL
   * （ad-server `/clipboard/thumb/<filename>` 静态路由）。同步返回，不发起网络请求。
   * @param thumbPath 后端缩略图文件路径
   * @returns 可访问的缩略图 URL；路径为空（或退化）时返回空串。**不做文件存在性校验**，
   *          文件失效时由消费端 `<img onError>` 回退。
   * @see tauri-bridge/index.ts（...http 继承）→ clipboard.getThumbUrl
   * @see mock-bridge.ts → clipboard.getThumbUrl
   * @see preview-bridge/index.ts → clipboard.getThumbUrl
   */
  getThumbUrl: (thumbPath: string) => string;
  /**
   * 把一条图片条目的原图路径（后端落盘的 `image_path`）转成前端可访问的 URL
   * （ad-server `/clipboard/image/<filename>` 静态路由），供"放大查看"显示原图。
   * 同步返回，不发起网络请求。
   * @param imagePath 后端原图文件路径
   * @returns 可访问的原图 URL；路径为空（或退化）时返回空串。**不做文件存在性校验**，
   *          文件失效时由消费端 `<img onError>` 逐级回退（缩略图 → 图标占位）。
   * @see tauri-bridge/index.ts（...http 继承）→ clipboard.getImageUrl
   * @see mock-bridge.ts → clipboard.getImageUrl
   * @see preview-bridge/index.ts → clipboard.getImageUrl
   */
  getImageUrl: (imagePath: string) => string;
  /**
   * 订阅"剪贴板历史发生变化"信号（无载荷）：ad-server 经 `/ws/workspace` 推送
   * `{"kind":"clipboard-changed"}` 时触发，消费端应立即重取历史（节流合并突发）。
   * 同步返回 unsubscribe（与 `workspace.onFilesChanged` 同契约，勿被异步包装）。
   * @param listener 变化回调（无参数）
   * @returns 同步 unsubscribe；mock 模式返回空操作。
   * @see tauri-bridge/index.ts（...http 继承）→ clipboard.onChanged
   * @see mock-bridge.ts → clipboard.onChanged
   * @see preview-bridge/index.ts → clipboard.onChanged
   */
  onChanged: (listener: () => void) => () => void;
}
