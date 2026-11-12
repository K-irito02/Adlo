/**
 * Local absolute path → `file://` URL, shared by the address bar, the
 * agent-link open fallback and the file panel.
 *
 * Supports Windows drive paths (`C:\dir\a.html`), UNC paths
 * (`\\server\share\a.html`) and already-formed `file://` URLs. Path segments are
 * percent-encoded so file names containing `#`, `?` or `%` stay part of the
 * path instead of becoming fragment/query/malformed escapes.
 */

const WINDOWS_DRIVE_RE = /^[a-zA-Z]:[\\/]/;
const UNC_RE = /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/;

/** 是否为本地文件输入（`file://` URL、Windows 盘符路径或 UNC 路径）。 */
export function isLocalFilePath(input: string): boolean {
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
  return WINDOWS_DRIVE_RE.test(raw) || UNC_RE.test(raw);
}

function encodeSegments(segments: string[]): string[] {
  return segments.map((segment) => encodeURIComponent(segment));
}

/** 归一化 `.`/`..`；上溢出根时返回 null。 */
function normalizeSegments(segments: string[]): string[] | null {
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (resolved.length === 0) {
        return null;
      }
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved;
}

/**
 * 构造规范的 `file:///` URL。非本地输入返回 null。
 * 盘符路径保留 `C:` 前缀；UNC 保留服务器主机名。
 */
export function toLocalFileUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || !isLocalFilePath(raw)) {
    return null;
  }
  if (/^file:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return null;
    }
  }

  const forward = raw.replace(/\\/g, '/');
  if (forward.startsWith('//')) {
    const body = forward.slice(2);
    const slash = body.indexOf('/');
    if (slash <= 0) {
      return null;
    }
    const host = body.slice(0, slash);
    const segments = normalizeSegments(body.slice(slash + 1).split('/'));
    if (!segments) {
      return null;
    }
    return `file://${host}/${encodeSegments(segments).join('/')}`;
  }

  const match = /^([a-zA-Z]):\/?(.*)$/.exec(forward);
  if (!match) {
    return null;
  }
  const segments = normalizeSegments(match[2].split('/'));
  if (!segments) {
    return null;
  }
  return `file:///${match[1]}:/${encodeSegments(segments).join('/')}`;
}
