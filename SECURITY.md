# 安全策略

## 支持范围

Adlo项目目前处于**开发阶段**，安全措施以防御深度为目标。以下安全边界已实现：

| 安全层 | 说明 |
|--------|------|
| IPC 安全 | 所有系统能力通过 Tauri Command 暴露，WebView 不能直接触达系统资源 |
| Capability 权限 | Tauri capability 文件精确控制允许的命令和 API，禁止 `"all"` / `"**"` 通配 |
| 凭据隔离 | API Key / Token 通过 `crates/credential/` 加密存储，不落普通配置或日志（详见[凭据管理](#凭据管理)） |
| CSP 策略 | `tauri.conf.json` 显式声明 `app.security.csp`，`withGlobalTauri` 默认关闭；`dangerousDisableAssetCspModification: ["style-src"]` 保证运行时注入的 `<style>` 不被 nonce/hash 失效；`img-src` / `media-src` 必须包含 `blob:`（Office 内嵌媒体与 object URL 依赖它） |
| SQL 注入防护 | 所有查询参数使用 `rusqlite` 命名/位置参数绑定，禁止字符串拼接 SQL |

## 报告漏洞

如果您发现安全漏洞，请**不要**公开提交 Issue。请通过以下方式私下报告：

- 内部渠道（如果您是团队成员）
- 创建包含 `[SECURITY]` 前缀的 Issue（设置为私密）

### 报告内容

提供以下信息：
- 漏洞类型与严重程度
- 复现步骤
- 受影响版本/组件
- 可能的缓解方案

### 响应时间

我们会尽快确认并修复安全漏洞。修复后会通知报告者并发布更新。

## 已知限制

以下内容不在当前安全边界内：

| 限制 | 说明 |
|------|------|
| 沙箱隔离 | 当前命令执行不提供沙箱，权限系统是 UX 功能而非安全隔离 |
| 网络级安全 | 无内置防火墙规则（Tauri 桌面模式仅限于本地） |
| Server 模式认证 | `adl-server`（`crates/server`）为本地 sidecar HTTP 服务，仅服务本机浏览器预览，不对外暴露网络 |

## 依赖安全

- 前端依赖通过 pnpm lockfile 锁定版本
- Rust 依赖通过 Cargo.lock 锁定版本
- 开发阶段无自动化扫描，合入前通过人工审查
- 禁止在依赖中引入已知漏洞版本

## 凭据管理

- API Key 不得硬编码在源码中
- Token 通过 `crates/credential/` 存储（keyring 优先，加密文件降级）
- 凭据不得写入日志、配置或错误消息
- 环境变量中的凭据仅在需要时读取，用完即弃

## 安全审计

以下操作必须进入审计轨迹：
- 关键配置变更
- 数据迁移与恢复动作
- 权限规则修改

审计记录与普通运行日志分层管理，避免混杂和误删。

## 禁止项

- 在 capability 文件中使用 `"all"` 或 `"**"` 通配权限
- WebView 直接调用文件系统、进程、网络特权、数据库原语或任意命令执行
- Tauri Command 设计成宽泛的「万能命令」（如接受任意 SQL 或任意路径写入）
- 密钥、令牌、凭据进入普通配置、快照或日志
- SQLite 查询使用字符串拼接（必须使用参数绑定）
- Rust `unsafe` 代码块无注释说明不变量
