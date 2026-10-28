---
description: Desktop UI verification workflow - must restart app after UI changes
globs: ai-digital-life/frontend/**
alwaysApply: false
---

# 桌面端 UI 验证

## 核心规则

修改桌面端 UI 后，必须重新运行应用以验证效果。

## 适用范围

| 路径 | 说明 |
|------|------|
| `frontend/src/**/*.tsx` | React 组件 |
| `frontend/src/**/*.css` | 样式文件 |

## 验证流程

1. 修改 UI 代码
2. 运行 `pnpm --dir frontend run dev` 或 `cargo tauri dev`
3. 验证视觉效果与交互功能
4. **双端验证**：在 Tauri 桌面和浏览器模式下分别确认功能一致

### 可选自动化冒烟

桌面-only 交互（标题栏/面板开合、窗口几何、真实 IPC）可先跑 `pnpm run e2e`（命令与前置见 [commands.md](commands.md#测试命令)，流程见技能 `desktop-e2e-wdio`）。**自动化通过 ≠ 视觉验收通过**：仍须按上方清单在真实窗口内人工确认。

## 验证清单

修改 UI 后必须在 Tauri 桌面和浏览器模式下分别验证：

| 验证项 | 差异说明 |
|--------|----------|
| 窗口控制按钮 | Tauri: 可实际操作; 浏览器: 仅显示 |
| 标题栏拖拽 | Tauri: 可拖拽; 浏览器: 不可拖拽 |
| 拖拽打开工作区 | Tauri: `onDragDropEvent`; 浏览器: HTML5 `dragover`/`drop` |
| 主题/语言切换 | 两模式一致 |
| 文件树/变更面板 | Tauri: Rust 后端; 浏览器: Preview API |
| 终端面板（多会话/Shell 切换/命令执行） | Tauri: Rust PTY; 浏览器: Node.js `child_process.spawn` |
| Tooltip 方案（自定义组件/原生 `title`）双端一致检查 | 两模式一致 |
| 终端主题同步 / 空状态按钮组 | 两模式一致 |

## 相关文件

- [mandatory-testing.md](./mandatory-testing.md)
- [design-system.md](./design-system.md)
- 技能 `desktop-e2e-wdio`（`ai-digital-life/e2e/` 的自动化冒烟）
