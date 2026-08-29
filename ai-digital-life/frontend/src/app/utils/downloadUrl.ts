/**
 * Frontend heuristic to detect download URLs.
 * Mirrors the Rust `is_download_url()` (browser_webview_setup.rs) and JS
 * `isDownloadUrl()` (crates/browser/src/init_script.js). The extension set and
 * query/path heuristics below must be kept in sync across all three sites.
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
  'js',
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

  const lowerUrl = url.toLowerCase();
  let pathname = '';
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    // Not a valid URL — fall through to substring heuristics
  }

  // 1. Query string signals — aligned with Rust/JS `download=`
  if (/[?&]download=/i.test(url)) {
    return true;
  }

  // 2. Explicit download path segments
  if (DOWNLOAD_PATH_SEGMENTS.some((seg) => lowerUrl.includes(seg))) {
    return true;
  }

  // 3. file=/attachment= query param combined with a download-related path
  if (/[?&](file|attachment)=/i.test(url) && /(download|files|export)/i.test(pathname)) {
    return true;
  }

  // 4. Extension-based detection (ignore fragments and query strings)
  const lastSegment = pathname.split('/').pop() ?? '';
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex !== -1) {
    const ext = lastSegment.slice(dotIndex + 1).toLowerCase();
    if (DOWNLOAD_EXTENSIONS.has(ext)) {
      return true;
    }
  }

  return false;
}
