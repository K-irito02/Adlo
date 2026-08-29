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

  // Parse once; both search and pathname are query-scope aligned with Rust/JS
  // (fragments are not part of the query scope, matching `url.query()` / `u.search`).
  const parsed = (() => {
    try {
      const u = new URL(url);
      return { search: u.search.toLowerCase(), pathname: u.pathname.toLowerCase(), searchParams: u.searchParams };
    } catch {
      // Not a valid URL — fall through with empty search/pathname
      return { search: '', pathname: '', searchParams: null };
    }
  })();
  const { search, pathname } = parsed;

  // 1. `download` must be a standalone query key (case-insensitive), aligned with
  //    Rust `query_pairs()` and JS `searchParams` key scan — not a substring inside a value.
  if (parsed.searchParams && [...parsed.searchParams.keys()].some((k) => k.toLowerCase() === 'download')) {
    return true;
  }

  // 2. Explicit download path segments — aligned with Rust/JS (path-scoped only)
  if (DOWNLOAD_PATH_SEGMENTS.some((seg) => pathname.includes(seg))) {
    return true;
  }

  // 3. file=/attachment= query param combined with a download-related path
  if (/[?&](file|attachment)=/i.test(search) && /(download|files|export)/i.test(pathname)) {
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
