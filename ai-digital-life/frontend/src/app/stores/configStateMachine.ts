export interface ConfigSnapshot {
  language: string
  themeMode: "light" | "dark" | "system"
  logLevel: string
  [key: string]: unknown
}

export interface ConfigTransform {
  type: "SET_LANGUAGE" | "SET_THEME" | "SET_LOG_LEVEL" | "SET_PREFERENCE"
  payload: Record<string, unknown>
  timestamp: number
}

export interface ConfigState {
  current: ConfigSnapshot
  base: ConfigSnapshot
  transforms: ConfigTransform[]
}

export function createConfigState(base: ConfigSnapshot): ConfigState {
  return { current: { ...base }, base: { ...base }, transforms: [] }
}

export function applyTransform(state: ConfigState, transform: ConfigTransform): ConfigState {
  const next = { ...state.current, ...transform.payload }
  return { current: next, base: state.base, transforms: [...state.transforms, transform] }
}

export function reloadFromBase(base: ConfigSnapshot, transforms: ConfigTransform[]): ConfigState {
  let state = createConfigState(base)
  for (const t of transforms) { state = applyTransform(state, t) }
  return state
}

export function rollbackLastTransform(state: ConfigState): ConfigState {
  if (state.transforms.length === 0) { return state }
  const remaining = state.transforms.slice(0, -1)
  return reloadFromBase(state.base, remaining)
}
