/**
 * Local file address handling for the built-in browser (Tauri desktop).
 * Browser mode shows a toast instead of attempting navigation.
 *
 * Path parsing/URL building lives in `shared/localFilePath` so the address bar,
 * agent-link fallback and file panel all share one implementation.
 */
import { isLocalFilePath, toLocalFileUrl } from '../../../shared/localFilePath';

const VIEWABLE_EXTENSIONS = new Set([
  'html',
  'htm',
  'xhtml',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'ico',
  'bmp',
  'txt',
  'md',
  'markdown',
  'json',
  'xml',
  'csv',
  'pdf',
  'mp3',
  'mp4',
  'webm',
  'ogg',
  'wav',
  'flac',
  'aac',
  'm4a',
  'mov',
]);

/** 是否为本地文件输入（`file://` URL、Windows 盘符路径或 UNC 路径）。 */
export function isLocalFileInput(input: string): boolean {
  return isLocalFilePath(input);
}

/**
 * Build the canonical `file:///` URL shown in address bars and handed to the WebView.
 * Returns null for non-local input.
 */
export function buildLocalFileUrl(input: string): string | null {
  return toLocalFileUrl(input);
}

export function isLocalViewableFileUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'file:') {
      return false;
    }
    // `%` in a file name is legal; a malformed escape must not hide the extension.
    let pathname = url.pathname || '';
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      pathname = url.pathname || '';
    }
    const match = /\.([a-z0-9]+)$/i.exec(pathname);
    if (!match) {
      return false;
    }
    return VIEWABLE_EXTENSIONS.has(match[1].toLowerCase());
  } catch {
    return false;
  }
}
