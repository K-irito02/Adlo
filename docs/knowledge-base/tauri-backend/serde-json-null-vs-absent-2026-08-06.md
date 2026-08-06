# serde 区分 JSON null 与字段缺省（Option<Option<T>> 陷阱）

日期：2026-08-06
来源：模型设置 per-model 三态启用（`enabledModels`）关闭流程代码审查

## 问题

前端发送 `{ enabledModels: null }`（语义：显式"全部启用"）希望覆盖已存在的白名单。
Rust 端 `ModelProviderPreferencePatch.enabled_models: Option<Option<Vec<String>>>` 直接
用 serde derive 反序列化时：

- JSON 字段**缺省** → 外层 `None`
- JSON **null** → 也是外层 `None`（`Option<T>` 对 null 与缺省不可区分）

因此"显式 null = 全部启用"与"未传 = 保留原值"在 Rust 端无法区分 → patch 被 `if let Some` 跳过，
**Tauri 桌面模式下"全部启用"静默失效**（前端预览模式用 JS merger 的 `'enabledModels' in patch`
正确区分，双端不一致且无报错）。

## 修复

字段加 `#[serde(default, deserialize_with = "deserialize_enabled_models")]`：

```rust
fn deserialize_enabled_models<'de, D>(d: D) -> Result<Option<Option<Vec<String>>>, D::Error>
where D: serde::Deserializer<'de> {
    let inner = Option::<Vec<String>>::deserialize(d)?; // null → None, 数组 → Some
    Ok(Some(inner))
}
```

- 缺省 → `#[serde(default)]` 提供外层 `None`（保留原值）
- null → `Some(None)`（显式全部启用）
- 数组 → `Some(Some(list))`（白名单）

配套 serde_json 往返测试覆盖三种输入。改用 untagged 枚举 `Option<EnabledModelsPatch>` 无效：
`Option<T>` 仍会在字段层把 null 吞成外层 `None`。

## 教训

1. **`Option<T>` 无法区分"JSON null"与"字段缺省"**；需要显式三态（缺省/null/值）时必须用
   `deserialize_with`（或手动 `Deserialize`）。
2. 单测不要只构造 Rust 结构直接测试合并逻辑——它会**绕过反序列化**给出假信心。必须加
   `serde_json::from_str` 往返测试覆盖真实 IPC 输入。
3. ts-rs 无法解析 `deserialize_with`（ts-rs-macros 字段级 serde 解析仅识别 rename/skip/flatten/
   default/with），会在构建时打印 "failed to parse serde attribute" 告警但忽略。全仓库仅此一处时，
   可在 ts-rs 依赖启用官方 `no-serde-warnings` feature 抑制该告警（源码级实证：该 feature 仅门控
   `parse_serde_attrs` 的告警打印段，`None` 回退与类型生成逻辑无条件执行，不改变任何 TS 输出；
   `#[ts(optional)]` 已显式声明可选性）。用 `#[ts(optional)]` + `#[serde(default, deserialize_with)]`
   组合即可，勿用 `#[ts(serde_attr)]`（当前 ts-rs 版本不支持）。
4. 双端一致规则要求：前端合并器（preferencesMerger）用 `'enabledModels' in patch` 区分显式 null，
   与 Rust `deserialize_with` 语义严格对齐。
