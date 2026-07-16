# Navigator 方法移动到 uiSlice 重构经验

> 日期: 2026-06-08 | 来源: uiSlice 与 browserSlice 重构

## 问题背景

在之前的重构中，我们发现 `toggleNavigator` 和 `setNavigatorCollapsed` 方法被错误地定义在 `browserSlice` 中，但实际上这是通用的 UI 功能，应该属于 `uiSlice`，违反了 Zustand 切片的单一职责原则。

## 问题描述

### 问题点
- `toggleNavigator` 和 `setNavigatorCollapsed` 方法用于控制导航栏展开/收起状态
- 这些是通用的 UI 功能，服务于 files、changes、browser、terminal、audit、settings、models 等多个工具
- 但之前定义在浏览器专用的 `browserSlice` 中，导致职责不清

## 解决方案

### 1. 重构到 uiSlice

将以下内容从 browserSlice 移动到 uiSlice：

```typescript
// 新增内容
- 状态: navigatorCollapsedByTool
- 方法: setNavigatorCollapsed
- 方法: toggleNavigator
- 常量: BROWSER_NAVIGATOR_COLLAPSED_KEY
- 辅助函数: defaultNavigatorCollapsed
```

### 2. 保持向后兼容

保留了 browserSlice 中的：
- `toggleBrowserNavigator` (包装器
- `setBrowserNavigatorCollapsed` (包装器
- 这些现在内部调用 uiSlice 中的实现

### 3. 类型安全更新

- 正确管理了类型：
- 更新了导入路径
- 更新了接口
- 保持了 TypeScript 类型
- 更新了 StoreState 的定义

### 4. 警告清理

在重构后发现并修复了 ESLint 警告：

- 移除未使用的 ToolId 导入
- 移除未使用的 createUiId 导入
- 移除未使用的 scheduleNumberWrite 变量
- 将未使用的 state 变量重命名为 _state
- 使用 eslint --fix 自动修复格式问题

## 技术要点

### Zustand 切片职责划分

| 切片 | 职责 |
|------|------|
| uiSlice | 通用 UI 状态（导航栏、面板尺寸、主题等 |
| browserSlice | 浏览器专用状态（标签、可见性等） |

### 渐进式重构要点

1. **逐步扩展目标位置
- ✅ 扩展目标切片先
- ✅ 更新组件导入
- ✅ 保持兼容包装器
- ✅ 从源切片清理

2. **安全优先
- ✅ 保持现有功能 100% 正常
- ✅ 保持完整测试通过
- ✅ 无回归测试（212 tests）

3. **类型安全
- ✅ TypeScript 无错误
- ✅ ESLint 无警告

## 相关文件

### 修改的文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| uiSlice.ts | 扩展 | 新增通用 Navigator 功能 |
| browserSlice.ts | 重构 | 保持兼容包装器 |

### 参考文件
- uiStore 迁移到 uiSlice (2026-06-07)
- Navigator 职责划分 (2026-06-08)
