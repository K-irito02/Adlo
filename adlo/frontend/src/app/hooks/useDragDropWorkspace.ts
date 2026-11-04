import { useEffect } from 'react';
import { isTauriShell } from '../../tauri-bridge';

export function useDragDropWorkspace(actions: {
  openWorkspace: (path: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    let unlisten: undefined | (() => void);

    void (async () => {
      try {
        const mod = await import('@tauri-apps/api/window');
        const win = mod.getCurrentWindow();
        unlisten = await (
          win as unknown as { onDragDropEvent: (cb: (e: unknown) => void) => Promise<() => void> }
        ).onDragDropEvent((e: unknown) => {
          const payload = (e as Record<string, unknown>)?.payload ?? e;
          const pl = payload as Record<string, unknown>;
          const type =
            (pl?.type as string | undefined) ??
            (pl?.event as string | undefined) ??
            (pl?.kind as string | undefined);
          if (type !== 'drop') {
            return;
          }
          const paths: string[] =
            (pl?.paths as string[] | undefined) ??
            ((pl?.data as Record<string, unknown> | undefined)?.paths as string[] | undefined) ??
            (pl?.files as string[] | undefined) ??
            ((pl?.data as Record<string, unknown> | undefined)?.files as string[] | undefined) ??
            [];
          const first = Array.isArray(paths) ? paths[0] : undefined;
          if (first && typeof first === 'string') {
            void actions.openWorkspace(first);
          }
        });
      } catch {
        // Best-effort: drag-drop open is only available in Tauri shell.
      }
    })();

    return () => {
      try {
        unlisten?.();
      } catch {
        /* ignore */
      }
    };
  }, [actions, actions.openWorkspace]);

  useEffect(() => {
    if (isTauriShell()) {
      return;
    }

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'link';
      }
    };

    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      if (!event.dataTransfer) {
        return;
      }
      const items = event.dataTransfer.items;
      if (!items || items.length === 0) {
        return;
      }
      for (const item of items) {
        const entry = item.webkitGetAsEntry?.();
        if (entry && entry.isDirectory) {
          const file = item.getAsFile();
          if (file) {
            const path = (file as File & { path?: string }).path;
            if (path) {
              void actions.openWorkspace(path);
              return;
            }
            void actions.openWorkspace(file.name);
            return;
          }
        }
      }
      const file = items[0].getAsFile();
      if (file) {
        const path = (file as File & { path?: string }).path;
        if (path) {
          void actions.openWorkspace(path);
        }
      }
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, [actions, actions.openWorkspace]);
}
