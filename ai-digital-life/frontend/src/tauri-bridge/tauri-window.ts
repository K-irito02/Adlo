import { getCurrentWindow } from '@tauri-apps/api/window';
import { type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-shell';
import type { WindowBridge } from '../shared/ipc/window';

export function createTauriWindowBridge(): WindowBridge {
  const win = () => getCurrentWindow();
  return {
    minimize: () => win().minimize(),
    maximize: () => win().toggleMaximize(),
    close: () => win().close(),
    isMaximized: () => win().isMaximized(),
    setTitle: (title: string) => win().setTitle(title),
    show: () => win().show(),
    openExternal: (url: string) => open(url),
    onResized: (listener: () => void) => {
      let active = true;
      let ul: UnlistenFn | undefined;
      void win()
        .onResized(() => {
          if (active) {
            listener();
          }
        })
        .then((unlisten) => {
          if (active) {
            ul = unlisten;
          } else {
            void Promise.resolve(unlisten()).catch(() => {});
          }
        });
      return () => {
        active = false;
        void Promise.resolve(ul?.()).catch(() => {});
      };
    },
  };
}
