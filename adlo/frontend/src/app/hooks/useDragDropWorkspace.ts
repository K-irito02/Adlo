import { useEffect } from 'react';
import { isTauriShell } from '../../tauri-bridge';
import { subscribeChannel } from '../../tauri-bridge/tauri-shared';
import { forwardNativeFileDrop } from './fileDropRouter';

export function useDragDropWorkspace(actions: {
  openWorkspace: (path: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }

    // 原生文件落点的统一主通道：Windows 由自有 OLE target 广播；其它平台由
    // `main.rs` 的 `RunEvent::WindowEvent::DragDrop` 桥接成同名事件。只订阅这一条，
    // 避免同一落点同时经 `adl:file-drop` 与 `tauri://drag-drop` 各打开一次。
    const unsubscribeChannel = subscribeChannel<{ type?: string; paths?: string[] }>(
      'adl:file-drop',
      (payload) => {
        if (payload?.type !== 'drop') {
          return;
        }
        const paths = Array.isArray(payload.paths) ? payload.paths : [];
        if (paths.length === 0) {
          return;
        }
        forwardNativeFileDrop({ paths }, (path) => void actions.openWorkspace(path));
      },
    );

    return () => {
      unsubscribeChannel();
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
