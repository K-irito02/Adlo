import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';

/**
 * 合并两个偏好补丁（后到者胜），用于 `updatePreferences` 的合并式排队：
 * 一次 in-flight 请求期间到达的多个补丁合并为**单次** IPC，既不丢用户操作，
 * 也不产生并发写 config.json 的竞态。
 *
 * `fonts` 做**一级深合并** —— 否则「改 uiFont」与「改 codeFont」两个补丁合并时
 * 后者的整体覆盖会把前者丢掉（Rust 侧 `apply_patch` 对 `fonts` 是逐子字段应用，
 * 合并时同样必须逐子字段，语义才能对齐）。
 */
export function mergePrefPatches(a: AppPreferencePatch, b: AppPreferencePatch): AppPreferencePatch {
  const merged: AppPreferencePatch = { ...a, ...b };
  if (a.fonts || b.fonts) {
    merged.fonts = { ...a.fonts, ...b.fonts };
  }
  return merged;
}
