---
description: Rust↔TS 共享类型使用 serde(rename_all = "camelCase") + serde(tag = "type") 的 JSON 序列化规范
globs: adlo/crates/types/**/*.rs
alwaysApply: false
---

# Tagged Enum + camelCase Serde 序列化规范

所有 Rust 与 TypeScript 共享的 IPC 类型必须使用统一 serde 注解。

## rename_all 策略

| 语义 | rename_all | 用途 |
|------|-----------|------|
| 结构体字段 | `camelCase` | 所有共享 struct（如 `ModelChatMessage`） |
| 事件枚举变体 | `kebab-case` | 事件鉴别（如 `DigitalLifeRunActivityEventV1`） |
| 简单枚举变体 | `lowercase` | 简单值枚举（如 `ThemeMode`、`ModelCapability`） |
| 配置命令变体 | `SCREAMING_SNAKE_CASE` | 配置转换命令（如 `ConfigTransform`） |

## 规范

- 所有共享类型必须 derive `TS`（`ts_rs` crate）以生成 TypeScript 类型定义
- 结构体：`#[serde(rename_all = "camelCase")]`
- 标签枚举：`#[serde(tag = "type", rename_all = "...")]`
- 枚举变体内部字段：`#[serde(rename_all = "camelCase")]`

```rust
#[derive(Debug, serde::Serialize, serde::Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ModelChatMessage {
    pub role: String,
    pub content: String,
    pub tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, TS)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum ActivityEvent {
    RunStarted { run_id: String },
    RunCompleted { run_id: String, duration_ms: i64 },
}
```
