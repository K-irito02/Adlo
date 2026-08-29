/**
 * Frontend heuristic to detect download URLs.
 * Mirrors the Rust `is_download_url()` and JS `isDownloadUrl()` in init_script.js.
 * Used for restart suppression (skip WebView creation for known download URLs).
 */

const DOWNLOAD_EXTENSIONS = new Set([
  // Executables & packages
  'exe',
  'msi',
  'dmg',
  'pkg',
  'deb',
  'rpm',
  'apk',
  'ipa',
  'iso',
  'img',
  'cab',
  'msix',
  'appx',
  // Scripts
  'bat',
  'cmd',
  'ps1',
  'scr',
  'com',
  'pif',
  'vbs',
  'wsf',
  'hta',
  // Archives
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'bz2',
  'xz',
  // Documents
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'csv',
  'rtf',
  'odt',
  'ods',
  'odp',
  'key',
  // Media
  'mp3',
  'mp4',
  'avi',
  'mkv',
  'mov',
  'wmv',
  'flv',
  'webm',
  'ogg',
  'wav',
  'flac',
  'aac',
  'wma',
  // Fonts
  'ttf',
  'otf',
  'woff',
  'woff2',
  'eot',
  'svg',
]);

const DOWNLOAD_PATH_SEGMENTS = [
  '/files/',
  '/attachments/',
  '/download/',
  '/get/',
  '/export/',
  '/generate/',
];

export function isDownloadUrl(url: string): boolean {
  if (!url) {
    return false;
  }

  // 1. Query string signals — aligned with Rust is_download_url()
  if (/[?&]download=/i.test(url)) {
    return true;
  }

  // 2. Explicit download path segments
  const lowerUrl = url.toLowerCase();
  if (DOWNLOAD_PATH_SEGMENTS.some((seg) => lowerUrl.includes(seg))) {
    return true;
  }

  // 3. Extension-based detection (ignore fragments and query strings)
  try {
    const pathname = new URL(url).pathname;
    const lastSegment = pathname.split('/').pop() ?? '';
    const dotIndex = lastSegment.lastIndexOf('.');
    if (dotIndex !== -1) {
      const ext = lastSegment.slice(dotIndex + 1).toLowerCase();
      if (DOWNLOAD_EXTENSIONS.has(ext)) {
        return true;
      }
    }
  } catch {
    // Not a valid URL — fall through
  }

  return false;
}
