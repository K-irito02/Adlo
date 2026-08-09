import { invoke } from '@tauri-apps/api/core';
import type { DigitalLifeBridge } from '../shared/ipc/digital-life';
import type { PtyOutputEvent } from '../shared/ipc/pty';
import type {
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
  DigitalLifeTerminalStreamEventV1,
} from '@ai-digital-life/kernel';
import { EventBuffer } from '../shared/eventBuffer';
import { subscribeChannel } from './tauri-shared';
import { createHttpBridge, resolveAdlServerBaseUrl } from '../httpBridge';
import { createTauriAppBridge } from './tauri-app';
import { createTauriBrowserBridge } from './tauri-browser';
import { createTauriPtyBridge } from './tauri-pty';
import { createTauriReservedBridge } from './tauri-reserved';
import { createTauriWindowBridge } from './tauri-window';

/**
 * Compose the Tauri `DigitalLifeBridge`: every business domain delegates to
 * [`createHttpBridge`] (the standalone ad-server is the single business
 * backend over HTTP), while the system/shell capabilities stay on Tauri:
 * `window`, `app`, `browser`, `pty` and `reserved` keep their `invoke` /
 * native implementations, the stream subscriptions keep the Tauri event
 * channels, and `setLogMode` keeps `app_set_log_mode`.
 *
 * @param baseUrl ad-server base URL; defaults to `resolveAdlServerBaseUrl()`
 * (`VITE_ADL_SERVER_URL` or `http://127.0.0.1:61234`). Task 9 wires the port
 * the dev script discovers.
 */
export function createTauriBridge(baseUrl?: string): DigitalLifeBridge {
  const http = createHttpBridge({ baseUrl: baseUrl ?? resolveAdlServerBaseUrl() });
  return {
    ...http,

    subscribeModelStream: (listener: (event: DigitalLifeModelStreamEventV1) => void) => {
      const buf = new EventBuffer<DigitalLifeModelStreamEventV1>();
      const channelSub = subscribeChannel<DigitalLifeModelStreamEventV1>(
        'digital-life://model-stream',
        (payload) => {
          buf.push(payload);
          buf.scheduleFlush((events) => {
            for (const event of events) {
              listener(event);
            }
          });
        },
      );
      return channelSub;
    },

    subscribeRunActivity: (listener: (event: DigitalLifeRunActivityEventV1) => void) =>
      subscribeChannel<DigitalLifeRunActivityEventV1>('digital-life://run-activity', listener),

    subscribeTerminalStream: (listener: (event: DigitalLifeTerminalStreamEventV1) => void) =>
      subscribeChannel<DigitalLifeTerminalStreamEventV1>(
        'digital-life://terminal-stream',
        listener,
      ),

    subscribePtyOutput: (listener: (event: PtyOutputEvent) => void) =>
      subscribeChannel<PtyOutputEvent>('digital-life://pty-output', listener),

    setLogMode: async (target: 'terminal' | 'debug', mode: 'overwrite' | 'append' | 'multi') => {
      await invoke('app_set_log_mode', { target, mode });
    },

    window: createTauriWindowBridge(),
    app: createTauriAppBridge(),
    browser: createTauriBrowserBridge(),
    pty: createTauriPtyBridge(),
    reserved: createTauriReservedBridge(),
  };
}

export { isTauriShell } from './tauri-shared';
