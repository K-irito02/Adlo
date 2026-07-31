# maoxiong-vpn 订阅规则源

本目录存放 **maoxiong-vpn（本地代理客户端 Dapan，基于 mihomo 核心）** 的订阅规则源配置。

## 文件

| 文件 | 说明 |
|------|------|
| [sub_rules.toml](./sub_rules.toml) | 规则集（rule_sets）与代理组（proxy_groups）生成逻辑源配置 |

## sub_rules.toml 说明

### 与普通 Clash 配置的区别

- **格式**：TOML，不是 YAML
- **内容**：只描述「规则集」和「代理组生成逻辑」，不直接包含 `proxies`、`proxy-providers`、完整 `rules` 或完整 `proxy-groups`
- **消费方式**：系统根据此 TOML 自动生成 Clash / mihomo / Surge 等客户端的最终配置
- 不要在此文件输出 Clash 顶层字段（`mixed-port`、`proxies`、`proxy-groups`、`rules` 等）

### 结构

```
[[rule_sets]]       # 规则集：group 路由目标组；url 远程规则集 / type+value 内联规则
[[proxy_groups]]    # 代理组：name 组名；type select/url-test；regex 节点筛选；proxies 候选
```

### 分组一览

| 组 | 用途 |
|----|------|
| 🛡️ 局域网直连 | 私网 IP 强制直连 |
| 🤖 ChatGPT、Claude、Gemini、微软AI | AI / 风控敏感服务 |
| 🛠️ 开发工具 | **Git 远程、OpenCode 内置网络搜索等国外网络场景** |
| ⬇️ Steam下载(测试) | Steam 下载，默认直连 |
| 🍎 苹果服务 / 📢 谷歌FCM / Ⓜ️ 微软服务 / 📲 电报信息 | 厂商服务 |
| 📹 YouTube / 🎥 NETFLIX / 🦄 DisneyPlus 等 | 流媒体 |
| 🎮️ 游戏平台 | 游戏 |
| 🚀 手动切换 | 全局手动切换 + 杂项（LinkedIn 等） |
| 🎯 全球直连 | 国内直连 + GeoIP-CN 兜底 |
| 🐟 漏网之鱼 | final 兜底 |

### 🛠️ 开发工具组（2026-07-31 新增）

针对 **Git 远程提交** 与 **OpenCode 内置网络搜索工具**（`websearch`）等需国外网络的场景，规则前置到「国内直连 / GeoIP-CN」之前避免被误判直连：

- **GitHub / GitLab** 完整规则集（`blackmatrix7/ios_rule_script`）
- **GitHub CDN 域补全**：`githubusercontent.com`、`githubassets.com`、`github.io`、`githubapp.com`、`objects.githubusercontent.com`、`codeload.github.com`
- **OpenCode websearch 后端**（源码见 `references/opencode/packages/core/src/tool/websearch.ts`）：
  - `exa.ai` → `https://mcp.exa.ai/mcp`（Exa MCP 端点）
  - `parallel.ai` → `https://search.parallel.ai/mcp`（Parallel MCP 端点）

## 相关环境

- 本地代理：**Dapan.exe**（`C:\Users\31432\AppData\Roaming\maoxiong-vpn\core\Dapan.exe`，mihomo 核心）
- HTTP 代理端口：`127.0.0.1:17890`（不是 Clash 默认 7890）
- git 代理配置与排查记录 → [knowledge-base/toolchain/git-proxy-port-mismatch-fix-2026-07-30.md](../knowledge-base/toolchain/git-proxy-port-mismatch-fix-2026-07-30.md)
