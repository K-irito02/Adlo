import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n';
import { parseBookmarkHtml } from './bookmarkHtml';
import { countBookmarks, MAX_BOOKMARK_FILE_BYTES } from './useBookmarkTransfer';

/**
 * 菜单「导入书签」入口：在用户手势内直接创建并点击 file input，
 * 让系统文件选择器立即弹出（跳过导入对话框里的「选文件」按钮）。
 * 解析成功则暂存 draft 并打开导入对话框（直接落在勾选步骤）；失败走 toast；
 * 用户取消选择器则静默返回。
 */
export function startBookmarkImportPick(t: CopyDict): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.html,.htm,text/html';
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const file = input.files?.[0] ?? null;
    input.remove();
    handleFile(file, t).catch(() => {
      const { showToast } = useAppStore.getState();
      showToast(t.bookmarkImportFailed as string, 'error');
    });
  });
  input.addEventListener('cancel', () => input.remove());
  document.body.appendChild(input);
  input.click();
}

async function handleFile(file: File | null, t: CopyDict): Promise<void> {
  if (!file) {
    return;
  }
  const { showToast } = useAppStore.getState();
  if (file.size > MAX_BOOKMARK_FILE_BYTES) {
    showToast(t.bookmarkImportTooLarge as string, 'error');
    return;
  }
  const html = await file.text();
  const parsed = parseBookmarkHtml(html);
  if (countBookmarks(parsed.nodes) === 0) {
    showToast(t.bookmarkImportEmpty as string, 'error');
    return;
  }
  useAppStore.getState().setBookmarkImportDraft({
    fileName: file.name,
    nodes: parsed.nodes,
    invalidCount: parsed.invalidCount,
  });
  useAppStore.getState().setBookmarkTransferDialog('import');
}
