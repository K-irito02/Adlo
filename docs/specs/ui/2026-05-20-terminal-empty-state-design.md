# 终端空状态重新设计

## 背景

当前终端面板在没有任何终端标签页时，直接在空状态区域渲染 `shellButtonGroup`（即 `adl-split-pill` 复合按钮），视觉上显示为一个完整的按钮组件（"← PowerShell ▾"）。

需求：空状态的提示信息需要**保留复合按钮的全部功能**（创建终端 + 选择 Shell 类型），但**视觉上不显示为按钮**，而是呈现为更像"提示信息"的风格。

## 设计决策

| 决策项 | 选择 | 原因 |
|--------|------|------|
| 基础风格 | 设计 B（描述提示 + 指引操作） | 简洁文字引导 + 图标+文字提示，符合终端面板的定位 |
| 布局方案 | B-1（嵌入卡片式） | 实线圆角卡片包裹，视觉清晰可辨识 |
| 交互效果 | 悬停浮现边框+背景，按下加深背景 | 保留交互反馈，但维持"提示信息"视觉定位 |
| Shell 列表来源 | 动态继承 `shellMenuItems` | 与工具栏保持数据源一致，新增/删除 Shell 类型时自动同步 |
| 默认标记 | 不显示"默认"文字 | 卡片已列出所有类型，用户直接点击即可 |
| 点击空白区域 | 不触发创建 | 必须点击具体的 Shell 选项才创建 |
| 工具栏 split-pill | 保持不变 | 空状态下工具栏中的复合按钮保留原有功能和显示 |

## 布局结构

```
┌──────────────────────────────────────────────┐
│  [⏽ 图标] 终端面板                            │
│                                                │
│  当前没有打开的终端会话。                       │
│  选择一个 Shell 类型开始：                      │
│                                                │
│  ┌─────────┐  ┌─────┐  ┌──────┐              │
│  │ PS PowerShell │  │ > CMD │  │ $ Bash │     │
│  └─────────┘  └─────┘  └──────┘              │
│                                                │
│  点击直接创建 · 也支持在工具栏操作               │
└──────────────────────────────────────────────┘
```

### 4 个内容层级

1. **图标 + 标题行**：终端图标 + "终端面板"文字
2. **描述文字**：引导用户操作
3. **Shell 选择行**：从 `shellMenuItems` 动态渲染每个 Shell 类型作为可点击项，仅渲染 `profile` 类型的条目（排除 `separator` 和 `new-terminal` 这种 action-only 项）
4. **页脚提示**：提醒用户还有工具栏可用

## 交互状态矩阵

| 状态 | 整体卡片边框 | Shell 选项 |
|------|-------------|-----------|
| 默认 | `1px solid var(--border)` | `border: 1px solid transparent`，无背景 |
| 悬停 | 不变 | `border: 1px solid var(--border)`；`background: var(--bg-muted)` |
| 按下 | 不变 | `background: var(--surface-hover)` |
| 点击释放 | 不变 | 执行 `handleCreateTab(profile)`，创建对应类型终端 |

## CSS 类设计

| 类名 | 用途 | 说明 |
|------|------|------|
| `.adl-terminal-empty` | 外层容器 | 替代现有的 `.adl-tool-primary--terminal-empty`，flex 居中 |
| `.adl-terminal-empty__card` | 内层卡片 | 实线边框 + 圆角 + flex 列居中布局 |
| `.adl-terminal-empty__item` | Shell 选项项 | 默认透明边框，悬停浮现边框+背景 |
| `.adl-terminal-empty__item:active` | 按下态 | `var(--surface-hover)` 背景 |

### CSS 代码（新增到 `regions.css`）

```css
/* ---- 终端空状态卡片 ---- */
.adl-terminal-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: var(--bg);
}

.adl-terminal-empty__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: 28px 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  max-width: 380px;
}

.adl-terminal-empty__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-secondary);
  font-size: var(--font-sm);
}

.adl-terminal-empty__text {
  margin: 0;
  font-size: var(--font-sm);
  color: var(--text-muted);
  text-align: center;
  line-height: 1.6;
}

.adl-terminal-empty__items {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
  justify-content: center;
}

.adl-terminal-empty__item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  cursor: pointer;
  border: 1px solid transparent;
  color: var(--text-secondary);
  transition: background-color var(--duration-150) var(--ease-default),
              border-color var(--duration-150) var(--ease-default);
  background: transparent;
}

.adl-terminal-empty__item:hover {
  border-color: var(--border);
  background: var(--bg-muted);
}

.adl-terminal-empty__item:active {
  background: var(--surface-hover);
}

.adl-terminal-empty__prefix {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: var(--font-xs);
}

.adl-terminal-empty__footer {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--text-muted);
}
```

## 实现变更

### TerminalPanel.tsx 变更

**改动范围**：仅修改空状态渲染部分（`hasActiveTab ?` 的 else 分支），不涉及其他逻辑。

**移除**：
- 空状态区域中的 `{shellButtonGroup}` 直接渲染
- `.adl-tool-primary--terminal-empty` 类名

**新增**：在空状态分支中渲染新的卡片组件：

```tsx
// 从 shellMenuItems 中筛选出 profile 类型的选项
const shellTypeItems = useMemo(
  () => shellMenuItems.filter((item) => "profile" in item),
  [shellMenuItems]
);

// 空状态渲染（替换原来的 {shellButtonGroup}）
<div className="adl-terminal-empty">
  <div className="adl-terminal-empty__card">
    <div className="adl-terminal-empty__header">
      <IconTerminal size={16} decorative />
      <span>终端面板</span>
    </div>
    <p className="adl-terminal-empty__text">
      当前没有打开的终端会话。<br />
      选择一个 Shell 类型开始：
    </p>
    <div className="adl-terminal-empty__items">
      {shellTypeItems.map((item) => (
        <button
          key={item.id}
          type="button"
          className="adl-terminal-empty__item"
          onClick={() => handleCreateTab(item.profile)}
        >
          <ShellPrefix profile={item.profile} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
    <p className="adl-terminal-empty__footer">
      点击直接创建 · 也支持在工具栏操作
    </p>
  </div>
</div>
```

其中 `ShellPrefix` 为内联组件，根据不同 profile 显示终端风格前缀：

```tsx
// 根据 profile 渲染 Shell 前缀字符和颜色
function ShellPrefix({ profile }: { profile?: TerminalProfile }) {
  const map: Record<string, { text: string; color: string }> = {
    powershell: { text: "PS", color: "var(--green, #4ade80)" },
    cmd: { text: ">", color: "var(--blue, #60a5fa)" },
    bash: { text: "$", color: "var(--yellow, #facc15)" },
  };
  const entry = map[profile ?? "powershell"];
  return (
    <span
      className="adl-terminal-empty__prefix"
      style={{ color: entry?.color }}
    >
      {entry?.text ?? "$"}
    </span>
  );
}
```

### regions.css 变更

- 保留 `.adl-tool-primary--terminal-empty` 的现有样式（兼容性，或完全替换为 `.adl-terminal-empty`）
- 新增上述所有 `.adl-terminal-empty__*` 样式类

### 不变的部分

| 部分 | 说明 |
|------|------|
| `shellButtonGroup` 变量 | 工具栏中仍使用原有的 split-pill 复合按钮 |
| `shellMenuItems` 数据源 | 空状态卡片从中动态渲染，保持一致 |
| `handleCreateTab(profile)` | 点击选项时的创建逻辑完全复用 |
| `shellMenuRef` / `shellMenuOpen` | 工具栏下拉菜单逻辑不变 |
| `currentProfile` / `currentProfileLabel` | 工具栏按钮显示逻辑不变 |

## 无破坏性验证

| 检查项 | 预期 |
|--------|------|
| 空状态显示新卡片 | 不再显示 split-pill 按钮 |
| 点击 PowerShell 创建 PowerShell 终端 | 正常 |
| 点击 CMD 创建 CMD 终端 | 正常 |
| 点击 Bash 创建 Bash 终端 | 正常 |
| 工具栏 split-pill 按钮 | 始终保持原样 |
| 有终端标签时显示 xterm | 不变 |
| 终端导航面板 | 不变 |
| 暗色/亮色主题切换 | 卡片正确适配 |
