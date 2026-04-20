---
description: Desktop UI verification workflow - must restart app after UI changes
alwaysApply: false
globs: ai-digital-life/apps/desktop/renderer/**
---

# 桌面端 UI 验证流程

## 核心规则

**每次修改桌面端 UI 后，必须重新运行应用以验证效果。**

### 适用范围

| 路径 | 说明 |
|------|------|
| `ai-digital-life/apps/desktop/renderer/src/**/*.tsx` | React 组件 |
| `ai-digital-life/apps/desktop/renderer/src/**/*.css` | 样式文件 |
| `ai-digital-life/apps/desktop/renderer/src/**/*.ts` | 渲染进程逻辑 |

### 验证流程

1. **修改 UI 代码后** → 执行构建或启动开发服务器
2. **验证视觉效果** → 确认标题栏、工作区、按钮等 UI 元素正确渲染
3. **验证交互功能** → 确认窗口控制按钮、主题切换、配色方案等功能正常

### 常用命令

```bash
# 开发模式（热重载）
cd ai-digital-life
npm run dev

# 构建后运行
cd ai-digital-life
npm run build
npm run start
```

### 验证清单

修改以下内容后必须重新运行：

- [ ] 标题栏（`.adl-ide-titlebar`）
- [ ] 窗口控制按钮（最小化/最大化/关闭）
- [ ] 工作区域栏（`.adl-ide-editor-header`）
- [ ] 侧边栏（`.adl-ide-sidebar`）
- [ ] 状态栏（`.adl-ide-statusbar`）
- [ ] 主题变量（`themes.css`、`tokens.css`）
- [ ] 组件样式（`components.css`、`workspace.css`）
- [ ] Tooltip 组件（悬停交互、主题适配、定位正确性）
- [ ] 原生 `title` 属性残留检查（应全部迁移为 `TooltipSimple`）

## 随项目演进

- 新增 UI 组件：更新验证清单
- 新增样式文件：更新适用范围表格
- 开发命令变更：更新常用命令

## 相关文件

- [apps/desktop/renderer/src/app/App.tsx](/E:/Programs/Obsidian/notes/ai-digital-life/apps/desktop/renderer/src/app/App.tsx)
- [apps/desktop/renderer/src/styles/workspace.css](/E:/Programs/Obsidian/notes/ai-digital-life/apps/desktop/renderer/src/styles/workspace.css)
- [apps/desktop/renderer/src/styles/themes.css](/E:/Programs/Obsidian/notes/ai-digital-life/apps/desktop/renderer/src/styles/themes.css)
