import type { LogMode } from '@shared/ipc-types.generated';

/**
 * 浏览器模式下调试日志（`debug-logs*.txt`）的写入模式解析。
 *
 * 解析链（高 → 低）：**CLI/env 覆盖**（`VITE_ADL_DEBUG_LOG_MODE`，由启动脚本从
 * `--debug-log-mode` / `ADL_DEBUG_LOG_MODE` 注入）→ **用户设置**
 * （`appInfo.config.debugLogMode`，经 `/app/info` 读取）→ 默认 `overwrite`。
 *
 * 取代此前读取 `localStorage['adl_log_mode_debug']` 的实现 —— 该键的写端
 * `setLogMode` 全仓库零调用方，实践中恒为 fallback，设置项因此不生效（Issue 5）。
 */
export function isLogMode(value: unknown): value is LogMode {
  return value === 'overwrite' || value === 'append' || value === 'multi';
}

export function resolveBrowserDebugLogMode(
  envValue: string | undefined,
  configValue: string | undefined,
): LogMode {
  if (isLogMode(envValue)) {
    return envValue;
  }
  if (isLogMode(configValue)) {
    return configValue;
  }
  return 'overwrite';
}

/**
 * 生效模式合成（Closing L-8）：把"env → 用户设置 → 默认"链条抽成纯函数，
 * 供单测直接注入（collector 的真实函数读 `import.meta.env` + 动态 import store，
 * 不便单测；此处钉死合成语义）。
 */
export function resolveEffectiveDebugLogModeFromParts(
  envValue: string | undefined,
  configValue: string | undefined,
): LogMode {
  return resolveBrowserDebugLogMode(envValue, configValue);
}
