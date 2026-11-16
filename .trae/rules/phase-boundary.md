---
description: Project shape and scope boundaries
alwaysApply: true
---

# 项目形态与范围边界

## 已实现范围

- 架构底座：Rust + Tauri 2.x 桌面壳、SQLite 持久化、安全边界（capability 白名单）、双端一致（Tauri / 浏览器预览（http 优先）/ Mock 四端桥接）
- 工作区：多工作区管理、文件树、大纲解析、搜索、Git 可视化、补丁预览/应用/回滚、快照
- 终端：xterm.js 多会话 PTY + 一个终端标签内多终端窗格（各窗格独立 PTY、数量无上限；均分/自由布局、比例与自由像素拖拽、卷帘门裁剪 + 自定义滚动条、恢复自动布局、自定义布局卡片：拖拽排序/交换位置/双击标注）
- 编辑器：CodeMirror + 文件预览 + 差异查看器（inline/side-by-side）
- 内置浏览器：Tauri WebView / iframe 双模式、标签/书签/历史/下载、站点元数据缓存
- harness 宿主集成：进程托管、内嵌与系统版本管理、下载源/镜像配置、独立 WebView2 子窗口 / iframe 宿主渲染
- 存储治理：统一路径解析 + 启动期迁移 + 设置面板存储组
- 系统能力：剪贴板历史、系统监视器、CI 状态、GitHub 面板、凭据存储、i18n 国际化

功能清单真源见 [docs/architecture/core/system-overview.md](../../docs/architecture/core/system-overview.md)。

## 受控变更（须遵循对应规则）

| 变更类型 | 必须遵循 |
|----------|----------|
| Zustand 状态管理 | `zustand-patterns.md` |
| Rust 后端模式 | `rust-patterns.md` |

## 新功能评估

引入新功能前必须确认：

- [ ] 是否在已实现范围内（见上文）？
- [ ] 是否需要新增 Tauri Command / capability / 事件通道？
- [ ] 是否涉及 WebView 直接访问系统资源？
- [ ] 是否需要新增持久化存储？
- [ ] 是否需要同步文档更新？

## 相关文件

- [AGENTS.md](../../AGENTS.md)
