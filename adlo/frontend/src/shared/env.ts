export function isTauriShell(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export type RuntimeEnv = 'tauri' | 'browser';

export function getRuntimeEnv(): RuntimeEnv {
  return isTauriShell() ? 'tauri' : 'browser';
}
