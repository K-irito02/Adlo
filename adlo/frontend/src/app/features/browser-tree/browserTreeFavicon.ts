import type { BrowserTreeNode } from './types';

interface BrowserTreeNodeFaviconProps {
  url: string;
  pending: 'spinner' | 'initial';
}

/**
 * 树行的 favicon 占位策略。
 *
 * 只有「背后有活标签页在抓元数据」的行才值得转圈；书签/历史是**被动列表**，
 * 没有在途抓取，直接用站点首字母占位，真实图标（含导入时播种进共享镜像的快照）
 * 到达后原地替换。
 *
 * `isSavedBookmark` 优先：搜索结果的纯收藏行 `nodeType` 仍是 `'tab'`，但无活标签。
 */
export function faviconPropsForNode(node: BrowserTreeNode): BrowserTreeNodeFaviconProps {
  const passive =
    node.isSavedBookmark === true || node.nodeType === 'bookmark' || node.nodeType === 'history';
  return { url: node.url ?? '', pending: passive ? 'initial' : 'spinner' };
}
