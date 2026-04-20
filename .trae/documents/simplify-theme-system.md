# 删除五种颜色方案，简化为深/浅两种主题

## 概述

当前项目实现了 **5种颜色方案 × 2种外观模式 = 10种主题组合**。用户要求删除颜色方案选择功能，只保留 **light（浅色）** 和 **dark（深色）** 两种主题。

## 影响范围

### 需要修改的代码文件

| 文件 | 修改内容 |
|------|----------|
| `apps/desktop/renderer/src/design-system/theme.ts` | 删除 ColorScheme 类型、常量、方法；简化 ThemeController |
| `apps/desktop/renderer/src/design-system/index.ts` | 删除 ColorScheme 相关导出 |
| `apps/desktop/renderer/src/styles/themes.css` | 删除 scheme-1/3/4/5 的 CSS；移除 data-color-scheme 选择器 |
| `apps/desktop/renderer/index.html` | 删除 data-color-scheme 属性 |
| `apps/desktop/renderer/src/app/App.tsx` | 删除颜色方案选择 UI 和相关状态 |

### 需要修改的本地化文件

| 文件 | 修改内容 |
|------|----------|
| `apps/desktop/renderer/src/locales/zh-CN.ts` | 删除颜色方案相关文案 |
| `apps/desktop/renderer/src/locales/en-US.ts` | 删除颜色方案相关文案 |
| `apps/desktop/renderer/src/app/copy.ts` | 删除 colorScheme 文案（如有） |

### 需要修改的测试文件

| 文件 | 修改内容 |
|------|----------|
| `tests/unit/design-system/theme.test.ts` | 删除颜色方案相关测试；更新现有测试 |

### 需要修改的文档文件

| 文件 | 修改内容 |
|------|----------|
| `docs/design-system/themes.md` | 更新为只支持 light/dark 两种主题 |
| `docs/architecture/theming.md` | 删除颜色方案相关架构说明 |

## 详细实施步骤

### 步骤 1：修改主题控制器核心代码

**文件**: `apps/desktop/renderer/src/design-system/theme.ts`

删除内容：
- `ColorScheme` 类型定义
- `COLOR_SCHEMES` 常量
- `ColorSchemeMeta` 接口
- `COLOR_SCHEME_META` 常量
- `STORAGE_KEY` 常量（用于存储颜色方案）
- `isColorScheme()` 函数
- `ThemeControllerOptions.defaultColorScheme` 选项
- `ThemeState.colorScheme` 属性
- `ThemeController.currentColorScheme` 私有属性
- `ThemeController.setColorScheme()` 方法
- `ThemeController.readStoredColorScheme()` 私有方法
- `ThemeController.persistColorScheme()` 私有方法
- `ThemeController.applyToRoot()` 中设置 `data-color-scheme` 的代码

保留内容：
- `ThemeMode` 类型（light/dark/system）
- `ResolvedTheme` 类型（light/dark）
- `isThemeMode()` 函数
- `resolveThemeMode()` 函数
- `ThemeController` 类的核心功能（仅管理 light/dark/system）

### 步骤 2：更新设计系统导出

**文件**: `apps/desktop/renderer/src/design-system/index.ts`

删除导出：
- `COLOR_SCHEMES`
- `COLOR_SCHEME_META`
- `isColorScheme`
- `ColorScheme`
- `ColorSchemeMeta`

### 步骤 3：简化 CSS 主题文件

**文件**: `apps/desktop/renderer/src/styles/themes.css`

修改内容：
1. 删除 scheme-1, scheme-3, scheme-4, scheme-5 的所有 CSS 规则块
2. 将 scheme-2 的 light/dark 规则改为直接使用 `[data-theme="light"]` 和 `[data-theme="dark"]` 选择器
3. 删除向后兼容的 `:not([data-color-scheme])` 选择器
4. 更新文件头部注释

### 步骤 4：更新 HTML 模板

**文件**: `apps/desktop/renderer/index.html`

修改：
```html
<!-- 修改前 -->
<html lang="zh-CN" data-color-scheme="scheme-2" data-theme="light">

<!-- 修改后 -->
<html lang="zh-CN" data-theme="light">
```

### 步骤 5：删除 App 中的颜色方案选择 UI

**文件**: `apps/desktop/renderer/src/app/App.tsx`

删除内容：
1. 导入语句中的 `COLOR_SCHEME_META` 和 `ColorScheme`
2. `colorScheme` 状态变量
3. `handleColorSchemePick` 函数
4. `themeController.subscribe` 中更新 `colorScheme` 的逻辑
5. 标题栏中的颜色方案选择按钮组（`.color-scheme` 元素）

### 步骤 6：更新本地化文件

**文件**: `apps/desktop/renderer/src/locales/zh-CN.ts`

删除：
- `colorScheme`
- `colorSchemeOpenLabel`
- `colorScheme1` 到 `colorScheme5`
- `themePickerHelp`
- `designSystemReady`（或更新为 "已加载设计系统：浅色/深色两种主题。"）

**文件**: `apps/desktop/renderer/src/locales/en-US.ts`

删除相同字段。

### 步骤 7：更新测试文件

**文件**: `tests/unit/design-system/theme.test.ts`

修改内容：
1. 删除 `isColorScheme` 相关测试
2. 删除 `COLOR_SCHEMES` 相关测试
3. 删除 `setColorScheme` 相关测试
4. 删除 `readStoredColorScheme` 相关测试
5. 更新 `hydrate` 测试，移除 `data-color-scheme` 断言
6. 保留 `isThemeMode`、`resolveThemeMode`、`setTheme`、`dispose` 等测试

### 步骤 8：更新文档

**文件**: `docs/design-system/themes.md`

修改内容：
1. 更新标题和描述，说明只支持 light/dark 两种主题
2. 删除 Color schemes 表格
3. 更新 DOM contract，移除 `data-color-scheme` 说明
4. 更新 ThemeController API 示例，移除 `setColorScheme` 方法
5. 保留 Semantic tokens 和 Contrast targets 部分

**文件**: `docs/architecture/theming.md`

修改内容：
1. 删除 Renderer 拥有 color scheme 偏好的说明
2. 删除 Color schemes 表格
3. 更新 DOM contract，移除 `data-color-scheme` 说明
4. 简化 Ownership 部分

## 验证清单

- [ ] 运行 `npm run typecheck` 确保无类型错误
- [ ] 运行 `npm test` 确保所有测试通过
- [ ] 运行 `npm run dev` 验证应用正常启动
- [ ] 验证浅色主题正确显示
- [ ] 验证深色主题正确显示
- [ ] 验证系统主题跟随功能正常
- [ ] 验证主题切换 UI 正常工作

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| localStorage 中存在旧的颜色方案值 | 低 | 不影响新系统，忽略即可 |
| 用户习惯了特定颜色方案 | 中 | 保留 scheme-2 作为默认配色，视觉变化最小 |
| 文档不同步 | 低 | 同步更新所有相关文档 |
