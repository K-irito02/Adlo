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
2. 运行 `npm --prefix frontend run dev` 或 `cargo tauri dev`
3. 验证视觉效果与交互功能
4. **双端验证**：在 Tauri 桌面和浏览器模式下分别确认功能一致

### 使用浏览器自动化工具验证

> 工具选择和详细用法参见 [browser-automation.md](./browser-automation.md) 和 [browser-automation 技能](../skills/browser-automation/SKILL.md)

## 双端验证清单

修改以下内容后必须在两种模式下分别验证：

| 验证项 | Tauri 模式 | 浏览器模式 |
|--------|-----------|-----------|
| 窗口控制按钮 | 显示且可用 | 显示但无实际操作效果（浏览器不支持窗口操作） |
| 标题栏拖拽 | 可拖拽移动窗口 | 不可拖拽（浏览器无此能力） |
| 拖拽打开工作区 | Tauri `onDragDropEvent` | HTML5 `dragover`/`drop` |
| 主题切换 | 正常 | 正常 |
| 语言切换 | 正常 | 正常 |
| 文件树/变更面板 | 正常 | 正常（通过 Preview API） |
| 终端面板 | 正常（Rust PTY） | 正常（通过 `previewTerminalService.ts` + `child_process.spawn`） |
| 终端多会话 | 正常（多 PTY 进程） | 正常（多 `child_process.spawn` 进程） |
| 终端 Shell 切换 | PowerShell / CMD / Bash | PowerShell / CMD / Bash |
| 终端命令执行 | 真实 Shell 进程 | 真实 Shell 进程 |

## 验证清单

修改以下内容后必须重新运行：

- [ ] 标题栏（`.adl-ide-titlebar`）
- [ ] 窗口控制按钮
- [ ] 主题变量
- [ ] Tooltip 组件
- [ ] 原生 `title` 属性残留检查
- [ ] 终端面板（`.adl-tool-panel--terminal`）
- [ ] 终端多会话切换与关闭
- [ ] 终端 Shell 类型选择（PowerShell / CMD / Bash）
- [ ] 终端命令输入与执行
- [ ] 终端主题同步（亮色/暗色）
- [ ] 终端空状态居中按钮组

## 相关文件

- [mandatory-testing.md](./mandatory-testing.md)
- [design-system.md](./design-system.md)
- [browser-automation.md](./browser-automation.md)
