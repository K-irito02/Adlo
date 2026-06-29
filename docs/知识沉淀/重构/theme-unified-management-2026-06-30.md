# Theme 统一管理重构 2026-06-30

## 背景

项目中存在两个主题"真实来源"：
- `ThemeController`（`design-system/theme.ts`）— 通过 `window.matchMedia` 正确解析 `system` 模式
- `appInfo.config.resolvedTheme`（来自 Rust 后端 `build_app_info`）— 对 `System` 模式硬编码为 `Light`

消费者（`FilesPanel`、`DiffEditorSection`、`PatchReviewSection`）读取 `appInfo.config.resolvedTheme`，在系统深色 + System 模式下显示浅色主题。

## 架构变更

### 变更前

```
Rust build_app_info (ThemeMode::System → Theme::Light ✗)
  → appInfo.config.resolvedTheme = 'light' (stale)
      ├─ FilesPanel         ✗ 使用 'light'
      ├─ DiffEditorSection  ✗ 使用 'light'
      └─ PatchReviewSection ✗ 使用 'light'
ThemeController → DOM data-theme = 'dark' ✅ (正确但未通知消费者)
```

### 变更后

```
ThemeController (唯一真实来源, matchMedia 解析)
  ├─ useResolvedTheme() hook (React 订阅)
  │     ├─ FilesPanel         ✅
  │     ├─ DiffEditorSection  ✅
  │     └─ PatchReviewSection ✅
  ├─ resolveCurrentTheme() 共享函数
  │     ├─ preferencesMerger  ✅ 替换内联 matchMedia
  │     ├─ generalActions     ✅ 替换内联 matchMedia + 简化 setTheme
  │     └─ useThemeSync       ✅ 只传 mode，不再解析
  └─ useBrowserThemeSync     ✅ 订阅 ThemeController (无变更)
```

## 新增模块

| 模块 | 路径 | 职责 |
|------|------|------|
| `resolveCurrentTheme(themeMode)` | `shared/resolveTheme.ts` | 包装 `resolveThemeMode` + `matchMedia`，纯函数 |
| `useResolvedTheme(): ResolvedTheme` | `app/hooks/useResolvedTheme.ts` | 订阅 ThemeController，返回当前解析主题 |

## 消除的重复

| 位置 | 之前 | 之后 |
|------|------|------|
| `preferencesMerger.ts` | 12 行内联 matchMedia | `resolveCurrentTheme()` 2 行 |
| `generalActions.ts` bootstrap | 6 行内联 matchMedia | `resolveCurrentTheme()` 1 行 |
| `generalActions.ts` updatePreferences | 6 行内联 + 显式 resolvedTheme | `setTheme({ mode })` + `resolveCurrentTheme()` |
| `useThemeSync.ts` | 6 行内联 + 显式 resolvedTheme | `setTheme({ mode })` 2 行 |

## 质量指标

- 6 个计划任务 + 1 个格式化提交，所有提交通过 ESLint + Prettier + tsc
- 46 个测试文件 / 282 个测试用例全部通过
- Clippy + rustfmt 无警告

## 经验教训

1. **双真实来源必然产生不一致** — `ThemeController` 始终正确（纯前端 matchMedia），`appInfo.config.resolvedTheme` 始终错误（Rust 无 matchMedia 能力）。架构上应确保只有一个来源。
2. **Hook 是连接纯 TS 单例与 React 组件的最佳桥梁** — `useResolvedTheme()` 通过 `subscribe` 机制将 `ThemeController` 的变更实时推送到 React 组件，无需经过 Zustand store。
3. **数据流的 Store 中间层需要校验** — 不清除 Rust 返回的错误值就存入 store，会让消费者读到脏数据。本次先在 `generalActions.ts` 做边界修复，最终用 hook 彻底绕过 store。
4. **Vitest MockInstance 类型在不同版本有差异** — `ReturnType<typeof vi.spyOn>` 可能因函数重载导致类型不兼容，推荐使用 `MockInstance<(query: string) => MediaQueryList>` 精确泛型。
