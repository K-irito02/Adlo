# Minimap 右键菜单 + Diff 背景修复 实施计划

## 任务目标

1. 在「文件」和「变更（内联模式）」的 minimap canvas 区域添加右键菜单功能
2. 修复变更面板 minimap diff 背景颜色（绿色新增不显示、红色删除错误）
3. 修复 diff 背景覆盖内容字符的问题
4. 确保两面板 minimap 功能一致性
5. 支持自动换行切换

## 实施状态

### ✅ 已完成的步骤

| 步骤 | 文件 | 状态 |
|------|------|------|
| Step 1 | `minimapVisualOverlay.ts` | ✅ 新增 `MinimapSettings` 类型、`MINIMAP_DEFAULTS`、`loadMinimapSettings`、`saveMinimapSettings` |
| Step 2 | `minimapVisualOverlay.ts` | ✅ 扩展 `MinimapOverlayOptions`：`getLinePixelTop`、`getContentPixelHeight`、`onSettingsChange`、`getSettings` |
| Step 3 | `minimapVisualOverlay.ts` | ✅ 新增 `computeMinimapDiffIndicatorStylePx` 像素级定位函数 |
| Step 4 | `minimapVisualOverlay.ts` | ✅ `renderDiffIndicators` 支持像素级渲染路径 |
| Step 5 | `minimapVisualOverlay.ts` | ✅ `attachMinimapVisualOverlays` 注入右键菜单 DOM |
| Step 6 | `ChangesPanel.tsx` | ✅ 移除 `CHANGE_MINIMAP_DECORATION_COLORS`，接入自定义 overlay 系统 |
| Step 7 | `ChangesPanel.tsx` | ✅ 添加 `minimapSettings` 状态、`handleMinimapSettingsChange`、`changesPreviewShellRef` |
| Step 8 | `FilesPanel.tsx` | ✅ 统一 minimap 配置、添加 `onSettingsChange`/`getSettings` 回调 |
| Step 9 | `monacoTypes.ts` | ✅ `minimap.color`/`darkColor` 改为可选、新增 `getTopForLineNumber` |
| Step 10 | `regions.css` | ✅ diff indicators 半透明 `opacity: 0.65` + 右键菜单完整 CSS |
| Step 11 | `minimapVisualOverlay.test.ts` | ✅ 新增 `computeMinimapDiffIndicatorStylePx`、`MinimapSettings` 持久化、右键菜单 CSS 测试 |

### ⏳ 待执行

| 步骤 | 命令 | 说明 |
|------|------|------|
| 类型检查 | `npm run frontend:typecheck` | 已在上一轮通过，需最终确认 |
| 全量单元测试 | `npm run frontend:test` | 运行 vitest 验证所有测试通过 |

## 修复的技术问题

| 问题 | 根因 | 修复方案 |
|------|------|----------|
| 绿色（新增）不显示 | ChangesTab 未调用 `attachMinimapVisualOverlays` | 在 ChangesTab 的 `useEffect` 中接入 overlay 系统 |
| 红色显示错误 | Monaco 原生 minimap 装饰位置计算不准确 | 移除原生颜色，使用自定义 DOM indicator + 像素级定位 |
| diff 背景覆盖字符 | Monaco 原生 minimap 装饰在 canvas 上绘制不透明矩形 | 自定义 DOM 层设置 `opacity: 0.65`，在 canvas 之上 |
| 面板 minimap 不一致 | 不同配置参数 | 统一使用 `MINIMAP_DEFAULTS` + localStorage 持久化 |
| 自动换行兼容 | 行号映射无法反映换行 | 使用 Monaco `getTopForLineNumber()` API 像素级映射 |

## 设计方案总结

- **右键菜单**：DOM 注入到 `document.body`，包含 check 项和 radio 分组，设置持久化到 localStorage
- **Diff 指标**：自定义 DOM 层覆盖在 minimap 画布上，使用 CSS 变量主题色 + 半透明
- **像素映射**：优先使用 `getTopForLineNumber()` API 自动处理换行，回退到行号映射
- **设置同步**：通过 `onSettingsChange`/`getSettings` 回调桥接 overlay 与面板状态
