# 组件库总览与分类 (Component Overview)

> 定义 Phase 0 所需的全部 UI 组件清单、分类、优先级和依赖关系

## 1. 组件分类体系

```
┌─────────────────────────────────────────────────────┐
│                   UI Component Library              │
├──────────┬──────────┬──────────┬───────────────────┤
│ 基础组件  │ 复合组件  │ 布局组件  │   反馈/覆盖组件    │
│          │          │          │                   │
│ Button   │ Card     │ Sidebar  │ Modal / Dialog    │
│ Input    │ FormField│ Navbar   │ Toast / Alert     │
│ Select   │ DataTable│ Breadcrumb│ Tooltip          │
│ Textarea │ List     │ Tabs     │ Popover           │
│ Checkbox │ Accordion│ Skeleton │ Drawer            │
│ Switch   │ TreeView │ Divider  │ ConfirmDialog     │
│ Radio    │ StepList │ Grid     │ EmptyState        │
│ Badge    │          │ Container│ LoadingOverlay    │
│ Tag      │          │          │ ErrorBoundary     │
│ Avatar   │          │          │                   │
└──────────┴──────────┴──────────┴───────────────────┘
```

## 2. 组件优先级分级

### P0 - 核心必做（Phase 0 必须实现）

这些组件在第一阶段 UI 文档中被高频使用，是应用可用的基础：

| # | 组件名 | 文档 | 使用频率 | 说明 |
|---|--------|------|----------|------|
| 1 | **Button** | [01-button-spec.md](./01-button-spec.md) | ★★★★★ | 几乎每个页面都有 |
| 2 | **Input / Textarea** | [02-input-spec.md](./02-input-spec.md) | ★★★★★ | 搜索、表单、设置 |
| 3 | **Card** | [03-card-spec.md](./03-card-spec.md) | ★★★★☆ | 工作区信息、状态卡片、任务项 |
| 4 | **Badge / Tag** | [04-badge-tag-spec.md](./04-badge-tag-spec.md) | ★★★★☆ | 状态标签、Git 状态、风险等级 |
| 5 | **Modal / Dialog** | [05-modal-dialog-spec.md](./05-modal-dialog-spec.md) | ★★★★☆ | 确认对话框、错误详情、关于页 |
| 6 | **Tooltip** | [06-tooltip-spec.md](./06-tooltip-spec.md) | ★★★★☆ | 全局辅助说明 |
| 7 | **Table / List** | [07-table-list-spec.md](./07-table-list-spec.md) | ★★★★☆ | 任务列表、日志列表、文件列表 |
| 8 | **Navigation** (Sidebar/Tabs) | [08-navigation-spec.md](./08-navigation-spec.md) | ★★★★★ | 页面导航骨架 |

### P1 - 重要应做（Phase 0 强烈建议）

提升用户体验的关键组件：

| # | 组件名 | 说明 | 使用场景 |
|---|--------|------|----------|
| 9 | **Select / Combobox** | 下拉选择器 | 级别过滤、模块选择、主题切换 |
| 10 | **Checkbox / Switch / Radio** | 选择控件 | 过滤开关、审批模式、设置选项 |
| 11 | **Toast / Alert Banner** | 通知提示 | 操作反馈、系统警告、错误提示 |
| 12 | **Skeleton / Loading** | 加载占位 | 首次加载、数据等待态 |
| 13 | **EmptyState** | 空状态 | 无数据时的引导页面 |
| 14 | **Accordion / CollapsiblePanel** | 可折叠面板 | 错误详情、操作预览、配置展开 |
| 15 | **Tabs / SegmentedControl** | 标签页切换 | 日志级别/模块筛选、待审批/已处理 |
| 16 | **ConfirmDialog** | 确认对话框（多级危险度） | 删除确认、高危操作二次确认 |

### P2 - 可延后（Phase 0 可用简化替代）

| # | 组件名 | 替代方案 | 延后原因 |
|---|--------|----------|----------|
| 17 | **DataTable（完整版）** | 简化 Table + 手动排序 | 排序/筛选逻辑复杂 |
| 18 | **TreeView** | 简化嵌套 List | 文件树交互复杂 |
| 19 | **DropdownMenu** | 简化 absolute 定位 div | 需要处理边界检测和 Portal |
| 20 | **Popover** | 简化 Tooltip 变体 | 类似 Tooltip 但更复杂 |
| 21 | **Drawer（侧滑面板）** | Modal 替代 | 动画和手势复杂 |
| 22 | **Avatar** | 首字母圆形 + 背景色 | 用户系统尚未建立 |
| 23 | **StepList / Stepper** | 简单数字列表 | Onboarding 流程后续 |
| 24 | **ProgressBar / ProgressRing** | HTML `<progress>` 或简单 div | 进度展示需求简单 |
| 25 | **Breadcrumb** | 简单文字链 + 分隔符 | 导航层级较浅 |

## 3. 各组件详细规格文档索引

| 组件 | 规格文档 | 状态 |
|------|----------|------|
| Button | [01-button-spec.md](./01-button-spec.md) | 待创建 |
| Input / Textarea | [02-input-spec.md](./02-input-spec.md) | 待创建 |
| Card | [03-card-spec.md](./03-card-spec.md) | 待创建 |
| Badge / Tag | [04-badge-tag-spec.md](./04-badge-tag-spec.md) | 待创建 |
| Modal / Dialog | [05-modal-dialog-spec.md](./05-modal-dialog-spec.md) | 待创建 |
| Tooltip | [06-tooltip-spec.md](./06-tooltip-spec.md) | ✅ 已完成 |
| Table / List | [07-table-list-spec.md](./07-table-list-spec.md) | 待创建 |
| Navigation | [08-navigation-spec.md](./08-navigation-spec.md) | 待创建 |

## 4. 组件通用规格约定

### 4.1 所有组件必须遵循的规则

| 规则 | 说明 |
|------|------|
| **令牌引用** | 所有颜色/间距/圆角等值必须使用 CSS 变量令牌，禁止硬编码 |
| **主题适配** | 每个组件必须验证在 5 种配色 × 2 种模式下的显示效果 |
| **状态完备** | 交互组件必须定义: default / hover / focus / active / disabled / loading 全部状态 |
| **尺寸变体** | 组件应提供 sm / md / lg 尺寸变体（如适用） |
| **无障碍** | 所有交互元素必须有 `aria-*` 属性和键盘支持 |
| **Reduced Motion** | 动画效果必须响应 `prefers-reduced-motion` |

### 4.2 组件 Props 通用接口

```typescript
interface BaseComponentProps {
  /** 自定义 CSS 类名 */
  className?: string;
  
  /** 内联样式（仅用于极少数无法通过令牌控制的场景） */
  style?: React.CSSProperties;
  
  /** 测试标识 */
  'data-testid'?: string;
  
  /** 无障碍标签（未从子元素推断时） */
  'aria-label'?: string;
}

interface InteractiveComponentProps extends BaseComponentProps {
  /** 是否禁用 */
  disabled?: boolean;
  
  /** 加载状态 */
  loading?: boolean;
  
  /** 点击回调 */
  onClick?: (event: React.MouseEvent) => void;
}
```

### 4.3 组件命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件文件名 | PascalCase | `Button.tsx`, `ModalDialog.tsx` |
| 组件导出名 | PascalCase | `export const Button` |
| Props 接口名 | 组件名 + `Props` | `ButtonProps`, `ModalDialogProps` |
| CSS 类名 | kebab-case + BEM | `.btn`, `.btn--primary`, `.btn__icon` |
| CSS 变量 | --component-property | `--btn-padding-x`, `--card-shadow` |

## 5. 组件依赖关系图

```
                    ┌─────────┐
                    │  Icon   │ ← 被几乎所有组件依赖
                    └────┬────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌─────────┐    ┌──────────┐    ┌─────────┐
    │  Button  │    │  Badge   │    │ Tooltip  │
    └────┬────┘    └────┬─────┘    └─────────┘
         │               │
         ▼               ▼
    ┌─────────┐    ┌──────────┐
    │  Input   │◄───│  Card    │
    └────┬────┘    └────┬─────┘
         │              │
         ▼              ▼
    ┌─────────┐    ┌──────────┐
    │  Select │    │   List   │
    └─────────┘    └────┬─────┘
                        │
         ┌──────────────┤
         ▼              ▼
    ┌──────────┐   ┌──────────┐
    │   Table  │   │  Modal   │
    └──────────┘   └────┬─────┘
                       │
         ┌──────────────┤
         ▼              ▼
    ┌──────────┐   ┌──────────┐
    │  Toast   │   │  Dialog  │
    └──────────┘   └──────────┘
```

## 6. 组件开发顺序建议

基于依赖关系和使用频率，推荐的开发顺序：

```
第一批（基础原子）:
  Icon → Button → Badge → Tooltip

第二批（表单基础）:
  Input → Textarea → Select → Checkbox/Switch/Radio

第三批（布局容器）:
  Card → List/Table → Navigation(Sidebar)

第四批（反馈覆盖）:
  Toast/Alert → Modal/Dialog → ConfirmDialog → EmptyState → Skeleton

第五批（复合增强）:
  Accordion → Tabs → ProgressBar → DropdownMenu(简化)
```
