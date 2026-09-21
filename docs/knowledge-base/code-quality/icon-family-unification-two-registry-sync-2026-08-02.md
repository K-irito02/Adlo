# 图标家族几何统一与双图标系统同步 — 2026-08-02

来源：Git 可视化「时间范围」按钮与日历（MiniDatePicker）导航箭头 chevron 化重构（方案 A/C）。

## 1. 修改共享图标几何是全应用级变更，需显式决策

- 现象：将共享 `IconChevronRight` 从 lucide 几何（`m9 18 6-6-6-6`，宽 6×高 12）改为新几何（`M10 17L15 12L10 7`，宽 5×高 10）后，全应用约 20~25 处使用该图标的组件（文件树、手风琴、审批卡片、CI 面板等）外观同步变化（约 1px 变窄变短）。
- 教训：
  - 共享图标（`app/icons/core.tsx` 等）被广泛引用时，几何/路径修改必须意识到是全应用级变更，并主动向用户确认（存在多套可行方案时用询问卡片）。
  - 纯几何微调虽无逻辑依赖（无快照测试引用），但可能引入家族内视觉不一致——见下条。

## 2. 图标家族须统一几何，避免展开/折叠状态跳变

- 问题：仅改 `IconChevronRight/Left` 而不改 `IconChevronDown/Up`，会导致折叠态（右 chevron）与展开态（下 chevron）尺寸不一致，在 `TreeRow`/`TreeNodeRow`/`StepBlock`/`TokenUsage` 等展开-折叠切换组件中出现肉眼可辨的跳变。
- 方案 C（推荐）：将整个 chevron 家族统一到同一套紧凑几何。以右 chevron 为基准，其余方向用围绕中心 (12,12) 的刚体变换导出：
  - Right `M10 17L15 12L10 7`（峰值 x=15）
  - Left = 水平镜像 → `M14 7L9 12L14 17`
  - Down = 逆时针 90°（`(x,y)→(24−y, x)`）→ `M7 10L12 15L17 10`
  - Up = 顺时针 90°（`(x,y)→(y, 24−x)`）→ `M17 14L12 9L7 14`
- 要点：四个方向保持同尺寸（5×10 单位盒），保证任意方向旋转/切换视觉完全对齐。
- **双 chevron（`IconChevronsLeft/Right`）同样统一到 5×10 单位盒**（最初用户提供的双 chevron 为 6×12，与单 chevron 存在约 1 单位比例差异；2026-08-02 用户确认统一）：
  - `IconChevronsRight`：`M14 17L19 12L14 7` + `M6 17L11 12L6 7`（尖端 x=19 / x=11，臂向内 x=14 / x=6）
  - `IconChevronsLeft`：`M10 17L5 12L10 7` + `M18 17L13 12L18 7`（Right 的水平镜像）
  - 两个 chevron 各宽 5、高 10（y 7..17），整体轴 x=12.5，与单 chevron 家族同比例同轴。

## 3. 项目存在两套图标系统，修改必须同步

- 现状：
  - `frontend/src/app/icons/` — React 组件图标（`make()` 辅助函数，`IconChevronRight` 等），用于绝大多数 UI。
  - `frontend/src/design-system/icons.ts` — 字符串图标注册表（`ICON_PATHS` + `renderIcon()`），用于 Toast/Icon/EnvironmentControls/QuickActions/SessionManagement/ActionButton/ContextBuilder。
- 教训：两套系统在本次改动前使用完全相同的 lucide chevron 几何；只改 `app/icons` 会使两套系统分歧（5×10 vs 6×12），若并排渲染会尺寸错位。**修改共享图标几何时，必须同时检查并同步 `design-system/icons.ts` 中的同名条目**。
- 测试防护：`design-system/__tests__/icons.test.ts` 断言 `renderIcon()` 输出的 4 个 chevron 路径为新几何，`app/icons/core.test.tsx` 断言组件图标路径——两套测试共同守护一致性。

## 4. SVG 渲染尺寸与几何差异需换算

- 审查中用「viewBox 单位」描述的 1px 差异，在实际渲染（如 size=12，即 24 viewBox → 12px 缩放）中约为一半（约 0.5px 水平、1px 垂直）。评估视觉影响时应换算到实际渲染像素，避免高估/低估。

## 5. 测试断言 SVG 内部 path 的取舍

- 图标组件/注册表的几何测试直接断言 `path d` 字符串（如 `expect(path.getAttribute('d')).toBe('M10 17L15 12L10 7')`）。这类测试对「几何被意外改动」极其敏感（本次正是靠它抓住两套系统分歧），但对渲染细节（stroke-width、viewBox）也作断言。适合图标这一类**纯几何组件**；普通组件应断言可观察行为而非 DOM 内部。
