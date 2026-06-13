# CI 面板帮助系统增强经验

> 来源：2026-06-13 操作手册补充完善（帮助按钮交互修复 + 手册内容扩展）

## 1. 帮助按钮全局点击冲突

### 问题

点击帮助按钮后，`showHelp` 状态被立即覆盖为 `false`，导致帮助模式无法生效。

### 根因

`GitHubPanel.tsx` 中有一个全局 `document.addEventListener('click', ...)` 监听器（约第 206 行），每次点击任何元素都会调用 `handleSelectTreePath(null)`，而该函数内部无条件执行 `setShowHelp(false)`。由于 React 18+ 自动批处理，帮助按钮的 `setShowHelp(true)` 和全局监听的 `setShowHelp(false)` 在同一事件循环中被合并，后者覆盖前者。

### 修复

```typescript
// 之前：每次调用都清除帮助状态
const handleSelectTreePath = useCallback((path: string | null) => {
    setShowHelp(false);
    // ...
}, []);

// 之后：仅在选中有效路径时清除帮助状态
const handleSelectTreePath = useCallback((path: string | null) => {
    if (path) {
        setShowHelp(false);
    }
    // ...
}, []);
```

### 教训

- 全局 DOM 事件监听器（`document.addEventListener`）与 React 状态更新共存时，必须留意执行顺序和 React 批处理机制
- 在含有全局点击监听的组件中新增 toggle 行为时，必须验证全局监听不会覆盖新行为
- 对于"点击空白取消选中"和"点击按钮进入帮助模式"这类冲突需求，需要在 `handleSelectTreePath` 中区分 `null`（空白点击）和有效路径

## 2. 帮助按钮交互改进

### 变更

| 项目 | 之前 | 之后 |
|------|------|------|
| 点击行为 | `setShowHelp(true)`（单向） | `setShowHelp((prev) => !prev)`（toggle） |
| 状态反馈 | 无 | 添加 `is-active` CSS 类 + `aria-pressed` |
| 退出方式 | 只能点击树节点 | toggle 按钮 / 点击树节点均可退出 |

### 上下文标题同步

帮助按钮按下后，`adl-tool-navigator__context-title` 从"文件树/目录列表"变更为"帮助"，与"文件树"、"目录列表"两个按钮的行为模式一致。

## 3. 操作手册内容增强

### 结构变化

| 章节 | 来源 | 说明 |
|------|------|------|
| 面板布局与操作 | 新增 | 导航侧边栏、主内容区域、工具栏按钮三个子节 |
| 基础使用 | 扩展 | 新增自动刷新机制、多工作区管理、配置步骤清单、状态颜色可视化卡片 |
| 进阶概念 | 补全 | 每个概念独立卡片（定义 + 类比），补全 Conclusion、Status |
| 故障排查 | 新增（内容已存在于 i18n） | 4 个常见问题 × 原因 + 解决方案 |
| GitHub Token 配置 | 扩展 | 新增所需权限列表、6 步创建指南、经典令牌模式 |

### 目录导航更新

左侧边栏的 TOC（Table of Contents）同步更新为 5 个章节 + 各子节条目，点击后使用 `scrollIntoView({ behavior: 'smooth', block: 'start' })` 平滑滚动到对应锚点。

### 专业度提升

- 状态颜色改为彩色圆点 + 中英双语 + 含 `queued`/`cancelled` 的完整状态枚举
- 进阶概念采用"定义 + 流水线类比"双行格式，增强可理解性
- 故障排查采用"可能原因 + 解决方案"结构化格式
- Token 配置采用分步操作指南（1-6 步），附权限说明和安全提示
