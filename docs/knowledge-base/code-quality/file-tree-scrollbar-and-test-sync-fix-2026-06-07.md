# 文件树滚动条问题和测试同步修复 - 2026-06-07

## 问题概述

本次修复解决了两个关键问题：
1. **文件树和变更面板缺少滚动条** - 当内容超出可视区域时，没有垂直滚动条显示
2. **测试文件与实际代码不同步** - `cmTheme.ts` 更新后测试未同步更新导致测试失败

## 问题根因分析

### 1. 文件树滚动条问题
- **根本原因**：`FileNavigatorShell` 和 `ChangesTreePanel` 中的文件树内容直接渲染在 `adl-tool-navigator` 容器内，没有用 `CustomScrollArea` 组件包装
- **对比**：`BrowserTabTree` 正确使用了 `CustomScrollArea` 来提供滚动功能，但文件树和变更树遗漏了
- **CSS 配置**：虽然 CSS 中定义了 `.adl-multitree-scroll` 等自定义滚动条样式，但由于没有正确的容器结构，样式没有生效

### 2. 测试同步问题
- **根本原因**：`cmTheme.ts` 代码更新（从硬编码 `var(--border-subtle)` 改为动态 `${c.gutterBorder}`）后，测试文件 `cmPreviewStyling.test.ts` 没有同步更新
- **Git 历史**：从 git 历史可以看出代码先于测试更新，导致测试失败

## 修复方案

### 修复 1：FileNavigatorShell 添加 CustomScrollArea

**文件**：[FileNavigatorShell.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/adlo/frontend/src/app/regions/right-panel/FileNavigatorShell.tsx)

**修改**：
1. 导入 `CustomScrollArea` 组件
2. 用 `CustomScrollArea` 包装 `MultiWorkspaceFileTree`

**关键代码**：
```typescript
import { CustomScrollArea } from '../../features/file-tree/CustomScrollArea';

// ...

{navigatorMode === 'tree' ? (
  visibleWorkspaces.length > 0 ? (
    <CustomScrollArea
      shellClassName="adl-multitree"
      scrollClassName="adl-multitree-scroll"
      scrollbarClassName="adl-multitree-scrollbar"
      thumbClassName="adl-multitree-scrollbar__thumb"
    >
      <MultiWorkspaceFileTree 
        {/* ... props ... */} 
      />
    </CustomScrollArea>
  ) : null
) : null}
```

### 修复 2：ChangesTreePanel 添加 CustomScrollArea

**文件**：[ChangesTreePanel.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/adlo/frontend/src/app/regions/right-panel/panels/ChangesTreePanel.tsx)

**修改**：
1. 导入 `CustomScrollArea` 组件
2. 用 `CustomScrollArea` 包装 `MultiWorkspaceChangesTree`

**关键代码**：
```typescript
import { CustomScrollArea } from '../../../features/file-tree/CustomScrollArea';

// ...

) : (
  <CustomScrollArea
    shellClassName="adl-multitree"
    scrollClassName="adl-multitree-scroll"
    scrollbarClassName="adl-multitree-scrollbar"
    thumbClassName="adl-multitree-scrollbar__thumb"
  >
    <MultiWorkspaceChangesTree 
      {/* ... props ... */} 
    />
  </CustomScrollArea>
)}
```

### 修复 3：测试文件同步更新

**文件**：[cmPreviewStyling.test.ts](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/adlo/frontend/src/app/regions/right-panel/cmPreviewStyling.test.ts#L57)

**修改**：
将测试断言从硬编码字符串改为匹配新的动态模板字符串。

**关键代码**：
```typescript
// 修复前
expect(cmThemeSource).toContain("borderRight: '1px solid var(--border-subtle)'");

// 修复后
expect(cmThemeSource).toContain("borderRight: `1px solid ${c.gutterBorder}`");
```

## 经验教训

### 1. 代码一致性检查
- 当多个组件共享相似的功能模式时（如滚动条），要确保所有实现都遵循相同的模式
- 在本次案例中，`BrowserTabTree` 是正确的实现参考，但其他树组件没有遵循这个模式

### 2. 测试同步的重要性
- **核心原则**：代码变更后必须同步更新相关测试
- 工具建议：在 git 中可以使用 `git status` 检查是否有相关测试文件未变更
- 最佳实践：修改代码的同时，立即检查并更新对应测试

### 3. 组件可复用性
- `CustomScrollArea` 是一个通用的可复用组件，应用于所有需要自定义滚动条的区域
- 在添加类似功能时，先检查是否已有可复用的组件

### 4. 测试维护策略
- 对于测试文件中硬编码的字符串匹配，要考虑代码重构时的维护成本
- 可以考虑更灵活的测试方式，如检查存在性而非精确字符串匹配

## 验证结果

- ✅ 文件树和变更面板现在有正确的垂直滚动条
- ✅ 所有 214 个测试全部通过
- ✅ 代码变更符合项目规范
- ✅ 双端（Tauri/浏览器模式）一致性得到保持

## 相关文件

- [FileNavigatorShell.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/adlo/frontend/src/app/regions/right-panel/FileNavigatorShell.tsx)
- [ChangesTreePanel.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/adlo/frontend/src/app/regions/right-panel/panels/ChangesTreePanel.tsx)
- [cmPreviewStyling.test.ts](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/adlo/frontend/src/app/regions/right-panel/cmPreviewStyling.test.ts)
- [CustomScrollArea.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/adlo/frontend/src/app/features/file-tree/CustomScrollArea.tsx)
