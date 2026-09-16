import type { ClipboardItem, IpcResult } from '@ai-digital-life/kernel';

export type { ClipboardItem, IpcResult };

/**
 * 系统剪贴板历史桥接能力
 * 用于: 查询最近剪贴板历史、删除单项、清空所有历史
 * 后端路由: GET /clipboard/list / POST /clipboard/remove / POST /clipboard/clear
 */
export interface ClipboardBridge {
  /**
   * 获取最近剪贴板历史
   * @param limit 最多返回条数
   * @returns 剪贴板历史条目列表
   * @command GET /clipboard/list?limit=N
   * @see tauri-bridge/index.ts → clipboard.list
   * @see mock-bridge.ts → clipboard.list
   * @see preview-bridge/index.ts → clipboard.list
   */
  list: (limit?: number) => Promise<IpcResult<ClipboardItem[]>>;
  /**
   * 删除单条剪贴板历史
   * @param id 条目 ID
   * @returns 是否删除成功
   * @command POST /clipboard/remove (body { id })
   * @see tauri-bridge/index.ts → clipboard.remove
   * @see mock-bridge.ts → clipboard.remove
   * @see preview-bridge/index.ts → clipboard.remove
   */
  remove: (id: string) => Promise<IpcResult<boolean>>;
  /**
   * 清空全部剪贴板历史
   * @returns 被清空的条目数量
   * @command POST /clipboard/clear (body {})
   * @see tauri-bridge/index.ts → clipboard.clear
   * @see mock-bridge.ts → clipboard.clear
   * @see preview-bridge/index.ts → clipboard.clear
   */
  clear: () => Promise<IpcResult<number>>;
  /**
   * 把一条图片剪贴板历史写回系统剪贴板（"再次复制"）
   * @param id 图片条目 ID
   * @returns 是否写入成功
   * @command POST /clipboard/write-image (body { id })
   * @see tauri-bridge/index.ts → clipboard.writeImage
   * @see mock-bridge.ts → clipboard.writeImage
   * @see preview-bridge/index.ts → clipboard.writeImage
   */
  writeImage: (id: string) => Promise<IpcResult<boolean>>;
  /**
   * 把一条图片条目的缩略图路径（后端落盘的 `thumbPath`）转成前端可访问的 URL
   * （ad-server `/clipboard/thumb/<filename>` 静态路由）。非图片或无可访问缩略图时返回空串。
   * 同步返回，不发起网络请求。
   * @param thumbPath 后端缩略图文件路径
   * @returns 可访问的缩略图 URL（可能为空串）
   * @see tauri-bridge/index.ts → clipboard.getThumbUrl
   * @see mock-bridge.ts → clipboard.getThumbUrl
   * @see preview-bridge/index.ts → clipboard.getThumbUrl
   */
  getThumbUrl: (thumbPath: string) => string;
  /**
   * 把一条图片条目的原图路径（后端落盘的 `image_path`）转成前端可访问的 URL
   * （ad-server `/clipboard/image/<filename>` 静态路由），供"放大查看"显示原图。
   * 非图片或无可访问原图时返回空串。同步返回，不发起网络请求。
   * @param imagePath 后端原图文件路径
   * @returns 可访问的原图 URL（可能为空串）
   * @see tauri-bridge/index.ts → clipboard.getImageUrl
   * @see mock-bridge.ts → clipboard.getImageUrl
   * @see preview-bridge/index.ts → clipboard.getImageUrl
   */
  getImageUrl: (imagePath: string) => string;
}
