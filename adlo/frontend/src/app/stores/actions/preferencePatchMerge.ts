import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';

/**
 * 合并两个偏好补丁（后到者胜），用于 `updatePreferences` 的合并式排队：
 * 一次 in-flight 请求期间到达的多个补丁合并为**单次** IPC，既不丢用户操作，
 * 也不产生并发写 config.json 的竞态。
 *
 * `fonts` 做**一级深合并** —— 否则「改 uiFont」与「改 codeFont」两个补丁合并时
 * 后者的整体覆盖会把前者丢掉（Rust 侧 `apply_patch` 对 `fonts` 是逐子字段应用，
 * 合并时同样必须逐子字段，语义才能对齐）。
 *
 * `modelPreferences` 做 **provider key 一级合并**（`{...a.modelPreferences,
 * ...b.modelPreferences}`）—— 与 mock 侧 `preferencesMerger` 的逐 provider
 * 语义对齐到 provider 一层；同 provider 内的字段仍整对象后胜（该字段 Rust 侧
 * 忽略、无持久化后果，见"遗留"记录）。
 *
 * `keybinds` 保持整 map 覆盖：调用方必须发全量 keybinds map（UI 侧恒全量），
 * 局部 keybind 补丁不允许进入队列。
 */
export function mergePrefPatches(a: AppPreferencePatch, b: AppPreferencePatch): AppPreferencePatch {
  const merged: AppPreferencePatch = { ...a, ...b };
  if (a.fonts || b.fonts) {
    merged.fonts = { ...a.fonts, ...b.fonts };
  }
  if (a.modelPreferences || b.modelPreferences) {
    merged.modelPreferences = { ...a.modelPreferences, ...b.modelPreferences };
  }
  return merged;
}
