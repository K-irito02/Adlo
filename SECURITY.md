# 安全策略

## 支持范围

Adlo 目前处于 0.x 早期阶段。以下安全边界按「防御深度」思路实现，但不构成完整的安全保证；发现缺口请按下文私下报告。

| 安全层        | 已实现的边界                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------- |
| IPC 安全      | 桌面模式下系统能力均经 Tauri Command 暴露，WebView 不直接访问文件系统、进程、SQLite 或密钥     |
| Capability    | `capabilities/*.json` 精确登记允许的命令与 API，禁止 `all` / `**` 通配权限                      |
| 凭据隔离      | API Key / Token 存于 `crates/credential/`（keyring 优先、加密文件降级），不落入普通配置或日志   |
| CSP 策略      | `tauri.conf.json` 显式声明 `app.security.csp`，`withGlobalTauri` 默认关闭                        |
| 更新校验      | 更新清单与安装包经 minisign 签名校验，公钥内置在 `tauri.conf.json` 的 updater 配置中            |
| SQL 注入防护  | 所有查询使用 `rusqlite` 参数绑定，禁止字符串拼接 SQL                                           |

CSP 的两处关键配置：

- `dangerousDisableAssetCspModification: ["style-src"]`：允许运行时注入 `<style>`，避免 nonce / hash 失效
- `img-src` / `media-src` 包含 `blob:`：Office 内嵌媒体与 object URL 依赖它

## 报告漏洞

请**不要**公开提交 Issue。优先使用以下私下渠道：

- GitHub 私密漏洞报告（仓库 Security → Report a vulnerability）
- 内部渠道（如果你是团队成员）

### 报告内容

- 漏洞类型与影响范围
- 复现步骤（含环境与版本）
- 受影响的组件
- 可能的缓解方案

### 响应时间

确认后会尽快修复，并在修复版本发布后通知报告者。修复完成前请勿公开漏洞细节。

## 已知限制

以下内容不在当前安全边界内：

| 限制        | 说明                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| 沙箱隔离    | 命令执行不提供沙箱；权限与审批属于体验层约束，不是安全隔离                                             |
| 本地数据    | SQLite 数据库与工作区文件不加密，依赖操作系统账户隔离                                                  |
| adl-server  | 本机 sidecar HTTP 服务（桌面壳与浏览器预览共用），绑定 `127.0.0.1`，无鉴权且 CORS 允许任意来源；请勿暴露到网络 |
| 网络        | 无内置防火墙或出站限制规则                                                                             |

## 依赖安全

- 前端依赖由 `pnpm-lock.yaml` 锁定，Rust 依赖由 `Cargo.lock` 锁定
- 开发阶段无自动化漏洞扫描，合入前人工审查
- 禁止引入已知存在漏洞的版本

## 凭据管理

- API Key 不得硬编码在源码中
- Token 统一存于 `crates/credential/`（keyring 优先，加密文件降级）
- 凭据不得写入日志、配置、快照或错误消息
- 环境变量中的凭据按需读取，用完即弃

## 安全审计

以下操作必须留下审计记录：

- 关键配置变更
- 数据迁移与恢复
- 权限规则修改

审计记录与普通运行日志分层存放，避免混杂与误删。

## 禁止项

- 在 capability 文件中使用 `all` / `**` 通配权限
- WebView 直接调用文件系统、进程、网络特权、数据库原语或任意命令执行
- 设计接受任意 SQL 或任意路径写入的「万能命令」
- 密钥、令牌、凭据进入普通配置、快照或日志
- SQLite 查询使用字符串拼接（必须参数绑定）
- Rust `unsafe` 代码块无注释说明不变量

---

## 相关文档

- [AGENTS.md](./AGENTS.md) — 治理规则与禁止项
- [CONTRIBUTING.md](./CONTRIBUTING.md) — 贡献与验收流程
- [.agents/rules/tauri-shell.md](.agents/rules/tauri-shell.md) — Tauri 壳与命令边界
