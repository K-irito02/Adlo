
# 终端工作区绑定功能改进方案

## 一、需求分析

### 1.1 背景
用户反馈在终端功能中存在以下问题：
- 创建终端时无法选择是否绑定工作区
- 独立临时终端在左侧边栏没有合适的展示位置
- 用户希望在多个入口点都能选择创建独立终端或绑定到特定工作区

### 1.2 核心需求
根据用户描述，需要在三个关键区域改进：

| 区域 | 当前问题 | 改进目标 |
|------|----------|----------|
| 复合按钮 (TerminalShellSelector) | 点击直接创建终端，无工作区选择 | 添加工作区选择菜单，支持独立终端和绑定工作区 |
| 欢迎导航区域 (TerminalEmptyState) | 仅显示shell类型选择 | 添加工作区选择功能 |
| 工作区头部行 (WorkspaceTerminalEntry) | 只能在特定工作区下创建终端 | 添加"独立临时工作区"条目 |

### 1.3 功能需求细化
1. **独立终端标识**：未绑定任何工作区的终端应显示在独立区域
2. **工作区选择**：创建终端时可选择绑定到现有工作区或创建独立终端
3. **视觉区分**：独立终端应与工作区终端有清晰的视觉区分

---

## 二、技术方案

### 2.1 核心概念
- **独立终端**：`workspaceId` 为空字符串 `""` 的终端
- **工作区终端**：`workspaceId` 为有效工作区ID的终端
- **临时工作区条目**：在侧边栏显示一个虚拟工作区，用于展示所有独立终端

### 2.2 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    TerminalPanel                            │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────┐  │
│  │           TerminalShellSelector (复合按钮)            │  │
│  │  ┌─────────────────────────────────────────────┐     │  │
│  │  │  [+ PowerShell] [▼]                         │     │  │
│  │  │  ├─ 新建终端 (独立)                          │     │  │
│  │  │  ├─ 绑定工作区                              │     │  │
│  │  │  │   ├─ Workspace A                         │     │  │
│  │  │  │   └─ Workspace B                         │     │  │
│  │  │  ├─ ─────────────                           │     │  │
│  │  │  └─ Shell类型选择                           │     │  │
│  │  └─────────────────────────────────────────────┘     │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              MultiWorkspaceTerminal                  │  │
│  │  ┌───────────────────────────────────────────────┐   │  │
│  │  │  [独立临时工作区]  (显示独立终端)              │   │  │
│  │  │  [Workspace A]     (显示A的终端)              │   │  │
│  │  │  [Workspace B]     (显示B的终端)              │   │  │
│  │  └───────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            TerminalEmptyState (欢迎区域)            │  │
│  │  ┌─────────────────────────────────────────────┐     │  │
│  │  │  选择Shell类型:                              │     │  │
│  │  │  [PowerShell] [Bash] [CMD]                   │     │  │
│  │  │  工作区绑定:                                 │     │  │
│  │  │  [独立终端] [Workspace A] [Workspace B]      │     │  │
│  │  └─────────────────────────────────────────────┘     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 状态管理

当前终端状态已支持 `workspaceId` 字段：

```typescript
// terminalSlice.ts
interface TerminalTabState {
  id: string;
  title: string;
  profile: TerminalProfile;
  workspaceId: string;  // 空字符串表示独立终端
  // ...其他字段
}
```

---

## 三、文件修改计划

### 3.1 修改文件清单

| 文件路径 | 修改类型 | 说明 |
|----------|----------|------|
| `src/app/features/terminal/useTerminalPanel.ts` | 功能增强 | 添加工作区选择菜单生成逻辑 |
| `src/app/features/terminal/TerminalShellSelector.tsx` | UI修改 | 添加工作区选择子菜单 |
| `src/app/features/terminal/TerminalEmptyState.tsx` | UI修改 | 添加工作区选择区域 |
| `src/app/features/workspace-terminal/MultiWorkspaceTerminal.tsx` | 功能增强 | 添加独立终端工作区条目 |
| `src/app/features/workspace-terminal/WorkspaceTerminalEntry.tsx` | 功能增强 | 支持虚拟工作区显示 |

### 3.2 详细修改方案

#### 3.2.1 useTerminalPanel.ts
**目标**：生成包含工作区选择的菜单配置

**修改内容**：
1. 扩展 `TerminalShellMenuItem` 类型，添加工作区相关字段
2. 修改 `shellMenuItems` 生成逻辑，添加工作区选择项
3. 添加 `handleCreateTabWithWorkspace` 辅助函数

```typescript
// 新增类型
interface WorkspaceMenuItem {
  id: string;
  type: 'workspace';
  label: string;
  workspaceId: string;
}

// 修改菜单生成逻辑
const shellMenuItems = useMemo(() => {
  const items: TerminalShellMenuItem[] = [
    { id: 'new-terminal', label: t.menuNewTerminal, action: () => handleCreateTab(currentProfile) },
    { id: 'sep-1', separator: true },
    // 添加工作区选择子菜单
    { id: 'workspace-section', label: t.bindToWorkspace, hasSubMenu: true, subMenu: workspaceMenuItems },
    { id: 'sep-2', separator: true },
    { id: 'powershell', label: 'PowerShell', profile: 'powershell' },
    { id: 'bash', label: 'Bash', profile: 'bash' },
    { id: 'cmd', label: 'CMD', profile: 'cmd' },
  ];
  return items;
}, [currentProfile, workspaceMenuItems, t]);
```

#### 3.2.2 TerminalShellSelector.tsx
**目标**：实现带有工作区选择的下拉菜单

**修改内容**：
1. 修改菜单渲染逻辑，支持子菜单展示
2. 添加工作区选择的交互处理
3. 更新组件样式支持多级菜单

#### 3.2.3 TerminalEmptyState.tsx
**目标**：在欢迎区域添加工作区选择

**修改内容**：
1. 新增 `workspaces` 属性接收工作区列表
2. 在shell选择下方添加工作区选择区域
3. 支持"独立终端"和各工作区选项

#### 3.2.4 MultiWorkspaceTerminal.tsx
**目标**：添加独立终端工作区条目

**修改内容**：
1. 在工作区列表前添加虚拟的"独立临时工作区"
2. 过滤并显示 `workspaceId === ""` 的终端
3. 支持在独立工作区下创建新终端

#### 3.2.5 WorkspaceTerminalEntry.tsx
**目标**：支持虚拟工作区显示

**修改内容**：
1. 添加虚拟工作区标识处理
2. 调整工作区名称显示逻辑

---

## 四、数据流向

```
用户操作 → UI组件 → useTerminalPanel → terminalSlice → 状态更新
     ↑                                                      │
     └──────────────────────────────────────────────────────┘
```

### 4.1 创建独立终端流程
1. 用户点击"新建终端(独立)"或选择工作区为"独立终端"
2. `handleCreateTab(profile, "")` 被调用
3. `terminalCreateTab(profile, "")` 创建终端，`workspaceId` 为空
4. 终端显示在"独立临时工作区"下

### 4.2 创建绑定工作区终端流程
1. 用户选择绑定到某个工作区
2. `handleCreateTab(profile, workspaceId)` 被调用
3. `terminalCreateTab(profile, workspaceId)` 创建终端
4. 终端显示在对应工作区下

---

## 五、UI/UX 设计

### 5.1 复合按钮菜单设计
```
┌─────────────────────────────┐
│ 新建终端 (独立)             │  ← 点击直接创建独立终端
├─────────────────────────────┤
│ 绑定工作区 ▶               │  ← 悬停显示子菜单
│   ├─ Workspace A           │
│   ├─ Workspace B           │
│   └─ Workspace C           │
├─────────────────────────────┤
│ ─────────────              │  ← 分隔线
│ PowerShell ●               │  ← 当前选中
│ Bash                       │
│ CMD                        │
└─────────────────────────────┘
```

### 5.2 欢迎区域设计
```
┌─────────────────────────────────────────────┐
│     终端面板                                │
├─────────────────────────────────────────────┤
│ 当前没有打开的终端会话                      │
│ 选择一个 Shell 类型开始：                    │
├─────────────────────────────────────────────┤
│ [PS PowerShell] [$ Bash] [> CMD]           │
├─────────────────────────────────────────────┤
│ 工作区绑定：                                │
│ [独立终端 ◉] [Workspace A] [Workspace B]   │
├─────────────────────────────────────────────┤
│ 点击直接创建 · 也可以在工具栏操作            │
└─────────────────────────────────────────────┘
```

### 5.3 工作区列表设计
```
终端 (3)
├─ 独立临时工作区 [+] [×]
│   └─ PowerShell (1)
├─ Workspace A [+] [×]
│   └─ PowerShell (2)
└─ Workspace B [+] [×]
    └─ Bash (1)
```

---

## 六、兼容性考虑

### 6.1 向后兼容
- 现有终端的 `workspaceId` 为空的将自动归类到"独立临时工作区"
- 现有创建终端的API保持兼容

### 6.2 迁移策略
- 无需数据迁移，通过状态计算实现分类

---

## 七、测试计划

### 7.1 功能测试点

| 测试场景 | 预期结果 |
|----------|----------|
| 点击复合按钮主按钮 | 创建独立终端 |
| 选择绑定到工作区A | 终端显示在工作区A下 |
| 在欢迎区域选择独立终端 | 创建独立终端 |
| 在工作区头部行点击创建 | 终端绑定到对应工作区 |
| 在独立临时工作区点击创建 | 创建独立终端 |

### 7.2 边界测试
- 无工作区时独立终端的显示
- 大量工作区时菜单的滚动处理
- 工作区名称过长时的截断处理

---

## 八、实现步骤

| 步骤 | 任务 | 负责人 | 预估时间 |
|------|------|--------|----------|
| 1 | 修改 useTerminalPanel.ts 添加菜单逻辑 | 开发 | 2h |
| 2 | 修改 TerminalShellSelector.tsx 支持子菜单 | 开发 | 2h |
| 3 | 修改 TerminalEmptyState.tsx 添加工作区选择 | 开发 | 2h |
| 4 | 修改 MultiWorkspaceTerminal.tsx 添加虚拟工作区 | 开发 | 3h |
| 5 | 修改 WorkspaceTerminalEntry.tsx 支持虚拟工作区 | 开发 | 2h |
| 6 | 类型检查和测试 | 开发 | 2h |

---

## 九、风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 菜单交互复杂导致用户困惑 | 中等 | 用户体验 | 保持菜单简洁，添加清晰标签 |
| 独立终端与工作区终端混淆 | 低 | 用户体验 | 视觉上明显区分 |
| 性能问题（大量工作区） | 低 | 性能 | 实现虚拟化滚动 |
