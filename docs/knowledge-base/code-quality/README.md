# Code Quality Knowledge

代码质量检测、修复与工具链改进经验，按子主题归类维护（不按时间归档）。

## 综合参考（根目录）

| 文件 | 说明 |
|------|------|
| [code-quality-detection-and-fix.md](./code-quality-detection-and-fix.md) | 全仓库代码质量检测与修复执行 7 条经验（React 19 hooks、React.memo、CodeMirror 重建等） |
| [syntax-highlighting-fix-2026-06-05.md](./syntax-highlighting-fix-2026-06-05.md) | 变更面板语法高亮修复（CodeMirror Facet 多实例、pnpm 传递依赖、Vite 预构建缓存） |
| [file-tree-scrollbar-and-test-sync-fix-2026-06-07.md](./file-tree-scrollbar-and-test-sync-fix-2026-06-07.md) | 文件树滚动条与测试同步修复 |
| [icon-family-unification-two-registry-sync-2026-08-02.md](./icon-family-unification-two-registry-sync-2026-08-02.md) | 图标家族几何统一与双图标系统同步（共享图标修改是全应用级变更） |
| [mock-bridge-data-safety-demo-2026-08-08.md](./mock-bridge-data-safety-demo-2026-08-08.md) | Mock Bridge 数据安全与流式模拟正确性（订阅透传、写操作拦截、单一消息源） |
| [review-snapshot-and-shape-pitfalls-2026-09-28.md](./review-snapshot-and-shape-pitfalls-2026-09-28.md) | 收尾审查快照必须含工作区（`git diff <base>` 而非 `A..B`）、ref 快照禁简写字段名（先跑 tsc）、删代码前核对 live 源码 |
| [i18n-mock-assertion-and-floating-promise-pitfalls-2026-09-29.md](./i18n-mock-assertion-and-floating-promise-pitfalls-2026-09-29.md) | i18n mock 键名断言恒过陷阱（查渲染文本+注释回退依赖）、`void` async 入口 rejection 归属（catch 关框+回归测试先红后绿） |
| [vitest-dynamic-import-mock-flake-2026-10-11.md](./vitest-dynamic-import-mock-flake-2026-10-11.md) | 同一文件多次动态 import 时 vi.mock 偶发失效（堆栈定位真实模块求值）+ 条件挂载 canvas 首屏竞态（单例加载器 + 绘制 effect 补画） |

## 子主题

### [diff-viewer/](./diff-viewer/)

变更/差异查看器（Diff Viewer）修复经验。

| 文件 | 说明 |
|------|------|
| [diff-viewer-theme-fix-2026-06-06.md](./diff-viewer/diff-viewer-theme-fix-2026-06-06.md) | 差异查看器主题修复（CSS 选择器覆盖不足、内容/行号区层级）+ 无变更行自动折叠 |
| [diff-viewer-fold-gutter-fix-2026-06-07.md](./diff-viewer/diff-viewer-fold-gutter-fix-2026-06-07.md) | 差异查看器折叠 gutter 修复 |
| [diff-viewer-empty-line-hover-scroll-fix-2026-06-13.md](./diff-viewer/diff-viewer-empty-line-hover-scroll-fix-2026-06-13.md) | 空行悬停背景 + 快速滚动闪烁修复（CSS :has 陷阱、MergeView compartment） |
| [diff-viewer-gutter-hover-fix.md](./diff-viewer/diff-viewer-gutter-hover-fix.md) | Gutter 悬停/点击高亮汇编：overlay 同步方案（06-06）+ A/B 侧 DOM 类归属根因修复（06-08） |

### [git-vis-charts/](./git-vis-charts/)

Git 可视化图表、热力图、echarts/visx 迁移、ChartBrush。

| 文件 | 说明 |
|------|------|
| [echarts-visx-migration-2026-07-15.md](./git-vis-charts/echarts-visx-migration-2026-07-15.md) | ECharts→visx 迁移 8 条经验（增量替换、类型声明、子包粒度、热力图、旭日图） |
| [heatmap-chart-generalization-2026-07-16.md](./git-vis-charts/heatmap-chart-generalization-2026-07-16.md) | HeatmapChart 泛化 5 条经验（Tooltip 单复数、visibleData 派生列、tickEvery 密度控制） |
| [2026-07-22-chart-color-preset-system.md](./git-vis-charts/2026-07-22-chart-color-preset-system.md) | 图表颜色预设系统 |
| [git-vis-time-range-store-init-missing-2026-07-24.md](./git-vis-charts/git-vis-time-range-store-init-missing-2026-07-24.md) | Git 可视化时间范围 store 初始化缺失修复 |
| [git-vis-time-range-tooltip-fixes-2026-07-26.md](./git-vis-charts/git-vis-time-range-tooltip-fixes-2026-07-26.md) | Git 可视化时间范围 tooltip 修复 |
| [heatmap-x-axis-label-fixes-2026-07-27.md](./git-vis-charts/heatmap-x-axis-label-fixes-2026-07-27.md) | 热力图 X 轴标签修复 |
| [bklit-ui-component-port-and-cache-key-bump-2026-07-31.md](./git-vis-charts/bklit-ui-component-port-and-cache-key-bump-2026-07-31.md) | bklit-ui 组件移植与缓存 key 提升 |
| [chart-brush-portal-overlay-2026-08-02.md](./git-vis-charts/chart-brush-portal-overlay-2026-08-02.md) | ChartBrush 门户 Overlay 与 CSS 级联陷阱（backdrop-filter 不可靠、createPortal、jsdom 无 PointerEvent） |
| [bklit-ui-loading-skeleton-var-y-domain-2026-08-04.md](./git-vis-charts/bklit-ui-loading-skeleton-var-y-domain-2026-08-04.md) | bklit-ui 加载骨架与 CSS 变量作用域 |
| [git-vis-cache-guard-review-loop-lessons-2026-10-13.md](./git-vis-charts/git-vis-cache-guard-review-loop-lessons-2026-10-13.md) | Git 可视化缓存守卫/失效四轮收尾审查 7 条教训（refresh 门控锚原始测量值、React.memo 零 props rerender 跳过、store mock 缺 getState 静默生效、mock 图表数据 null 而非 `{}`、工作区级失效标记的清除粒度、overflow-hidden 裁掉 absolute 子卡、修复本身须同等审查） |

### [toolchain-lint/](./toolchain-lint/)

ESLint/Prettier/Clippy/rustfmt 门禁、工具链环境。

| 文件 | 说明 |
|------|------|
| [eslint-prettier-ts-cleanup-2026-06-04.md](./toolchain-lint/eslint-prettier-ts-cleanup-2026-06-04.md) | 四维门禁清零 6 条经验（_param 解构陷阱、any→具体类型级联、组件拆分） |
| [eslint-prettier-clippy-rustfmt-config-and-bugfix-2026-06-11.md](./toolchain-lint/eslint-prettier-clippy-rustfmt-config-and-bugfix-2026-06-11.md) | 四维门禁全量修复 6 条经验（CSS 删除前 grep、rustfmt nightly 陷阱、flat config ignores） |
| [tech-stack-optimization-2026-06-09.md](./toolchain-lint/tech-stack-optimization-2026-06-09.md) | 技术栈优化 9 条经验（ts-rs 类型冲突、tokio 特性精简、highlight.js 按需） |
| [windows-verbatim-path-prefix-2026-06-30.md](./toolchain-lint/windows-verbatim-path-prefix-2026-06-30.md) | Windows 逐字路径前缀修复经验 |
| [rustc-toolchain-rmeta-recovery-2026-07-18.md](./toolchain-lint/rustc-toolchain-rmeta-recovery-2026-07-18.md) | rustc 工具链 rmeta 恢复经验 |

### [opencode-phase2-audit/](./opencode-phase2-audit/)

参考实现功能对照、Phase 2 审计与缺陷修复。

| 文件 | 说明 |
|------|------|
| [opencode-feature-integration-2026-07-06.md](./opencode-phase2-audit/opencode-feature-integration-2026-07-06.md) | 参考实现功能集成经验 |
| [opencode-feature-defects-2026-07-06.md](./opencode-phase2-audit/opencode-feature-defects-2026-07-06.md) | 参考实现对照 8 项实现缺陷修复（truncate_output、classify_profile、Snapshot 副本） |
| [phase2-audit-fixes-2026-07-06.md](./opencode-phase2-audit/phase2-audit-fixes-2026-07-06.md) | Phase 2 审计修复经验 |
| [phase2-defect-fix-2026-07-06.md](./opencode-phase2-audit/phase2-defect-fix-2026-07-06.md) | Phase 2 缺陷修复经验 |
| [opencode-audit-fix-2026-07.md](./opencode-phase2-audit/opencode-audit-fix-2026-07.md) | 参考实现功能审计 10 项缺陷修复（Compaction 阈值、Plugin hook 链式传播、MCP 自动重连） |
| [refactoring-insight-audit-fixes.md](./opencode-phase2-audit/refactoring-insight-audit-fixes.md) | 重构洞察审计修复经验 |

### [根目录](./)

CSS 守卫测试口径与工具链沉淀。

| 文件 | 说明 |
|------|------|
| [css-guard-test-helpers-2026-09-30.md](./css-guard-test-helpers-2026-09-30.md) | CSS 结构契约守卫三件套口径（findRuleGroups 注释感知 + 规则体剥注释 + 属性名词边界）与「先规整后截断」持久化教训；共享真源 `src/styles/testing/cssRules.ts` |
