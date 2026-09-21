# 浏览器地址栏复制按钮动画化 —— 2026-06-18

## 概述

将浏览器地址栏的静态 `IconCopy` 替换为 `lucide-animated` 的动画版 `CopyIcon`，点击复制时图标播放 Motion 弹簧动画（rect 上左偏移 + path 右下偏移，模拟"文件抽出"效果），500ms 后自动恢复原始状态。

## 改动文件

| 文件 | 变更 |
|------|------|
| `frontend/package.json` | 新增 `lucide-animated@^1.0.4` + `motion@^12.40.0` |
| `frontend/pnpm-lock.yaml` | 锁定传递依赖 |
| `frontend/src/app/features/browser/BrowserToolbar.tsx` | 替换图标组件 + 动画控制逻辑 |
| `frontend/src/styles/regions/rightpanel/browser-toolbar.css` | 新增 `.is-copied` 绿色状态 + `adl-copy-pop` 关键帧动画 |

## 架构决策

### 为何使用 lucide-animated 而非自建动画

- 项目自有的 SVG 图标系统（`frontend/src/app/icons/`）为纯静态图标，无动画能力
- `lucide-animated` 基于 `motion`（Framer Motion 独立包）提供开箱即用的动画图标
- 每个图标已封装 `startAnimation()` / `stopAnimation()` 命令式 API，ref 附加后自动禁用 hover 动画
- 避免自行实现 SVG 路径动画的复杂度

### 动画控制模式

```tsx
// 点击时
copyIconRef.current?.startAnimation();   // 启动弹簧动画
setTimeout(() => copyIconRef.current?.stopAnimation(), 500);  // 动画完成后恢复

// 组件卸载时清理定时器
useEffect(() => {
  return () => {
    if (resetTimerRef.current !== undefined) {
      clearTimeout(resetTimerRef.current);
    }
  };
}, []);
```

- 使用 `resetTimerRef` 跟踪定时器，快速重复点击时清除上一次的定时器，防止过早 `stopAnimation` 打断新动画
- `CopyIcon` 的弹簧动效参数：`stiffness: 160, damping: 17, mass: 1`，视觉约 300-400ms

### 反馈状态

| 状态 | Tooltip | 图标颜色 | 图标 |
|------|---------|----------|------|
| 默认 | `t.browserCopyLink`（"复制链接"） | `--text-secondary` | 静态 CopyIcon |
| 已复制 | `t.copySuccessClipboard`（"已复制到剪贴板"） | `--color-success`（绿色） | 播放抽出动画，500ms 后恢复 |

## 关键经验

1. **`lucide-animated` 的 handle 类型命名**：图标 handle 名为 `<IconName>Handle`（如 `CopyIconHandle`），不是简单的 `<Name>Handle`。从 `index.d.ts` 确认。
2. **动画必须显式恢复**：`startAnimation()` 将元素过渡到 `animate` variant 并停留，不会自动回退。必须配合 `stopAnimation()` 或 `controls.start('normal')` 恢复。
3. **`lucide-animated` 图标无 `decorative` prop**：项目自有图标系统有 `decorative` prop，但 `lucide-animated` 图标只接受标准 `HTMLAttributes` + `size` + `animateOnHover`。移除 `decorative` 并使用标准属性。
4. **`React.memo` 兼容**：`CopyIcon` 由 `forwardRef` 包裹，可在 `React.memo` 组件内使用 ref 控制。
