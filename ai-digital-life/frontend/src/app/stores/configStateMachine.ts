export interface ConfigSnapshot {
  language: string;
  themeMode: 'light' | 'dark' | 'system';
  logLevel: string;
  [key: string]: unknown;
}

/** 前端侧 ConfigTransform（内部状态机追踪格式）。
 * shape: `{type:"SET_LANGUAGE", payload:{language:"en-US"}, timestamp:1234}`
 * Rust 端（crates/kernel/src/types/config.rs）使用不同 shape（IPC 线格式）：
 * `{"type":"SET_LANGUAGE","language":"en-US"}` — 二者有意不同，前端为内部状态管理，Rust 为序列化契约。 */
export type ConfigTransform =
  | { type: 'SET_LANGUAGE'; payload: { language: string }; timestamp: number }
  | { type: 'SET_THEME'; payload: { themeMode: 'light' | 'dark' | 'system' }; timestamp: number }
  | { type: 'SET_LOG_LEVEL'; payload: { logLevel: string }; timestamp: number }
  | { type: 'SET_PREFERENCE'; payload: { key: string; value: unknown }; timestamp: number };

export interface ConfigState {
  current: ConfigSnapshot;
  base: ConfigSnapshot;
  transforms: ConfigTransform[];
}

export function createConfigState(base: ConfigSnapshot): ConfigState {
  return { current: { ...base }, base: { ...base }, transforms: [] };
}

export function applyTransform(state: ConfigState, transform: ConfigTransform): ConfigState {
  const next = { ...state.current, ...transform.payload };
  return { current: next, base: state.base, transforms: [...state.transforms, transform] };
}

export function reloadFromBase(base: ConfigSnapshot, transforms: ConfigTransform[]): ConfigState {
  let state = createConfigState(base);
  for (const t of transforms) {
    state = applyTransform(state, t);
  }
  return state;
}

export function rollbackLastTransform(state: ConfigState): ConfigState {
  if (state.transforms.length === 0) {
    return state;
  }
  const remaining = state.transforms.slice(0, -1);
  return reloadFromBase(state.base, remaining);
}
