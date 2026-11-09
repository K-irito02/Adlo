import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n';
import { startBookmarkImportPick } from '../startBookmarkImportPick';

const t = {
  bookmarkImportTooLarge: '文件过大',
  bookmarkImportEmpty: '没有有效书签',
} as unknown as CopyDict;

const SAMPLE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://react.dev/" ADD_DATE="1700000000">React 文档</A>
    <DT><A HREF="https://vite.dev/" ADD_DATE="1700000300">Vite</A>
</DL><p>`;

const INVALID_ONLY = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<DL><p>
    <DT><A HREF="javascript:alert(1)">bad</A>
    <DT><A HREF="">empty</A>
</DL><p>`;

const originalShowToast = useAppStore.getState().showToast;
let toastSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.body.innerHTML = '';
  toastSpy = vi.fn();
  useAppStore.setState({
    showToast: toastSpy,
    bookmarkTransferDialog: null,
    bookmarkImportDraft: null,
  });
});

afterEach(() => {
  useAppStore.setState({ showToast: originalShowToast });
});

// jsdom 的 File 未实现 Blob.text()，这里按目标环境（WebView2/浏览器）补齐
function makeFile(content: string, name: string): File {
  const file = new File([content], name, { type: 'text/html' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) });
  return file;
}

function lastFileInput(): HTMLInputElement {
  const inputs = document.body.querySelectorAll('input[type="file"]');
  expect(inputs.length).toBe(1);
  return inputs[0] as HTMLInputElement;
}

function pickFile(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
}

describe('startBookmarkImportPick', () => {
  it('opens a file input inside the caller and stashes the parsed draft on change', async () => {
    startBookmarkImportPick(t);
    expect(useAppStore.getState().bookmarkTransferDialog).toBeNull();

    pickFile(lastFileInput(), makeFile(SAMPLE, 'bookmarks.html'));

    await vi.waitFor(() => {
      expect(useAppStore.getState().bookmarkTransferDialog).toBe('import');
    });
    const draft = useAppStore.getState().bookmarkImportDraft;
    expect(draft?.fileName).toBe('bookmarks.html');
    expect(draft?.invalidCount).toBe(0);
    expect(draft?.nodes.map((n) => (n.kind === 'bookmark' ? n.url : n.folder.name))).toEqual([
      'https://react.dev/',
      'https://vite.dev/',
    ]);
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('rejects an oversized file with a toast and opens no dialog', async () => {
    startBookmarkImportPick(t);
    const file = new File(['<html></html>'], 'big.html', { type: 'text/html' });
    Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 + 1 });
    pickFile(lastFileInput(), file);

    await vi.waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith('文件过大', 'error');
    });
    expect(useAppStore.getState().bookmarkTransferDialog).toBeNull();
    expect(useAppStore.getState().bookmarkImportDraft).toBeNull();
  });

  it('rejects a file with no valid bookmarks with a toast and opens no dialog', async () => {
    startBookmarkImportPick(t);
    pickFile(lastFileInput(), makeFile(INVALID_ONLY, 'bad.html'));

    await vi.waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith('没有有效书签', 'error');
    });
    expect(useAppStore.getState().bookmarkTransferDialog).toBeNull();
    expect(useAppStore.getState().bookmarkImportDraft).toBeNull();
  });

  it('removes the input and keeps state untouched when the picker is cancelled', () => {
    startBookmarkImportPick(t);
    const input = lastFileInput();
    input.dispatchEvent(new Event('cancel'));

    expect(document.body.querySelector('input[type="file"]')).toBeNull();
    expect(useAppStore.getState().bookmarkTransferDialog).toBeNull();
    expect(useAppStore.getState().bookmarkImportDraft).toBeNull();
  });
});
