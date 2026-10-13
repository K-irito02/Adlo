import type {
  AppInfo,
  AppPreferencePatch,
  HealthSnapshot,
  IpcResult,
  RuntimeDiagnosticsSnapshot,
  SettingItem,
  SettingsGroupId,
  UpdatePreferencesResult,
} from '@ai-digital-life/kernel';

export type {
  AppInfo,
  AppPreferencePatch,
  HealthSnapshot,
  IpcResult,
  RuntimeDiagnosticsSnapshot,
  SettingItem,
  SettingsGroupId,
  UpdatePreferencesResult,
};

/**
 * 应用信息与健康状态桥接能力
 * 用于: 获取应用名称、版本、配置、当前工作区、健康状态、诊断信息
 * Tauri 命令: app_get_info / app_get_health / app_get_diagnostics / app_update_preferences
 * 浏览器模式: 返回静态 mock 数据
 */
export interface AppBridge {
  /**
   * 获取应用信息
   * @returns 应用名称、版本、配置、当前工作区等信息
   * @command app_get_info
   * @see tauri-bridge.ts → app.getInfo
   * @see mock-bridge.ts → app.getInfo
   * @see preview-bridge/index.ts → app.getInfo
   */
  getInfo: () => Promise<IpcResult<AppInfo>>;
  /**
   * 获取应用健康状态
   * @returns 各组件 (main/worker/storage/recovery/migration) 的健康状态
   * @command app_get_health
   * @see tauri-bridge.ts → app.getHealth
   * @see mock-bridge.ts → app.getHealth
   * @see preview-bridge/index.ts → app.getHealth
   */
  getHealth: () => Promise<IpcResult<HealthSnapshot>>;
  /**
   * 获取运行时诊断信息
   * @returns 生命周期、迁移状态、事件统计、最近错误等诊断快照
   * @command app_get_diagnostics
   * @see tauri-bridge.ts → app.getDiagnostics
   * @see mock-bridge.ts → app.getDiagnostics
   * @see preview-bridge/index.ts → app.getDiagnostics
   */
  getDiagnostics: () => Promise<IpcResult<RuntimeDiagnosticsSnapshot>>;
  /**
   * 更新应用偏好设置
   * @param patch 对现有配置的增量修改
   * @returns 更新后的完整应用信息 + 被会话级 CLI/env 覆盖锁定的字段
   * @command app_update_preferences
   * @see tauri-bridge.ts → app.updatePreferences
   * @see mock-bridge.ts → app.updatePreferences
   * @see preview-bridge/index.ts → app.updatePreferences
   */
  updatePreferences: (patch: AppPreferencePatch) => Promise<IpcResult<UpdatePreferencesResult>>;
}
