---
description: Domain-split SVG icon organization with make factory family and barrel exports
globs: adlo/frontend/src/app/icons/**
alwaysApply: false
---

## SVG 图标领域拆分组织模式

### 规则描述

所有 SVG 图标按领域功能拆分为独立的文件模块，并通过统一的工厂函数家族创建（`make()` / `makeThin()` / `makeFilled()` / `makeFilledStroked()`）。每个图标文件负责一个语义类别，所有图标通过 `index.ts` 桶导出。

### 文件结构

```
app/icons/
├── helper.tsx    # 基础类型（IconProps、IconSize、IconComponent）和 make() 工厂函数
├── core.tsx      # 28 个基础 UI 图标（chevrons、arrows、panel 控制等）
├── file.tsx      # 20 个文件类型图标（folder、file 变体）
├── badges.tsx    # 19 个文件徽章图标（语言类型 badge）
├── actions.tsx   # 29 个操作图标（plus、copy、edit、delete、search 等）
├── status.tsx    # 47 个状态图标（check、alert、loading、theme、branch 等）
└── index.ts      # 桶导出，按文件模块分组
```

### 正确示例

```typescript
// helper.tsx — 定义基础和工厂
export type IconSize = 12 | 14 | 16 | 18 | 20 | 24 | 28 | 32 | 48;
export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'children'> {
  size?: IconSize;
  title?: string;
  decorative?: boolean;
}
export type IconComponent = (props: IconProps) => React.JSX.Element;

// 统一的 SVG 属性工厂
function iconProps(size: IconSize, rest: IconProps): React.SVGProps<SVGSVGElement> {
  return { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, ... };
}

// 图标工厂函数
export const make = (path: React.ReactNode): IconComponent =>
  function IconFn({ size = 16, ...rest }: IconProps) {
    return <svg {...iconProps(size, rest)}>{path}</svg>;
  };

// 在领域文件中使用
export const IconPlus = make(<path d="M12 5v14" /><path d="M5 12h14" />);
```

### 错误示例

```typescript
// ❌ 错误：所有图标放在一个文件中
// icons/all.tsx — 143+ 个图标，文件巨大

// ❌ 错误：不使用 make() 工厂，每个组件重复编写 SVG 属性
function IconPlus({ size }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} ...>...</svg>;
}
function IconMinus({ size }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} ...>...</svg>;
}

// ❌ 错误：不导出到 index.ts barrel，消费方直接引用内部文件
import { IconPlus } from '@icons/actions';  // 应通过 @icons/index.ts 导入
```

### 适用场景

所有 SVG 图标组件。新增图标时：

1. 确定图标语义类别（core/file/badges/actions/status）
2. 在对应文件使用匹配的工厂创建图标（描边 `make()` / 细描边 `makeThin()` / 填充 `makeFilled()` / 填充+描边 `makeFilledStroked()`，后者用于大 viewBox 线框风格路径的小尺寸加粗）
3. 在 `index.ts` 中添加导出
4. 消费方统一从 `@icons/index.ts` 导入

### 优势

- 143+ 个图标按领域拆分，单个文件不超过 50 个图标
- `make()` 工厂确保所有图标使用一致的 SVG 属性（viewBox、stroke 等）
- 内置无障碍支持（`IconProps` 中的 `title`/`decorative` 属性）
- 类型安全：`IconSize` 限制为 12/14/16/18/20/24/28/32/48