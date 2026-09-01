# AI Digital Life (Rust + Tauri)

该工作区托管 `AI Digital Life` 桌面应用的 **Rust + Tauri 2.x** 实现。

> 旧版 Electron / TypeScript 实现已废弃。

## 快速开始

```bash
# 前端
pnpm --dir frontend install
pnpm run dev:browser    # 浏览器预览模式（快速开发/测试）

# 桌面应用
pnpm run dev:tauri      # Tauri 桌面应用
pnpm run dev:both       # 同时启动浏览器 + Tauri
```

## 目录结构

```
ai-digital-life/
├── Cargo.toml          # Rust workspace 根
├── src-tauri/          # Tauri 入口（commands、capabilities）
├── crates/             # Rust 业务 crate
├── frontend/           # WebView 前端（React + Vite）
└── docs/               # architecture / design-system
```

## 关键文档

| 文档 | 内容 |
|------|------|
| [AGENTS.md](./AGENTS.md) | 实现工作区治理：技术栈、功能清单、Store 架构、安全边界 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 提交规范、双端一致性要求、Tauri Command 新增清单 |
| [仓库根 AGENTS.md](../AGENTS.md) | 项目治理规则、双根结构、禁止项、真源定位 |
| [references/opencode/](../references/opencode/) | 参考项目 OpenCode 本地源码（MIT 许可，供开发参考复用） |
| [docs/analysis/opencode/](../docs/analysis/opencode/) | OpenCode 源码地图（渐进式索引 — 快查/总览/架构/包索引/功能深度/编码模式/差距分析） |
| [docs/analysis/ai-digital-life/](../docs/analysis/ai-digital-life/) | ADL 源码地图 — 本项目的渐进式索引 |
| [docs/architecture/](../docs/architecture/) | 系统架构、技术栈对齐、国际化、主题 |
| [docs/design-system/](../docs/design-system/) | 设计 Token、主题、组件、可访问性 |

## 浏览器测试

```bash
pnpm run dev:browser                        # 启动浏览器预览
pnpm --dir frontend run test:e2e            # Playwright 全量测试
pnpm --dir frontend run test:e2e:workspace  # 验证工作区恢复
```

详细说明见 [AGENTS.md](./AGENTS.md#双端一致性) 和前端 `frontend/e2e/` 目录。

## 端口扫描功能

本项目实现了本地端口扫描功能，用于检测和分析本地服务的端口状态。

### 功能说明

- **端口扫描** (`browser_scan_ports`): 批量扫描指定端口列表，返回每个端口的开放状态和响应时间
- **端口详情** (`browser_get_port_details`): 获取单个端口的详细信息，包括进程信息

### 使用示例

```typescript
// 扫描多个端口
const ports = [80, 443, 3000, 8080];
const results = await invoke('browser_scan_ports', { ports });
// results: [{ port: 80, isOpen: true, responseTimeMs: 12 }, ...]

// 获取端口详情
const details = await invoke('browser_get_port_details', { port: 3000 });
// details: { port: 3000, isOpen: true, protocol: 'TCP', localAddress: '127.0.0.1:3000', processes: [...] }
```

### 安全限制

- 单次扫描最多 100 个端口
- 端口号不能为 0
- 端口列表不能为空
- 扫描仅限于本地主机 (127.0.0.1)

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面框架 | Tauri 2.x |
| 后端 | Rust + tokio + rusqlite |
| 前端 | React 19 + Vite + Zustand + TypeScript |
| 桥接 | `#[tauri::command]` + `@tauri-apps/api` |

完整技术栈与已实现功能清单见 [AGENTS.md](./AGENTS.md)。