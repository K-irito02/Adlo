/**
 * Local file address handling for the built-in browser (Tauri desktop).
 * Browser mode shows a toast instead of attempting navigation.
 */
const WINDOWS_DRIVE_RE = /^[a-zA-Z]:[\\/]/;

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

export function isLocalFileInput(input: string): boolean {
  const raw = input.trim();
  if (!raw) {
    return false;
  }
  if (/^file:\/\//i.test(raw)) {
    try {
      return new URL(raw).protocol === 'file:';
    } catch {
      return false;
    }
  }
  return WINDOWS_DRIVE_RE.test(raw);
}

function normalizeWindowsDriveInput(raw: string): string {
  const normalized = raw.trim().replace(/\\/g, '/');
  // Remove `.`/`..` segments before parsing; local file addresses are absolute.
  // Keep the trailing/leading slashes as typed.
  const url = new URL(`file:///${normalized}`);
  return url.href;
}

/**
 * Build the canonical `file:///` URL shown in address bars and handed to the WebView.
 * Returns null for non-local input.
 */
export function buildLocalFileUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || !isLocalFileInput(raw)) {
    return null;
  }
  if (/^file:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return null;
    }
  }
  try {
    return normalizeWindowsDriveInput(raw);
  } catch {
    return null;
  }
}

export function isLocalViewableFileUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'file:') {
      return false;
    }
    const pathname = decodeURIComponent(url.pathname || '');
    const match = /\.([a-z0-9]+)$/i.exec(pathname);
    if (!match) {
      return false;
    }
    return VIEWABLE_EXTENSIONS.has(match[1].toLowerCase());
  } catch {
    return false;
  }
}
