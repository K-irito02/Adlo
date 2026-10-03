# Refactoring / Store & UI

Zustand Store 迁移、切片职责划分与 UI/主题恢复的经验教训。

## 文件

| 文件 | 说明 |
|------|------|
| [styling-restoration-2026-05-27.md](./styling-restoration-2026-05-27.md) | 文件树与文档大纲样式优化（CSS 类名隔离、双端一致） |
| [theme-unified-management-2026-06-30.md](./theme-unified-management-2026-06-30.md) | Theme 统一管理重构（ThemeController 作为唯一真实来源） |
| [ui-restoration.md](./ui-restoration.md) | Changes 面板 UI 恢复（状态筛选、统计徽章）+ 文档大纲样式恢复 |
| [ui-slice-navigator-refactor-2026-06-08.md](./ui-slice-navigator-refactor-2026-06-08.md) | Navigator 方法从 browserSlice 移动到 uiSlice 的职责重构 |
| [ui-store-migration-2026-06-07.md](./ui-store-migration-2026-06-07.md) | UI Store 迁移与代码重构（消除 ui-store/uiSlice 重复状态管理） |
