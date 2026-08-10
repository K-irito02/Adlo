import type { PartRecord } from '../../../kernel/types-part';
import type { SessionFileTabItem } from './SessionFileTabs';

/**
 * Map a part-stream `file` part URL onto a workspace-relative path, or
 * `undefined` when the URL cannot be mapped reliably.
 *
 * The `FilePartData.url` wire value may be a `file:///` URL (absolute), a bare
 * absolute path, or already a workspace-relative path. `openFile(relativePath)`
 * resolves against the active workspace root, so absolute forms only map when
 * they fall under `workspaceRoot` (compared case-insensitively, Windows-safe).
 * Any other absolute/remote URL is left unopened (`undefined`) rather than
 * guessing a bogus relative path.
 */
export function filePartUrlToWorkspaceRelativePath(
  url: string,
  workspaceRoot?: string,
): string | undefined {
  let path = url;
  if (path.startsWith('file://')) {
    // `file:///C:/ws/src/a.ts` → `C:/ws/src/a.ts` (strip the empty host slash
    // before a Windows drive); `file:///home/u/ws/a.ts` → `/home/u/ws/a.ts`.
    path = path.slice('file://'.length);
    if (/^\/[a-zA-Z]:[\\/]/.test(path)) {
      path = path.slice(1);
    }
  }
  path = path.replace(/\\/g, '/');
  if (!path) {
    return undefined;
  }

  if (workspaceRoot) {
    const root = workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    const lowerPath = path.toLowerCase();
    const lowerRoot = root.toLowerCase();
    if (lowerPath === lowerRoot) {
      return undefined;
    }
    if (lowerPath.startsWith(`${lowerRoot}/`)) {
      return path.slice(root.length + 1) || undefined;
    }
  }

  const looksAbsolute =
    path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path);
  if (looksAbsolute) {
    return undefined;
  }
  return path;
}

/** Collect the deduped `file` parts (`data.type === 'file'`) across a session. */
export function collectSessionFileParts(
  partsByMessage: ReadonlyMap<string, readonly PartRecord[]>,
): SessionFileTabItem[] {
  const seen = new Set<string>();
  const items: SessionFileTabItem[] = [];
  for (const parts of partsByMessage.values()) {
    for (const part of parts) {
      const data = part.data;
      if (data.type !== 'file') {
        continue;
      }
      if (seen.has(data.url)) {
        continue;
      }
      seen.add(data.url);
      items.push({ url: data.url, filename: data.filename });
    }
  }
  return items;
}
