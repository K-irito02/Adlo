import type { BrowserTreeNode } from './types';

interface BrowserTreeNodeFaviconProps {
  url: string;
  pending: 'spinner' | 'initial';
  /** 书签条目的内联图标快照：被动列表直接显示，重挂/重启后不再退回首字母。 */
  snapshot?: string;
}

/**
 * 树行的 favicon 占位策略。
 *
 * 只有「背后有活标签页在抓元数据」的行才值得转圈；书签/历史是**被动列表**，
 * 没有在途抓取，直接用站点首字母占位，真实图标（含导入时播种进共享镜像的快照）
 * 到达后原地替换。
 *
 * `isSavedBookmark` 优先：搜索/列表里的书签行可能带 `isSavedBookmark`，即使
 * `nodeType` 不是 `'bookmark'` 也按被动列表处理。
 */
export function faviconPropsForNode(node: BrowserTreeNode): BrowserTreeNodeFaviconProps {
  const passive =
    node.isSavedBookmark === true || node.nodeType === 'bookmark' || node.nodeType === 'history';
  return {
    url: node.url ?? '',
    pending: passive ? 'initial' : 'spinner',
    snapshot: node.iconUri,
  };
}
