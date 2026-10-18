use adl_errors::AppError;
use adl_logging::LogMode;
use adl_types::CommandConfig;
use adl_types::types::ThemeMode;
use adl_types::types::config::{AppPreferencePatch, FileOpenMethod, LinkOpenMethod, LogLevel};
use adl_types::types::reference::ReferenceConfig;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use ts_rs::TS;

/// 与前端 `shared/defaultPreferences.ts::DEFAULT_LANGUAGE` 同一产品默认（`"system"` =
/// 跟随系统语言，前端经 `i18n/resolveLanguage.ts` 解析 zh* → zh-CN，其余 → en-US）。
/// 改动时两处必须同步（跨语言契约）。
const DEFAULT_LANGUAGE: &str = "system";
const DEFAULT_MAX_RECENT_WORKSPACES: usize = 10;

fn default_max_concurrent_workspaces() -> usize {
    6
}

/// 与前端 `DEFAULT_BROWSER_SUSPEND_MS` 是同一产品默认（15 分钟 = 900_000）。
/// 改动时两处必须同步（跨语言契约：Rust 侧 `app.rs` 断言字面量，前端钉值测试）。
fn default_browser_inactive_tab_suspend_ms() -> u64 {
    900_000
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]

pub struct AppConfig {
    pub language: String,
    pub theme_mode: ThemeMode,
    /// 日志详细程度（派生为 LogConfig.log_level）。缺省 = `info`。
    #[serde(default)]
    pub log_level: LogLevel,
    /// 终端日志模式（派生为 LogConfig.terminal_log_mode）。
    #[serde(default)]
    pub terminal_log_mode: LogMode,
    /// 调试日志模式（派生为 LogConfig.debug_log_mode）。
    #[serde(default)]
    pub debug_log_mode: LogMode,
    pub max_recent_workspaces: usize,
    /// User-defined slash commands.
    #[serde(default)]
    pub commands: Vec<CommandConfig>,
    /// Reference directories (extra accessible paths).
    #[serde(default)]
    #[ts(skip)]
    pub references: Vec<ReferenceConfig>,
    /// User-defined keyboard shortcuts (command ID → keybinding string).
    #[serde(default)]
    pub keybinds: std::collections::BTreeMap<String, String>,
    /// User-defined font preferences.
    #[serde(default)]
    pub fonts: adl_types::types::config::FontPreferences,
    /// Maximum concurrent workspace loads during the priority (startup) phase.
    #[serde(default = "default_max_concurrent_workspaces")]
    pub max_concurrent_workspaces: usize,
    /// Workspace IDs loaded synchronously at startup (blocks first screen).
    #[serde(default)]
    pub workspace_priority_ids: Vec<String>,
    /// Workspace IDs loaded asynchronously after first screen is ready.
    #[serde(default)]
    pub workspace_deferred_ids: Vec<String>,
    /// Workspace IDs loaded after priority and deferred phases complete.
    /// Default order: newest-added first (user can customize via drag-and-drop).
    #[serde(default)]
    pub workspace_natural_order: Vec<String>,
    /// Browser 标签页空闲挂起阈值（毫秒）。默认 15 分钟（900_000），供 tab suspend 调度器读取。
    #[serde(default = "default_browser_inactive_tab_suspend_ms")]
    pub browser_inactive_tab_suspend_ms: u64,
    /// 网址链接默认打开落点（提前/相对于面板/外部浏览器）。
    #[serde(default)]
    pub link_open_method: LinkOpenMethod,
    /// 本地文件默认打开方式（文件面板/系统默认应用）。
    #[serde(default)]
    pub file_open_method: FileOpenMethod,
    /// 智能体站点正文链接拦截开关。
    #[serde(default)]
    pub agent_link_intercept: bool,
    /// 需拦截的智能体站点 origin 白名单（整站匹配）。
    #[serde(default)]
    pub agent_site_whitelist: Vec<String>,
}

impl AppConfig {
    /// 从 AppConfig 提取 LogConfig（日志子系统运行时视图）。
    ///
    /// 所有权关系：AppConfig 是配置真源，LogConfig 是其子视图。
    /// 调用方应通过此方法派生 LogConfig，避免手动复制字段导致不一致。
    pub fn to_log_config(&self) -> adl_logging::config::LogConfig {
        adl_logging::config::LogConfig {
            terminal_log_mode: self.terminal_log_mode,
            debug_log_mode: self.debug_log_mode,
            log_level: self.log_level,
        }
    }

    /// 应用会话级日志覆盖（CLI flag / 环境变量）：**只改内存，不落盘**。
    /// `RUST_LOG` 的优先级由 `LogManager` 内部处理（作为全局基础 filter）。
    ///
    /// 调用方必须保证此实例随后不被 `save_to`（否则 session-only 值即被持久化；
    /// "不落盘"完全依赖调用方自律，类型上无标记）。
    pub fn apply_log_overrides(&mut self, overrides: &adl_logging::LogOverrides) {
        if let Some(v) = overrides.log_level {
            self.log_level = v;
        }
        if let Some(v) = overrides.terminal_log_mode {
            self.terminal_log_mode = v;
        }
        if let Some(v) = overrides.debug_log_mode {
            self.debug_log_mode = v;
        }
    }

    /// 应用偏好补丁（shell 的 `app_update_preferences` 与 ad-server 的
    /// `/app/preferences` 共用，杜绝两份字段映射漂移）。
    ///
    /// 仅覆盖补丁中显式提供的字段；`fonts` 逐子字段覆盖（不整体替换）。
    /// 日志字段的**运行时生效**由调用方转交 `LogManager`（见
    /// `adl_logging::LogSettingsChange`），本方法只改内存配置。
    pub fn apply_patch(&mut self, patch: &AppPreferencePatch) {
        if let Some(language) = patch.language.as_ref() {
            self.language = language.clone();
        }
        if let Some(mode) = patch.theme_mode {
            self.theme_mode = mode;
        }
        if let Some(level) = patch.log_level {
            self.log_level = level;
        }
        if let Some(mode) = patch.terminal_log_mode {
            self.terminal_log_mode = mode;
        }
        if let Some(mode) = patch.debug_log_mode {
            self.debug_log_mode = mode;
        }
        if let Some(keybinds) = patch.keybinds.as_ref() {
            self.keybinds = keybinds.clone();
        }
        if let Some(fonts) = patch.fonts.as_ref() {
            if fonts.ui_font.is_some() {
                self.fonts.ui_font = fonts.ui_font.clone();
            }
            if fonts.code_font.is_some() {
                self.fonts.code_font = fonts.code_font.clone();
            }
            if fonts.terminal_font.is_some() {
                self.fonts.terminal_font = fonts.terminal_font.clone();
            }
        }
        if let Some(v) = patch.max_concurrent_workspaces {
            self.max_concurrent_workspaces = v.clamp(1, 20);
        }
        if let Some(v) = patch.workspace_priority_ids.as_ref() {
            self.workspace_priority_ids = v.clone();
        }
        if let Some(v) = patch.workspace_deferred_ids.as_ref() {
            self.workspace_deferred_ids = v.clone();
        }
        if let Some(v) = patch.workspace_natural_order.as_ref() {
            self.workspace_natural_order = v.clone();
        }
        if let Some(v) = patch.browser_inactive_tab_suspend_ms {
            self.browser_inactive_tab_suspend_ms = v;
        }
        if let Some(v) = patch.link_open_method {
            self.link_open_method = v;
        }
        if let Some(v) = patch.file_open_method {
            self.file_open_method = v;
        }
        if let Some(v) = patch.agent_link_intercept {
            self.agent_link_intercept = v;
        }
        if let Some(v) = patch.agent_site_whitelist.as_ref() {
            self.agent_site_whitelist = v.clone();
        }
    }
}

// 需要同步到 `LogManager` 的日志字段变更集见 `adl_logging::LogSettingsChange`。

/// 落盘前剥离会话覆盖泄漏（Closing M1）：被 CLI/env 覆盖锁定**且本次补丁未提供**
/// 的日志字段，用磁盘现值覆盖内存值后再落盘。内存与运行期保持 CLI 值不变
/// （UI 显示与实际运行一致），仅磁盘恢复为用户上次持久化的选择，`session-only`
/// 承诺不被无关 UI 保存打破。被锁**且补丁内提供**的字段按用户选择落盘（下次生效）。
pub fn resolve_persisted_config(
    memory: &AppConfig,
    patch: &AppPreferencePatch,
    overrides: &adl_logging::LogOverrides,
    disk: &AppConfig,
) -> AppConfig {
    let mut out = memory.clone();
    // 补丁内提供的字段按用户选择落盘（锁定与否都落盘；锁定仅影响运行期），
    // 故只处理"补丁未提供且被锁定"的泄漏组合。
    if patch.log_level.is_none() && overrides.log_level.is_some() {
        out.log_level = disk.log_level;
    }
    if patch.terminal_log_mode.is_none() && overrides.terminal_log_mode.is_some() {
        out.terminal_log_mode = disk.terminal_log_mode;
    }
    if patch.debug_log_mode.is_none() && overrides.debug_log_mode.is_some() {
        out.debug_log_mode = disk.debug_log_mode;
    }
    out
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            language: DEFAULT_LANGUAGE.into(),
            theme_mode: ThemeMode::System,
            log_level: LogLevel::default(),
            terminal_log_mode: LogMode::default(),
            debug_log_mode: LogMode::default(),
            max_recent_workspaces: DEFAULT_MAX_RECENT_WORKSPACES,
            commands: Vec::new(),
            references: Vec::new(),
            keybinds: std::collections::BTreeMap::new(),
            fonts: adl_types::types::config::FontPreferences::default(),
            max_concurrent_workspaces: default_max_concurrent_workspaces(),
            workspace_priority_ids: Vec::new(),
            workspace_deferred_ids: Vec::new(),
            workspace_natural_order: Vec::new(),
            browser_inactive_tab_suspend_ms: default_browser_inactive_tab_suspend_ms(),
            link_open_method: LinkOpenMethod::default(),
            file_open_method: FileOpenMethod::default(),
            agent_link_intercept: false,
            agent_site_whitelist: Vec::new(),
        }
    }
}

pub fn config_path_for(config_dir: &Path) -> PathBuf {
    config_dir.join("config.json")
}

pub fn load_from(config_dir: &Path) -> Result<AppConfig, AppError> {
    let path = config_path_for(config_dir);
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Config(format!("Failed to read config: {e}")))?;
    serde_json::from_str(&content).map_err(|e| {
        AppError::Config(format!(
            "Failed to parse config; falling back requires a valid rewrite: {e}"
        ))
    })
}

pub fn save_to(config_dir: &Path, config: &AppConfig) -> Result<(), AppError> {
    std::fs::create_dir_all(config_dir)?;
    let path = config_path_for(config_dir);
    let content = serde_json::to_string_pretty(config)?;
    std::fs::write(&path, content)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    #[test]
    fn default_config_round_trips() {
        let dir = temp_dir().join("adl-config-test");
        let _ = std::fs::remove_dir_all(&dir);
        let cfg = AppConfig::default();
        save_to(&dir, &cfg).unwrap();
        let loaded = load_from(&dir).unwrap();
        assert_eq!(loaded.language, DEFAULT_LANGUAGE);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn to_log_config_derives_correct_modes() {
        let config = AppConfig {
            terminal_log_mode: LogMode::Overwrite,
            debug_log_mode: LogMode::Multi,
            ..Default::default()
        };
        let log_config = config.to_log_config();
        assert_eq!(log_config.terminal_log_mode, LogMode::Overwrite);
        assert_eq!(log_config.debug_log_mode, LogMode::Multi);
    }

    #[test]
    fn apply_log_overrides_only_overwrites_provided_fields() {
        // 原 `LogOverrides::apply` 的等价网（Phase 4 D5 去重后唯一实现即此）。
        let mut config = AppConfig::default();
        let overrides =
            adl_logging::LogOverrides { log_level: Some(LogLevel::Debug), ..Default::default() };
        config.apply_log_overrides(&overrides);
        assert_eq!(config.log_level, LogLevel::Debug);
        assert_eq!(config.terminal_log_mode, LogMode::default());
        assert_eq!(config.debug_log_mode, LogMode::default());
    }

    #[test]
    fn resolve_persisted_config_keeps_cli_values_out_of_disk() {
        // Closing M1：无关补丁保存时，被锁且补丁未提供的字段恢复磁盘值。
        let disk = AppConfig::default();
        let mut memory = AppConfig::default();
        let overrides =
            adl_logging::LogOverrides { log_level: Some(LogLevel::Trace), ..Default::default() };
        memory.apply_log_overrides(&overrides);
        assert_eq!(memory.log_level, LogLevel::Trace);

        // 生产流程：内存先打补丁，再算落盘值。
        let patch = AppPreferencePatch { language: Some("en-US".into()), ..Default::default() };
        memory.apply_patch(&patch);
        let to_save = resolve_persisted_config(&memory, &patch, &overrides, &disk);
        assert_eq!(to_save.log_level, LogLevel::Info, "CLI 值不得泄漏进 config.json");
        assert_eq!(to_save.language, "en-US", "用户选择正常落盘");
        // 内存不受影响（UI 显示与运行期一致）。
        assert_eq!(memory.log_level, LogLevel::Trace);
    }

    #[test]
    fn resolve_persisted_config_keeps_user_choice_for_patched_locked_fields() {
        // 被锁且补丁内提供的字段按用户选择落盘（下次启动生效）。
        let disk = AppConfig::default();
        let mut memory = AppConfig::default();
        let overrides =
            adl_logging::LogOverrides { log_level: Some(LogLevel::Trace), ..Default::default() };
        memory.apply_log_overrides(&overrides);
        let patch = AppPreferencePatch { log_level: Some(LogLevel::Warn), ..Default::default() };
        memory.apply_patch(&patch);
        let to_save = resolve_persisted_config(&memory, &patch, &overrides, &disk);
        assert_eq!(to_save.log_level, LogLevel::Warn);
    }

    #[test]
    fn load_save_accept_config_dir_directly() {
        let dir = temp_dir().join("adl-config-dir-direct-test");
        let cfg_dir = dir.join("custom-config");
        let _ = std::fs::remove_dir_all(&dir);
        let cfg = AppConfig::default();
        save_to(&cfg_dir, &cfg).unwrap();
        assert!(config_path_for(&cfg_dir).exists());
        let loaded = load_from(&cfg_dir).unwrap();
        assert_eq!(loaded.language, DEFAULT_LANGUAGE);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn open_method_and_agent_defaults() {
        let c = AppConfig::default();
        assert_eq!(c.link_open_method, adl_types::types::config::LinkOpenMethod::Panel);
        assert_eq!(c.file_open_method, adl_types::types::config::FileOpenMethod::Panel);
        assert!(!c.agent_link_intercept);
        assert!(c.agent_site_whitelist.is_empty());
    }

    #[test]
    fn apply_patch_sets_open_method_and_agent_fields() {
        use adl_types::types::config::{FileOpenMethod, LinkOpenMethod};
        let mut c = AppConfig::default();
        c.apply_patch(&AppPreferencePatch {
            link_open_method: Some(LinkOpenMethod::External),
            file_open_method: Some(FileOpenMethod::External),
            agent_link_intercept: Some(true),
            agent_site_whitelist: Some(vec!["http://127.0.0.1:3080".into()]),
            ..Default::default()
        });
        assert_eq!(c.link_open_method, LinkOpenMethod::External);
        assert_eq!(c.file_open_method, FileOpenMethod::External);
        assert!(c.agent_link_intercept);
        assert_eq!(c.agent_site_whitelist, vec!["http://127.0.0.1:3080".to_string()]);
    }

    #[test]
    fn old_config_without_open_method_fields_loads_with_defaults() {
        let dir = temp_dir().join("adl-config-open-method-old");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("config")).unwrap();
        let old_json = r#"{"language":"zh-CN","theme_mode":"system","log_level":"info","terminal_log_mode":"overwrite","debug_log_mode":"overwrite","max_recent_workspaces":10}"#;
        std::fs::write(config_path_for(&dir), old_json).unwrap();
        let loaded = load_from(&dir).unwrap();
        assert_eq!(loaded.link_open_method, adl_types::types::config::LinkOpenMethod::Panel);
        assert!(loaded.agent_site_whitelist.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[cfg(test)]
mod config_extension_tests {
    use super::*;
    use std::env::temp_dir;

    #[test]
    fn app_config_has_commands_field() {
        let config = AppConfig::default();
        assert!(config.commands.is_empty());
    }

    #[test]
    fn app_config_has_workspace_loading_fields_with_defaults() {
        let config = AppConfig::default();
        assert_eq!(config.max_concurrent_workspaces, 6);
        assert!(config.workspace_priority_ids.is_empty());
        assert!(config.workspace_deferred_ids.is_empty());
        assert!(config.workspace_natural_order.is_empty());
    }

    #[test]
    fn app_config_round_trips_workspace_loading_fields() {
        let dir = temp_dir().join("adl-config-workspace-loading-test");
        let _ = std::fs::remove_dir_all(&dir);
        let config = AppConfig {
            max_concurrent_workspaces: 4,
            workspace_priority_ids: vec!["ws-1".into(), "ws-2".into()],
            workspace_deferred_ids: vec!["ws-3".into()],
            workspace_natural_order: vec!["ws-4".into()],
            ..Default::default()
        };
        save_to(&dir, &config).unwrap();
        let loaded = load_from(&dir).unwrap();
        assert_eq!(loaded.max_concurrent_workspaces, 4);
        assert_eq!(loaded.workspace_priority_ids, vec!["ws-1".to_string(), "ws-2".to_string()]);
        assert_eq!(loaded.workspace_deferred_ids, vec!["ws-3".to_string()]);
        assert_eq!(loaded.workspace_natural_order, vec!["ws-4".to_string()]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn app_config_loads_old_config_without_workspace_fields() {
        // 模拟旧版本 config.json：不含 workspace loading 字段
        let dir = temp_dir().join("adl-config-old-format-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("config")).unwrap();
        let old_json = r#"{
            "language": "zh-CN",
            "theme_mode": "system",
            "log_level": "info",
            "terminal_log_mode": "overwrite",
            "debug_log_mode": "overwrite",
            "max_recent_workspaces": 10,
            "commands": [],
            "references": [],
            "keybinds": {},
            "fonts": {}
        }"#;
        std::fs::write(config_path_for(&dir), old_json).unwrap();
        let loaded = load_from(&dir).unwrap();
        assert_eq!(loaded.max_concurrent_workspaces, 6);
        assert!(loaded.workspace_priority_ids.is_empty());
        assert!(loaded.workspace_deferred_ids.is_empty());
        assert!(loaded.workspace_natural_order.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
