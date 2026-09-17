---
description: Project shape, scope boundaries, and exclusion items
alwaysApply: true
---

# 项目形态与范围边界

> 本项目不分阶段规划。当前实现即所规划的完整形态：**桌面应用宿主 + 第三方 Agent harness 集成**。Agent 对话、模型接入、多 Agent 编排及其配套能力不由本仓库实现，交由接入的第三方 harness（当前为 deepseek dsh）提供，本仓库仅负责宿主集成（进程托管、版本管理、下载源/镜像、宿主渲染）。

## 已实现范围（完整形态）

- 架构底座：Rust + Tauri 2.x 桌面壳、SQLite 持久化、安全边界（capability 白名单）、双端一致（Tauri / 浏览器预览 / mock 三桥接）
- 工作区：多工作区管理、文件树、大纲解析、搜索、Git 可视化、补丁预览/应用/回滚、快照
- 终端：xterm.js 多会话 PTY + 只读历史归档
- 编辑器：CodeMirror + 文件预览 + 差异查看器（inline/side-by-side）
- 内置浏览器：Tauri WebView / iframe 双模式、标签/书签/历史/下载、站点元数据缓存
- 第三方 harness 宿主集成：进程托管、内嵌与系统版本管理、下载源/镜像配置、独立 WebView2 子窗口 / iframe 宿主渲染
- 存储治理：统一路径解析 + 启动期迁移 + 设置面板存储组
- 系统能力：剪贴板历史、系统监视器、CI 状态、GitHub 面板、凭据存储、i18n 国际化

功能清单真源见 [ai-digital-life/AGENTS.md](../../ai-digital-life/AGENTS.md)。

## 排除项（本仓库不实现）

| 排除项 | 说明 |
|--------|------|
| 内置 Agent / 多 Agent 编排 | 由第三方 harness 提供，本仓库仅做宿主集成 |
| 内置模型接入 / Provider 管理 / 动态模型获取 | 同上，不由本仓库实现 |
| Compaction / Session Fork / 自定义命令 / 权限 Ruleset / Custom Agent 等 Agent 配套能力 | 同上，随 harness 能力走 |
| 插件市场（第三方插件加载） | 未来想法，未立项（见 FUTURE-ROADMAP） |
| 浏览器自动化运行时 | 未来想法，未立项 |
| 复杂云协作 / ACP / HTTP API / CodeMode | 未来想法，未立项 |

## 受控变更（须遵循对应规则）

| 变更类型 | 必须遵循 |
|----------|----------|
| Zustand 状态管理 | `zustand-patterns.md` |
| Rust 后端模式 | `rust-patterns.md` |

## 新功能评估

引入新功能前必须确认：

- [ ] 是否在当前项目形态范围内（见上文"已实现范围"；超出范围即未来想法，不立项）？
- [ ] 是否需要新增 Tauri Command / capability / 事件通道？
- [ ] 是否涉及 WebView 直接访问系统资源？
- [ ] 是否需要新增持久化存储？
- [ ] 是否需要同步文档更新？

详见 [FUTURE-ROADMAP.md](../../FUTURE-ROADMAP.md)（未来想法清单，不分阶段、不承诺）

## 相关文件

- [AGENTS.md](../../AGENTS.md)
- [FUTURE-ROADMAP.md](../../FUTURE-ROADMAP.md) — 未来想法（非分阶段规划）
