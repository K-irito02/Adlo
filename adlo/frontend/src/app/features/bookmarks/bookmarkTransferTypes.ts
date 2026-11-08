/**
 * 书签导入 / 导出共用的中间树。
 *
 * 与 store 里的 `BookmarkEntry` 刻意分离：这里只描述"文件里有什么"，
 * 不含 id / sourceTabId 等运行时概念，因此编解码是纯函数，可独立测试。
 */

export interface TransferFolder {
  name: string;
  children: TransferNode[];
}

export type TransferNode =
  | { kind: 'folder'; folder: TransferFolder }
  | {
      kind: 'bookmark';
      url: string;
      title: string;
      /** 毫秒时间戳 */
      addedAt: number;
      /** 毫秒时间戳 */
      lastModifiedAt: number;
      /** 内联图标（`data:` URI），文件里没有则为 undefined */
      icon?: string;
    };

export interface ParsedBookmarkFile {
  /** 文件标题：优先 `<H1>`，其次 `<TITLE>`，都没有时为空串 */
  rootName: string;
  nodes: TransferNode[];
  /** 因协议不支持或缺 URL 被忽略的条目数 */
  invalidCount: number;
}
