---
description: 跨 IPC 边界 Rust 类型的 serde 双注解约定
globs: ai-digital-life/crates/**/types/**/*.rs
alwaysApply: false
---

# `#[serde(default)]` + `#[serde(rename_all)]` 双注解类型定义

## 规则描述

所有跨 IPC 边界的 Rust 数据类型（即所有添加 `#[derive(TS)]` 的 struct/enum）**必须同时**添加 `#[serde(rename_all)]` 和适当的 `#[serde(default)]` 注解。这确保 JSON 序列化命名风格统一、字段缺失时能优雅降级。

## 强制注解组合

| 注解 | 位置 | 用途 | 必须性 |
|------|------|------|--------|
| `#[serde(rename_all = "camelCase")]` | struct/enum 级别 | Rust 蛇形命名→JSON camelCase | 所有导出 struct（明确场景可例外使用 `lowercase`/`kebab-case`） |
| `#[serde(default)]` | field 级别 | 缺失字段使用类型的 Default 值 | 所有非必填/可选字段 |
| `#[serde(default = "fn_name")]` | field 级别 | 自定义默认值函数 | 当类型 Default 不满足业务语义时 |

## 命名规范

| rename_all 值 | 适用场景 | Rust → JSON 示例 |
|--------------|----------|-----------------|
| `camelCase` | 大多数 struct 字段 | `workspace_id` → `workspaceId` |
| `lowercase` | 简单枚举变体 | `Ready` → `"ready"` |
| `kebab-case` | 状态类枚举 | `Completed` → `"completed"` |
| `snake_case` | 特殊配置枚举 | `Overwrite` → `"overwrite"` |

## 正确示例

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences {
    pub display_name: String,           // required, no default
    #[serde(default)]
    pub bio: String,                     // optional string, defaults to ""
    #[serde(default)]
    pub avatar_url: Option<String>,      // optional, defaults to None
    #[serde(default = "default_max_items")]
    pub max_items: u32,                  // custom default
}
```

## 错误示例

```rust
// BAD: missing serde annotations
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct UserPreferences {
    pub display_name: String,
    pub bio: String,
    pub avatar_url: Option<String>,
}

// BAD: serde rename_all without default for optional fields
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub host: String,
    pub port: u16,                // will fail deser if missing from JSON
}
```

## 适用场景

- 所有 `#[derive(TS)]` 的数据类型（struct 和 enum）
- 所有通过 Tauri IPC 传输的参数和返回值
- 所有持久化到 SQLite JSON 列的数据结构
- 配置、偏好、权限规则等需要向前兼容的领域模型
