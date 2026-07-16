# 终端工作区绑定功能改进

> 日期: 2026-05-27

## 背景

用户反馈终端功能存在以下问题：
1. 从工作区头部创建终端时，终端处于不可用状态（PTY会话未初始化）
2. 创建终端时无法选择是否绑定工作区或创建独立临时终端
3. 复合按钮子菜单交互体验不佳（位置不准确、关闭逻辑不合理）
4. 工作区头部"更多操作"菜单的子菜单交互体验不佳
5. 工作区默认终端类型无法独立设置

## 目标

1. 修复终端创建时PTY会话未初始化的问题
2. 添加工作区绑定选择功能（绑定工作区或创建独立终端）
3. 优化复合按钮子菜单交互（位置、关闭延迟）
4. 优化工作区头部子菜单交互
5. 添加绑定工作区后不自动创建终端的功能
6. 支持每个工作区独立设置默认终端类型

## 修改的文件

### 功能代码

| 文件 | 修改内容 |
|------|----------|
| `useTerminalPanel.ts` | 添加工作区菜单选项、扩展类型定义、修复终端创建时使用正确的工作区默认终端类型 |
| `TerminalShellSelector.tsx` | 实现子菜单交互逻辑、延迟关闭机制、工作区绑定显示 |
| `TerminalEmptyState.tsx` | 添加工作区选择区域（已移除欢迎导航区域） |
| `TerminalPanel.tsx` | 移除欢迎导航区域（TerminalEmptyState组件） |
| `MultiWorkspaceTerminal.tsx` | 添加独立终端工作区条目 |
| `WorkspaceTerminalEntry.tsx` | 添加子菜单交互、向右箭头标识、工作区默认终端类型设置 |
| `stores/slices/terminalSlice.ts` | 添加 `terminalWorkspaceId` 和 `workspaceDefaultProfiles` 状态、添加 `setWorkspaceDefaultTerminalProfile` 方法 |
| `stores/selectors.ts` | 添加 `getWorkspaceDefaultProfiles` 和 `useWorkspaceDefaultProfiles` 选择器 |

### 样式文件

| 文件 | 修改内容 |
|------|----------|
| `terminal-panel.css` | 子菜单样式（宽度、位置、阴影、滚动条）、移除欢迎导航区域样式 |
| `file-tree.css` | 子菜单样式（位置、间距、阴影）、合并重复的 `.adl-multitree-entry__menu-item--with-sub` 规则 |

### 翻译文件

| 文件 | 修改内容 |
|------|----------|
| `copy.ts` | 添加 `terminalIndependent` 和 `terminalBindWorkspace` 翻译文本 |

### 测试文件（已清理）

| 文件 | 修改内容 |
|------|----------|
| `test-log.ts` | 临时测试日志文件（已删除） |

## 功能特性

### 1. 复合按钮工作区绑定

- **子菜单位置**：显示在"绑定工作区"选项右侧，顶部对齐，保持6px间距
- **延迟关闭机制**：200ms延迟关闭，鼠标从主菜单项移动到子菜单时不会意外关闭
- **绑定工作区显示**：下拉按钮显示当前绑定的工作区名称，名称过长时截断（超过12字符），鼠标悬停显示完整名称
- **绑定后不自动创建**：点击工作区绑定选项后，只绑定工作区，需手动点击创建按钮才创建终端

### 2. 工作区头部行改进

- 添加"独立终端"工作区条目
- "更多操作"菜单的"默认为xxx终端"选项添加向右箭头标识
- 子菜单位置：显示在选项右侧，顶部对齐，保持6px间距
- 延迟关闭机制：150ms延迟关闭
- 支持为每个工作区独立设置默认终端类型

### 3. 独立终端支持

- 支持创建不依赖任何工作区的独立临时终端
- 独立终端显示在"独立终端"工作区条目下
- 可在独立工作区下创建新终端

### 4. 工作区默认终端类型

- 每个工作区可独立设置默认终端类型（PowerShell/Bash/CMD）
- 设置后创建终端时自动使用该类型
- 使用 localStorage 持久化保存设置

## 交互改进

### 子菜单延迟关闭机制

使用 `setTimeout` + `clearTimeout` 实现自然的菜单交互体验：

```typescript
const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const handleMouseEnterSubMenu = useCallback((itemId: string) => {
  if (leaveTimerRef.current) {
    clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = null;
  }
  setActiveSubMenuId(itemId);
}, []);

const handleMouseLeaveSubMenu = useCallback(() => {
  leaveTimerRef.current = setTimeout(() => {
    setActiveSubMenuId(null);
    leaveTimerRef.current = null;
  }, 200);
}, []);
```

### 子菜单位置计算

使用 `getBoundingClientRect()` 获取元素位置，确保子菜单准确显示在父菜单项右侧：

```typescript
if (subMenuTriggerRef.current) {
  const rect = subMenuTriggerRef.current.getBoundingClientRect();
  setSubMenuPosition({ top: rect.top, left: rect.right + 6 });
}
```

## 核心修复

### 终端创建时使用正确的工作区默认终端类型

修复了 `useTerminalPanel.ts` 中 `handleCreateTab` 函数的一个关键问题：

```typescript
// 修复前
terminalCreateTab(profile, workspaceId ?? "");

// 修复后
terminalCreateTab(finalProfile, workspaceId ?? "");
```

原来的代码直接传递原始的 `profile` 参数，而不是计算好的 `finalProfile`，导致工作区默认终端类型设置没有被正确应用。

> 经验教训已迁移至 [knowledge-base/multi-workspace/terminal-binding.md](../../knowledge-base/multi-workspace/terminal-binding.md)

## 验证结果

所有修改已通过类型检查验证，183个测试全部通过。
