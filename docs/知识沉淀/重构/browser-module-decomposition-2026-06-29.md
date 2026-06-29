# 浏览器模块组件分解 — 经验教训

> 日期: 2026-06-29
> 关联: subagent-driven-development — 7 任务执行

## 本次重构涉及的变化

- **BrowserPanel** (716→~650 行)：提取 `BrowserPanelDialogs`（5 个对话框组件合并）
- **BrowserNavigator** (495→~120 行)：提取 4 个导航模式子组件（OpenMode / TabsMode / ListMode / SearchMode）
- **53 个文件**：`../../` 深层相对导入 → `@` 路径别名
- **React.lazy 恢复**: App.tsx 中 RightPanel 改为懒加载

## 经验教训

### 1. 组件提取中的 Props 接口设计

**问题**：BrowserNavTabsMode 有 30+ props（全部是回调函数和配置数据），直接列出在 props 接口中会导致调用点非常冗长。

**解决方案**：对于同质化的回调组，使用 `Omit<BaseProps, 'excluded'>` 从已有接口派生（BrowserNavListMode 的 props 从 BrowserNavTabsModeProps 派生），避免重复定义。

### 2. 路径别名一次性替换 > 逐步替换

**问题**：分批替换深层导入时，上游文件的替换会导致下游文件在中间状态时类型检查失败。

**解决方案**：一次性替换所有 53 个文件的 `../../` 导入，然后在替换完成后只运行一次类型检查。中间不提交、不验证。51 个文件一次通过类型检查。

### 3. React.lazy 的 Suspense 边界

**问题**：并非所有面板组件都在 App.tsx 中直接使用。RightPanel.tsx 内部已经为 8 个子面板（FilesPanel/ChangesPanel/BrowserPanel 等）使用了 lazy。App.tsx 中只需 lazy 化 RightPanel 即可。

**结论**：React.lazy 实施前需先确认完整组件树，避免重复 lazy 化已在子组件中 lazy 加载的模块。

### 4. 新别名需要同步更新两处

新增路径别名（`@icons`、`@i18n`、`@utils`、`@tauri-bridge`、`@regions`、`@hooks`、`@shared`）时，需要同时更新：
- `vite.config.ts` — `resolve.alias` 配置
- `tsconfig.json` — `compilerOptions.paths` 配置

缺少任一处都会导致类型检查或打包错误。