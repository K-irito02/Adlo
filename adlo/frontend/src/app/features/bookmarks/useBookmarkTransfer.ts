import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import type { CopyDict } from '@i18n';
import { isTauriShell } from '@shared/env';
import { getFaviconUrl } from '@utils/favicon';
import { serializeBookmarkHtml } from './bookmarkHtml';
import type { TransferNode } from './bookmarkTransferTypes';

/** 导入文件大小上限：超过直接拒绝，不做流式解析。 */
export const MAX_BOOKMARK_FILE_BYTES = 10 * 1024 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** 收集导出树里每个 URL 的内联图标；只接受 data URI（`ICON` 属性要的就是它）。 */
function collectIcons(nodes: TransferNode[], out = new Map<string, string>()): Map<string, string> {
  for (const node of nodes) {
    if (node.kind === 'folder') {
      collectIcons(node.folder.children, out);
      continue;
    }
    if (out.has(node.url)) {
      continue;
    }
    // 书签条目自带的图标优先（从导入文件保留下来），没有再回退站点元数据缓存
    if (node.icon) {
      out.set(node.url, node.icon);
      continue;
    }
    const icon = getFaviconUrl(node.url);
    if (icon.startsWith('data:')) {
      out.set(node.url, icon);
    }
  }
  return out;
}

function triggerBrowserDownload(fileName: string, html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function useBookmarkTransfer() {
  const showToast = useAppStore((s) => s.showToast);
  const { t, formatT } = useTCopy();

  const exportBookmarks = useCallback(
    async (nodes: TransferNode[], rootName: string): Promise<boolean> => {
      const fileName = `${rootName.trim() || 'bookmarks'}.html`;
      const html = serializeBookmarkHtml(rootName, nodes, collectIcons(nodes));
      const count = countBookmarks(nodes);

      if (!isTauriShell()) {
        // 浏览器模式：原生下载（无系统"另存为"对话框）
        triggerBrowserDownload(fileName, html);
        showToast(
          formatT(t as CopyDict, 'bookmarkExportSuccess', { count, file: fileName }),
          'success',
        );
        return true;
      }

      const result = await window.digitalLife.fileSave.saveToFile({
        suggestedName: fileName,
        dataBase64: bytesToBase64(new TextEncoder().encode(html)),
      });
      if (!result.ok) {
        showToast(t.bookmarkExportFailed as string, 'error');
        return false;
      }
      // 取消保存对话框：用户主动放弃，不提示
      if (!result.data.path) {
        return false;
      }
      showToast(
        formatT(t as CopyDict, 'bookmarkExportSuccess', { count, file: result.data.path }),
        'success',
      );
      return true;
    },
    [showToast, t, formatT],
  );

  return { exportBookmarks };
}

export function countBookmarks(nodes: TransferNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += node.kind === 'bookmark' ? 1 : countBookmarks(node.folder.children);
  }
  return count;
}

export function countFolders(nodes: TransferNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.kind === 'folder') {
      count += 1 + countFolders(node.folder.children);
    }
  }
  return count;
}
