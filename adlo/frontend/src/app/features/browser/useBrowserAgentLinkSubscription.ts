import { useEffect } from 'react';
import { isTauriShell } from '@shared/env';
import { openFileByMethod, openUrlByMethod } from '@features/preview/openByMethod';

/**
 * Normalize an intercepted agent-link `file` payload into a local absolute path.
 *
 * The injected script sends the anchor's `href`, which for local files is a
 * `file://` URL (e.g. `file:///C:/ws/a.md`). `openFileByMethod` expects a plain
 * local path, so strip the scheme, percent-decode, and repair the Windows drive
 * form (`/C:/...` -> `C:/...`). Non-file inputs are returned unchanged.
 */
export function fileUrlToLocalPath(raw: string): string {
  if (!/^file:\/\//i.test(raw)) {
    return raw;
  }
  let path = raw;
  try {
    path = decodeURIComponent(new URL(raw).pathname);
  } catch {
    path = decodeURIComponent(raw.replace(/^file:\/\//i, ''));
  }
  // Windows drive form produced by `new URL()`: `/C:/ws/a.md` -> `C:/ws/a.md`.
  if (/^\/[a-zA-Z]:/.test(path)) {
    path = path.slice(1);
  }
  return path;
}

/**
 * Resolve the open-method settings for an intercepted agent-site link:
 * `url` -> `openUrlByMethod`, `file` -> `openFileByMethod` (with the payload
 * normalized to a local absolute path first). Tauri-only: in browser mode the
 * agent site is a cross-origin iframe and no injection/interception happens.
 */
export function useBrowserAgentLinkSubscription(): void {
  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    const bridge = window.digitalLife?.browser;
    if (!bridge?.onAgentLink) {
      return;
    }
    return bridge.onAgentLink(({ kind, url }) => {
      if (kind === 'url') {
        openUrlByMethod(url);
        return;
      }
      openFileByMethod(fileUrlToLocalPath(url));
    });
  }, []);
}
