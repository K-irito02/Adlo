import type { UnlistenFn } from '@tauri-apps/api/event';
import type { Window } from '@tauri-apps/api/window';
import type { WindowBridge } from '../shared/ipc/window';

interface TauriWindowModule {
  getCurrentWindow(): Window;
}

interface TauriShellModule {
  open(path: string, openWith?: string): Promise<void>;
}

let windowModule: TauriWindowModule | undefined;
let shellModule: TauriShellModule | undefined;

async function getWin() {
  windowModule ??= await import('@tauri-apps/api/window');
  return windowModule.getCurrentWindow();
}

export function createTauriWindowBridge(): WindowBridge {
  return {
    minimize: () => getWin().then((w) => w.minimize()),
    maximize: () => getWin().then((w) => w.toggleMaximize()),
    close: () => getWin().then((w) => w.close()),
    isMaximized: () => getWin().then((w) => w.isMaximized()),
    setTitle: (title: string) => getWin().then((w) => w.setTitle(title)),
    show: () => getWin().then((w) => w.show()),
    openExternal: async (url: string) => {
      shellModule ??= await import('@tauri-apps/plugin-shell');
      return shellModule.open(url);
    },
    onResized: (listener: () => void) => {
      let active = true;
      let ul: UnlistenFn | undefined;
      void getWin()
        .then((w) =>
          w.onResized(() => {
            if (active) {
              listener();
            }
          }),
        )
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
