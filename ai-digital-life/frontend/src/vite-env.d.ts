/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set when the bundle runs inside the Tauri WebView (Vite Tauri plugin). */
  readonly TAURI_ENV_PLATFORM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
