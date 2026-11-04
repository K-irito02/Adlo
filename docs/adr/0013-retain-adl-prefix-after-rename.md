# 品牌改名后保留 `adl` 工程前缀，不与品牌拼写对齐

项目由 `AI 数字生命 / AI Digital Life` 更名为 `Adlo`（中文名「安洛」）后，`adl` 这个前缀在代码里已积累约 1.76 万处：Rust crate 前缀（`adl-env`、`adl-server`）、环境变量（`ADL_LOG_LEVEL`）、二进制与 CLI（`adl-server`）、日志前缀（`[ADL-…]`）、实例目录（`adl-instance`）。它原本是旧全称的缩写，改名后不再能由 `Adlo` 推出。

决定：**保留 `adl` 作为工程前缀，不随品牌拼写改成 `adlo` 或 `adio`。** 品牌与工程标识分层：

| 层 | 取值 | 用在哪 |
|---|---|---|
| 品牌 | `Adlo`（中文「安洛」） | 安装包、窗口标题、文档 |
| 包/路径 slug | `adlo` | 目录名、包名、`identifier`、TS 路径别名 `@adlo/*` |
| 工程前缀 | `adl` | crate 前缀、环境变量、CLI/二进制、日志前缀 |

即 `adl` 是「历史形成、不再表意」的稳定前缀，而不是 `Adlo` 的缩写。

**Considered Options**: 全量改成 `adlo`（约 1.76 万处，含外部脚本依赖的环境变量与二进制名，破坏面大且无功能收益）；改成 `adio`（与拼写一致但与既有 `adl` 无继承关系，等于双重改名）；把 TS 别名也改成 `adl/*`（与包名 `adlo` 不一致，反而更乱）。

**Consequences**: 新人会疑惑 `Adlo` 与 `adl` 的关系——`.agents/rules/rust-crate-adl-prefix-convention.md` 与 `GLOSSARY.md` 必须写明「工程前缀、非品牌缩写」；新增 crate / 环境变量 / 二进制继续用 `adl`，新增包名与路径用 `adlo`；用户可见文案一律不出现 `adl`。
