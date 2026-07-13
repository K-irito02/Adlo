import type { BrowserAudioMonitor } from '../preview-bridge/preview-browser-audio';

declare global {
  interface Window {
    __adlAudioMonitor?: BrowserAudioMonitor;
  }
}

export {};
