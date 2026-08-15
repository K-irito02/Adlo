# 文件旭日图增强设计

**日期**：2026-08-02
**主题**：变更面板 Git 可视化中"文件旭日图"的 Bug 修复与功能增强
**方案**：方案 A —— 复用 `ModuleBreadcrumb` + 增强共享图表组件

---

## 一、背景与问题

用户反馈"变更面板 → Git 可视化按钮 → 文件旭日图"存在 4 个问题：

1. **图表为空**：可视化区域不显示任何扇形
2. **缺少面包屑**：下钻时无路径导航（贡献者模块热力图已有面包屑）
3. **扇形无名称**：扇形上不显示名称，且无悬停 tooltip
4. **缺少提示文字**：图表下方无"点击中心可缩放"提示，悬停时无路径反馈

参考实现：`references/bklit-ui/` 开源库中的 sunburst 图表设计。

---

## 二、根因分析

### 2.1 图表为空的根因（3 个叠加 Bug）

**Bug 1：`adaptSunburstData` 是空操作**

文件：`ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts:491-493`

```typescript
export function adaptSunburstData(tree: unknown): unknown {
  return tree;  // 直接返回，未解包 { tree } 包装
}
```

后端（Rust 与 Preview）返回 `GitVisFileSunburst` 包装对象 `{ tree: GitVisSunburstNode }`，而图表 `SunburstChart` 期望直接接收根 `SunburstNode`。适配器未解包 `.tree` 字段，导致 `treeData.children` 为 `undefined`，`countDescendants` 返回 0，`segments = []`。

**Bug 2：字段名不匹配 `size` vs `value`**

| 字段 | Rust/Preview 后端（`GitVisSunburstNode`） | 图表库（`SunburstNode`） |
|------|------------------------------------------|--------------------------|
| 节点值 | `size?: number` | `value?: number` |
| 节点类型 | `type: string` | （无） |
| 子节点 | `children?: GitVisSunburstNode[]` | `children?: SunburstNode[]` |
| 名称 | `name: string` | `name: string` ✓ |

`sunburst.ts` 的 `sumValues` 读取 `node.value`，但 Rust 数据只有 `size`，导致所有弧段角度跨度为 0。

**Bug 3：测试 fixture 与生产数据形状不一致**

文件：`ai-digital-life/frontend/src/test-fixtures/gitVisMockData.ts:405-446`

`fileTreemapData` 用 `value` 字段（匹配 `SunburstNode`），测试直接传 `fileTreemapData`（未包 `{ tree }`），同时绕过了 Bug 1 和 Bug 2。Mock 桥接用 `as unknown as` 强转掩盖了类型不匹配。

### 2.2 面包屑缺失根因

文件：`ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.tsx`

当前 `FileSunburst` 仅渲染 `<SunburstCenter />` + 扇形段数组，未渲染 `<SunburstBreadcrumb>`。

bklit-ui 的 `SunburstChart` 已支持将 `SunburstBreadcrumb` 子组件渲染到 SVG 外部上方（通过 `isOutsideSvgComponent` 判断），且 `useSunburstBreadcrumbItems()` hook 已提供面包屑数据。但项目端口版 `SunburstBreadcrumb` 只是空 wrapper，需配合 `ModuleBreadcrumb` 实现 UI。

### 2.3 扇形无名称 + 无 tooltip 根因

文件：`ai-digital-life/frontend/src/components/charts/sunburst-labels.tsx`

`SunburstLabels` 直接渲染 `arc.name`，无长度限制；`<text>` 元素 `pointerEvents: none`。

文件：`ai-digital-life/frontend/src/components/charts/sunburst-segment.tsx`

`SunburstSegment` 的 `<motion.g>` 内无 `<title>` 元素，无法触发原生 tooltip。

### 2.4 缺少提示文字根因

`FileSunburst` 未渲染 `<SunburstHint>`。bklit-ui 的 `SunburstHint` 已实现 3 态逻辑（悬停路径/根视图/已下钻），但项目端口版用硬编码英文。

---

## 三、设计方案

### 3.1 方案选择

**方案 A（采用）**：复用热力图的 `ModuleBreadcrumb` 组件，增强共享的 `SunburstLabels` 和 `SunburstSegment`。

**理由**：
- 用户明确要求"和热力图一样"，复用 `ModuleBreadcrumb` 最直接
- 增强共享组件符合 DRY 原则，当前无其他消费者风险
- 改动范围最小

### 3.2 数据流修复（对应问题 1）

#### 3.2.1 修复 `adaptSunburstData`

文件：`ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts`

将空操作改为：解包 `{ tree }` 包装 + 递归映射 `size → value` + 丢弃 `type` 字段。

```typescript
interface GitVisSunburstNodeInput {
  name: string;
  type?: string;
  size?: number;
  children?: GitVisSunburstNodeInput[];
}

export function adaptSunburstData(raw: unknown): SunburstNode {
  const wrapped = raw as { tree?: GitVisSunburstNodeInput } | GitVisSunburstNodeInput;
  const root = wrapped && typeof wrapped === 'object' && 'tree' in wrapped ? wrapped.tree : wrapped;
  if (!root || typeof root !== 'object') return { name: '', children: [] };

  const mapNode = (n: GitVisSunburstNodeInput): SunburstNode => {
    const out: SunburstNode = { name: n.name };
    if (n.size !== undefined) out.value = n.size;
    if (n.children?.length) out.children = n.children.map(mapNode);
    return out;
  };
  return mapNode(root);
}
```

**返回类型变更**：从 `unknown` 改为 `SunburstNode`，恢复类型安全。`FileSunburst.tsx` 中的 `as SunburstNode` 强转可移除。

#### 3.2.2 修复测试 fixture

文件：`ai-digital-life/frontend/src/test-fixtures/gitVisMockData.ts`

`fileTreemapData` 改用 `size` 字段（匹配 `GitVisSunburstNode`），添加 `type: "file"|"directory"`。

```typescript
export const fileTreemapData = {
  name: 'root',
  type: 'directory',
  children: [
    {
      name: 'src',
      type: 'directory',
      children: [
        { name: 'main.js', type: 'file', size: 120 },
        { name: 'utils.js', type: 'file', size: 80 },
      ],
    },
    { name: 'README.md', type: 'file', size: 50 },
  ],
};
```

#### 3.2.3 修复 Mock 桥接

文件：`ai-digital-life/frontend/src/mock/mock-workspace.ts:429-432`

去掉 `as unknown as` 强转，让 `fileTreemapData` 直接符合 `GitVisSunburstNode` 形状。

#### 3.2.4 修复测试用例

文件：`ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.test.tsx`

测试用例改为传入 `{ tree: fileTreemapData }` 包装，模拟真实数据流。

### 3.3 面包屑路径导航（对应问题 2）

#### 3.3.1 渲染 `SunburstBreadcrumb`

文件：`ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.tsx`

在 `SunburstChart` 的 children 中渲染 `SunburstBreadcrumb`，内部放 `ModuleBreadcrumb`：

```tsx
<SunburstChart data={treeData} size={320}>
  <SunburstBreadcrumb className="adl-file-sunburst-breadcrumb">
    <FileSunburstBreadcrumbContent />
  </SunburstBreadcrumb>
  <SunburstCenter />
  {segments}
  <SunburstHint>...</SunburstHint>
</SunburstChart>
```

#### 3.3.2 新增内部组件 `FileSunburstBreadcrumbContent`

同文件内定义：

- 调用 `useSunburstBreadcrumbItems()` 获取 `{ items, zoomTo }`
- 将 `items` 映射为 `pathSegments: string[]`（取 `label`，根节点 `items[0]` 用 i18n `t.gitVisModuleRoot` 替代 `data.name`）
- `onNavigate(level)` 适配：
  - `level === -1` → `zoomTo(items[0].id)`（回到根）
  - `level === i` → `zoomTo(items[i].id)`（截断到第 i 段）
- 仅当 `items.length > 1`（已下钻）时渲染面包屑；根视图时不渲染

```tsx
function FileSunburstBreadcrumbContent() {
  const { items, zoomTo } = useSunburstBreadcrumbItems();
  const { t } = useTCopy();

  if (items.length <= 1) return null;

  const pathSegments = items.map((it, i) =>
    i === 0 ? t.gitVisModuleRoot : it.label,
  );

  const handleNavigate = (level: number) => {
    const targetIndex = level === -1 ? 0 : level;
    const target = items[targetIndex];
    if (target) zoomTo(target.id);
  };

  return <ModuleBreadcrumb pathSegments={pathSegments} onNavigate={handleNavigate} />;
}
```

#### 3.3.3 受控 vs 非受控

`SunburstChart` 当前已是非受控模式（FileSunburst 未传 `focusId`），`zoomTo` 由图表内部管理，`useSunburstBreadcrumbItems()` 通过 context 读取当前 `focus`，无需额外 state 同步。

#### 3.3.4 CSS

复用 `module-breadcrumb.css`，外层加 `adl-file-sunburst-breadcrumb` 容器做边距适配。

### 3.4 扇形名称显示 + 截断 + 原生 tooltip（对应问题 3）

#### 3.4.1 增强 `SunburstSegment`（原生 tooltip 主方案）

文件：`ai-digital-life/frontend/src/components/charts/sunburst-segment.tsx`

在 `<motion.g>` 内、`<path>` 之前添加 `<title>{arc.name}</title>`。

**职责**：所有扇形（含过窄扇形）悬停时显示完整名称的原生 tooltip。`<title>` 不参与 pointer events，不影响 segment 交互。此为 tooltip 的唯一实现路径，覆盖所有扇形。

#### 3.4.2 增强 `SunburstLabels`（截断显示）

文件：`ai-digital-life/frontend/src/components/charts/sunburst-labels.tsx`

**新增工具函数 `fitLabel`**：基于当前扇形的可用弧长和字号，用 canvas measureText 计算文本宽度，超出时二分截断 + "…"。

```typescript
let measureCanvas: HTMLCanvasElement | null = null;
function measureText(text: string, fontSize: number): number {
  if (typeof document === 'undefined') return text.length * fontSize * 0.6;
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return text.length * fontSize * 0.6;
  ctx.font = `600 ${fontSize}px inherit`;
  return ctx.measureText(text).width;
}

function fitLabel(name: string, maxWidth: number, fontSize: number): string {
  if (measureText(name, fontSize) <= maxWidth) return name;
  let lo = 1, hi = name.length, result = '';
  const ellipsis = '…';
  while (lo <= hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = name.slice(0, mid) + ellipsis;
    if (measureText(candidate, fontSize) <= maxWidth) {
      result = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result || ellipsis;
}
```

**在 `arcs.map` 渲染逻辑中**：

- 计算可用宽度：`availableWidth = (g.a1 - g.a0) * r - 8`（留 8px 内边距）
- 调用 `fitLabel(arc.name, availableWidth, fontSize)` 得到显示文本
- **保留原有过滤逻辑**：`if (angleSpan * r < 26 || g.outerR - g.innerR < 16) return null`（过窄扇形不显示文字，仅靠 tooltip）
- `<text>` 的 `pointerEvents` 保持 `none`（避免拦截 segment 交互，tooltip 由 segment 的 `<title>` 承担）

```tsx
const availableWidth = Math.max(0, (g.a1 - g.a0) * r - 8);
const displayLabel = fitLabel(arc.name, availableWidth, fontSize);

// 渲染
<text ...>
  {displayLabel}
</text>
```

#### 3.4.3 职责分离

- **扇形 tooltip**：通过 `SunburstSegment` 的 `<motion.g>` 内 `<title>` 实现（覆盖所有扇形，含过窄扇形）
- **扇形文字**：通过 `SunburstLabels` 的 `fitLabel` 实现截断显示（`pointerEvents: none`，不承担 tooltip 职责）

两者职责正交：文字负责"可见时的快速识别"，tooltip 负责"完整名称的悬停查看"（含文字不可见的过窄扇形场景）。

### 3.5 底部提示文字（对应问题 4）

#### 3.5.1 渲染 `SunburstHint`

文件：`ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.tsx`

在 `SunburstChart` 的 children 中渲染 `SunburstHint`，用 render prop 注入 i18n 文本。

#### 3.5.2 新增内部组件 `FileSunburstHintText`

```tsx
function FileSunburstHintText({
  hoveredArc,
  focus,
}: {
  hoveredArc: ArcDatum | null;
  focus: Focus;
}) {
  const { t } = useTCopy();

  const text = (() => {
    if (hoveredArc) {
      return hoveredArc.trail.join('  ›  ');
    }
    if (focus.depth > 0) {
      return t.gitVisSunburstHintZoomOut;
    }
    return t.gitVisSunburstHintZoomIn;
  })();

  return (
    <div aria-live="polite" className="adl-file-sunburst-hint" style={{ minHeight: 20 }}>
      {text}
    </div>
  );
}
```

#### 3.5.3 3 态逻辑

| 状态 | 条件 | 显示文案 |
|------|------|---------|
| 悬停扇形 | `hoveredArc != null` | `hoveredArc.trail.join('  ›  ')`（面包屑式路径） |
| 已下钻 | `focus.depth > 0` | "点击中心可缩放" |
| 根视图 | `focus.depth === 0` 且无悬停 | "点击扇形可下钻" |

与 bklit-ui 原生 3 态逻辑一致。根视图提示"点击扇形可下钻"而非"点击中心可缩放"，因为根视图点击中心无反应，语义上不误导。

#### 3.5.4 CSS

新增样式（追加到 `ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css`）：

```css
.adl-file-sunburst-hint {
  text-align: center;
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: var(--space-2);
  line-height: 1.4;
  user-select: none;
}

.adl-file-sunburst-breadcrumb {
  padding: 4px 8px;
}
```

### 3.6 i18n key 新增

文件：`ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts` 和 `ai-digital-life/frontend/src/app/i18n/en-US/changes.ts`

各新增 2 个 key：

| Key | zh-CN | en-US |
|-----|-------|-------|
| `gitVisSunburstHintZoomIn` | 点击扇形可下钻 | Click a segment to zoom in |
| `gitVisSunburstHintZoomOut` | 点击中心可缩放 | Click the center to zoom out |

面包屑复用现有 `gitVisModuleRoot`（"根目录"）和 `gitVisBreadcrumbNav`（"模块路径导航"）。

---

## 四、数据流变更总览

### 4.1 修复前

```
后端返回: { tree: { name: "root", type: "directory", children: [{ name: "src", type: "directory", children: [{ name: "main.js", type: "file", size: 1 }] }] } }
  ↓
adaptSunburstData (空操作): 原样返回 { tree: ... }
  ↓
FileSunburst: treeData = { tree: ... } as SunburstNode
  ↓
countDescendants: treeData.children === undefined → 0
  ↓
segments = []  ← 图表为空
```

### 4.2 修复后

```
后端返回: { tree: { name: "root", type: "directory", children: [...] } }
  ↓
adaptSunburstData (解包 + 映射): { name: "root", children: [{ name: "src", children: [{ name: "main.js", value: 1 }] }] }
  ↓
FileSunburst: treeData = SunburstNode (类型安全)
  ↓
countDescendants: treeData.children.length > 0 → N
  ↓
segments = N 个 SunburstSegment  ← 图表正常渲染
  ↓
buildArcs: sumValues 读取 node.value → 角度跨度非零
  ↓
SunburstLabels: fitLabel 截断显示
SunburstSegment: <title> 原生 tooltip
SunburstBreadcrumb + ModuleBreadcrumb: 面包屑导航
SunburstHint: 3 态提示文字
```

---

## 五、测试设计

### 5.1 测试范围

按 [mandatory-testing.md](../../../.trae/rules/mandatory-testing.md) 分级标准，属 **L3 全量级**（涉及共享组件 + IPC 数据契约）。

### 5.2 单元测试用例

#### 5.2.1 FileSunburst.test.tsx

| 用例 | 验证点 |
|------|--------|
| 解包 `{ tree }` 包装 | 传入 `{ tree: fileTreemapData }`，断言渲染出扇形段 |
| `size → value` 映射 | fixture 用 `size` 字段，断言扇形角度非零（图表非空） |
| 面包屑根视图不渲染 | focus 在根时，无 `adl-module-breadcrumb` 节点 |
| 面包屑下钻后渲染 | 模拟 segment click 后，出现面包屑且首项为"根目录" |
| 面包屑点击跳转 | 点击第 i 项，focus 回到对应层级 |
| hint 根视图文案 | 断言显示"点击扇形可下钻" |
| hint 下钻后文案 | 下钻后断言显示"点击中心可缩放" |
| hint 悬停路径 | 模拟 segment hover，断言显示 `trail.join(' › ')` |
| 过窄扇形无文字 | 构造极小 value 的叶子节点，断言无 `<text>` 但有 `<title>` |

#### 5.2.2 sunburst-labels.test.tsx（新增）

| 用例 | 验证点 |
|------|--------|
| 短名称不截断 | `arc.name = "src"`，断言文本为 "src" |
| 长名称截断 + "…" | `arc.name = "very-long-file-name.tsx"`，扇形窄，断言以 "…" 结尾且非完整名 |
| 过窄扇形不渲染文字 | `angleSpan * r < 26`，断言无 `<text>` 元素 |

#### 5.2.3 sunburst-segment.test.tsx（新增/更新）

| 用例 | 验证点 |
|------|--------|
| 含 `<title>` 子元素 | 断言 `<motion.g>` 内有 `<title>{arc.name}</title>` |

#### 5.2.4 chartDataAdapters.test.ts（新增/更新）

| 用例 | 验证点 |
|------|--------|
| 解包 `{ tree }` | 输入 `{ tree: { name: "r", children: [...] } }`，输出根节点 |
| 递归映射 `size → value` | 输入叶节点 `{ name, type: "file", size: 1 }`，输出 `{ name, value: 1 }` |
| 丢弃 `type` 字段 | 输出对象不含 `type` 属性 |
| 空数据兜底 | 输入 `null`/`undefined`/`{}`，返回 `{ name: '', children: [] }` |
| 无包装直接传根节点 | 输入 `{ name, children }`（无 `tree` 包装），正常处理 |

### 5.3 验收执行

```
步骤 1（并行）：
├── 前端：ESLint fix + Prettier + TypeScript typecheck
└── （无 Rust 变更）

步骤 2（并行）：
└── 前端测试：pnpm --dir frontend run test
    重点验证：
    - FileSunburst.test.tsx
    - sunburst-labels.test.tsx
    - sunburst-segment.test.tsx
    - chartDataAdapters.test.ts
    - 现有 GitVisualizationView.test.tsx（回归）
```

### 5.4 回归风险与缓解

| 风险 | 缓解 |
|------|------|
| `SunburstLabels` 改动影响其他消费者 | 当前无其他消费者；保留原有过滤逻辑 |
| `SunburstSegment` 添加 `<title>` 影响 hit testing | `<title>` 不参与 pointer events，无影响 |
| Mock fixture 改字段破坏其他测试 | 全局搜索 `fileTreemapData` 引用，同步更新 |
| i18n key 缺失导致渲染崩溃 | useTCopy 的 key 缺失有 fallback 机制；测试覆盖 |

---

## 六、不做的事

- **不**改动 `SunburstChart` 核心几何/动画逻辑
- **不**改动 `SunburstContext`（context 值已足够）
- **不**改动 Rust 后端（数据结构正确）
- **不**改动 Preview 服务端 handler
- **不**新增 Zustand store 状态（面包屑状态由图表内部 context 管理）
- **不**改动热力图的 `ModuleBreadcrumb` 组件本身（直接复用）

---

## 七、影响文件清单

### 7.1 核心修改

| 文件 | 修改内容 |
|------|---------|
| `ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts` | 重写 `adaptSunburstData`，返回类型改为 `SunburstNode` |
| `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.tsx` | 渲染面包屑、hint；新增 `FileSunburstBreadcrumbContent`、`FileSunburstHintText` 内部组件 |
| `ai-digital-life/frontend/src/components/charts/sunburst-labels.tsx` | 新增 `fitLabel` 工具函数；应用截断显示 |
| `ai-digital-life/frontend/src/components/charts/sunburst-segment.tsx` | `<motion.g>` 内添加 `<title>` |

### 7.2 测试修改

| 文件 | 修改内容 |
|------|---------|
| `ai-digital-life/frontend/src/test-fixtures/gitVisMockData.ts` | `fileTreemapData` 改用 `size` + `type` |
| `ai-digital-life/frontend/src/mock/mock-workspace.ts` | 去掉 `as unknown as` 强转 |
| `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.test.tsx` | 测试用例改传 `{ tree: ... }`；新增面包屑/hint 用例 |
| `ai-digital-life/frontend/src/components/charts/sunburst-labels.test.tsx` | 新增（若不存在） |
| `ai-digital-life/frontend/src/components/charts/sunburst-segment.test.tsx` | 新增/更新 `<title>` 用例 |
| `ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.test.ts` | 新增适配器测试（若不存在） |

### 7.3 i18n 修改

| 文件 | 修改内容 |
|------|---------|
| `ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts` | 新增 2 个 key |
| `ai-digital-life/frontend/src/app/i18n/en-US/changes.ts` | 新增 2 个 key |

### 7.4 样式修改

| 文件 | 修改内容 |
|------|---------|
| `ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css` | 新增 `.adl-file-sunburst-hint`、`.adl-file-sunburst-breadcrumb` |

---

## 八、参考

- bklit-ui sunburst 源码：`references/bklit-ui/packages/ui/src/charts/sunburst-*.tsx`
- 项目端口版：`ai-digital-life/frontend/src/components/charts/sunburst-*.tsx`
- 热力图面包屑：`ai-digital-life/frontend/src/app/features/git-visualization/ModuleBreadcrumb.tsx`
- 热力图实现参考：`ai-digital-life/frontend/src/app/features/git-visualization/charts/ContributorModuleHeatmap.tsx`
- 数据契约：`ai-digital-life/frontend/src/shared/ipc/workspace.ts`、`ai-digital-life/crates/types/src/types/git_visualization.rs`
