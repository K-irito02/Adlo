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

## 验证清单

修改以下内容后必须重新运行：

- [ ] 标题栏（`.adl-ide-titlebar`）
- [ ] 窗口控制按钮
- [ ] 主题变量
- [ ] Tooltip 组件
- [ ] 原生 `title` 属性残留检查

## 相关文件

- [mandatory-testing.md](./mandatory-testing.md)
- [design-system.md](./design-system.md)
