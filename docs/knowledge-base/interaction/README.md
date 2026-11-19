# Interaction Knowledge

跨功能面板的交互/UX 问题修复经验，按交互子主题归类维护（不按时间归档）。

## 综合参考（根目录）

| 文件 | 说明 |
|------|------|
| [rename-dialog-standardization-2026-06-08.md](./rename-dialog-standardization-2026-06-08.md) | 重命名弹窗交互标准化（直角按钮、✕ 关闭、i18n 标题简洁化） |
| [full-i18n-overhaul-2026-06-13.md](./full-i18n-overhaul-2026-06-13.md) | 全量国际化重构经验 |
| [sidebar-toggle-icon-state-switching-2026-06-28.md](./sidebar-toggle-icon-state-switching-2026-06-28.md) | 侧边栏切换图标状态切换修复 |
| [sub-card-border-subpixel-fix-2026-07-01.md](./sub-card-border-subpixel-fix-2026-07-01.md) | Sub-Card 边框子像素渲染修复（半像素卡高 + translateY 不对称抗锯齿） |
| [svg-stroke-animation-logo-overlay-2026-07-14.md](./svg-stroke-animation-logo-overlay-2026-07-14.md) | SVG 描边动画与 Logo Overlay 实现经验 |
| [refresh-button-animation-pattern-2026-07-23.md](./refresh-button-animation-pattern-2026-07-23.md) | 刷新按钮动画模式 |
| [relative-time-range-re-resolve-2026-08-03.md](./relative-time-range-re-resolve-2026-08-03.md) | 相对时间范围预设须按当前日期重解析（rolling 预设不得固化绝对日期） |
| [welcome-statusbar-path-layout-fix-2026-08-07.md](./welcome-statusbar-path-layout-fix-2026-08-07.md) | 最近工作区名称/路径布局修复（justify-self/overflow、minmax 比例、原生 title） |
| [clipboard-history-panel-rework-2026-09-17.md](./clipboard-history-panel-rework-2026-09-17.md) | 剪贴板历史面板重构（复制/粘贴/清空交互与状态） |
| [sysmon-scroll-restore-persistence-lessons-2026-09-17.md](./sysmon-scroll-restore-persistence-lessons-2026-09-17.md) | 左栏系统监控滚动恢复与持久化（回调 ref、落盘门控、去抖读实时节点） |
| [settings-debounce-race-fake-timers-false-pass-2026-09-23.md](./settings-debounce-race-fake-timers-false-pass-2026-09-23.md) | 设置页去抖竞态（ref 镜像早退约束）+ fake-timers 假绿陷阱（外部 setState 须包同步 act） |
| [settings-group-reset-debounce-race-2026-09-26.md](./settings-group-reset-debounce-race-2026-09-26.md) | 组级恢复与防抖草稿竞态双重防护（提交前 base 校验 + 外部变化 effect）+ 写穿 mock 复现法 |
| [confirm-dialog-pending-snapshot-refresh-2026-09-24.md](./confirm-dialog-pending-snapshot-refresh-2026-09-24.md) | 确认对话框三模式：pending 布尔信号（防首跳漏弹）、开框快照落盘（防后台改草稿分裂）、写成功回读失败哨兵可见 |
| [shortcut-review-lessons-2026-09-25.md](./shortcut-review-lessons-2026-09-25.md) | 快捷键/下载迁移复审经验：lookbehind 解析期风险、contenteditable 守卫、fail-open 未知态、测试覆盖表、显示串单测定平台 |
| [settings-panel-narrow-layout-and-dot-scrollbar-2026-09-27.md](./settings-panel-narrow-layout-and-dot-scrollbar-2026-09-27.md) | 设置面板窄布局：堆叠阈值核算（防并排死区）+ SWR 进场缓存 dirty 位 + 点态横条提取与 parity 锁 |
| [settings-cross-group-search-and-reset-all-2026-09-29.md](./settings-cross-group-search-and-reset-all-2026-09-29.md) | 设置面板跨组搜索与「恢复全部默认」：异步锚点跳转须有界重试（单帧必失败）、导航常显后所有切组入口须收搜索、模态焦点契约、复用同语文案须同复动作、判别联合勿塌缩为 null |
| [tooltip-webview-avoidance-2026-10-01.md](./tooltip-webview-avoidance-2026-10-01.md) | Tooltip 躲 WebView2（自己让路+横轴滑移）与过渡动画两处真 bug（挂载即 open 跳过出现、关闭清空定位致退出屏外空播） |
| [center-tab-terminal-toolbar-and-clip-pattern-2026-10-04.md](./center-tab-terminal-toolbar-and-clip-pattern-2026-10-04.md) | 中心标签条/终端工具栏：4 类 CSS 根因（作用域变量未定义、`:focus-within`、TooltipTrigger 包裹层 `min-width`、类名复用误伤）+ 可复用「卷帘门」裁剪/悬停遮挡与共享重命名 hook |
| [center-tab-strip-overflow-drag-2026-10-09.md](./center-tab-strip-overflow-drag-2026-10-09.md) | 中心标签条：grid 隐式列撑爆真根因（先锁内部后查外层）+ Pointer Events 拖拽排序模式（阈值/单写 store/offsetParent 锚点/mask 联动/mouse-only 门控） |
| [clipboard-viewer-lessons-2026-10-11.md](./clipboard-viewer-lessons-2026-10-11.md) | 剪贴板放大查看弹窗 37 项重构 6 条可复用经验（跨域下载失效走原生对话框、Tooltip 包裹层 grid、常驻 hidden 防闪、互斥编辑代际 guard、四端键 parity、Node/Rust 拒绝语义对齐） |
| [titlebar-overflow-affordances-2026-11-07.md](./titlebar-overflow-affordances-2026-11-07.md) | 标题栏拖拽车道与两端渐隐：sticky 覆盖层不能用 `scroll-padding` 让位（改层级）、z 顺序（渐隐 < 操作按钮 < “+” < 拖拽项）、隐藏瞬时防残影、选中底色不做颜色过渡、jsdom 伪造滚动指标测渐隐四态 |
| [editor-autosave-watcher-race-2026-11-08.md](./editor-autosave-watcher-race-2026-11-08.md) | 文件面板自动保存：watcher 自写回声误报冲突 + 保存旧响应覆盖新草稿；按文件串行/代际、内容指纹回声识别、读盘分类、草稿真相源与受控 value 不变量 |
| [splash-freeze-hook-null-param-2026-11-14.md](./splash-freeze-hook-null-param-2026-11-14.md) | 开屏定格钩子把「参数缺失」当成 0ms（`Number(null) === 0`）致动画冻结在首帧、窗口只剩底色；可选数字参数须区分缺失/空串/0，隐藏窗口冻结动画时钟的取证方法 |

## 子主题

### [github-panel/](./github-panel/)

GitHub CI 面板 UI、菜单、对话框、i18n。

| 文件 | 说明 |
|------|------|
| [github-menu-recursive-delete-and-grouping-2026-06-12.md](./github-panel/github-menu-recursive-delete-and-grouping-2026-06-12.md) | 面板菜单重构（递归删除、红白分组、分隔线、"!" 双通道） |
| [github-folder-pin-and-delete-2026-06-12.md](./github-panel/github-folder-pin-and-delete-2026-06-12.md) | 目录置顶、递归数据清除作用域修复、activeCiFolderId 跟踪 |
| [github-tree-sub-entry-ordering-and-i18n-2026-06-12.md](./github-panel/github-tree-sub-entry-ordering-and-i18n-2026-06-12.md) | 树子条目排序（紧贴父目录）+ 子条目名称国际化 |
| [github-delete-all-menu-and-hint-card-2026-06-13.md](./github-panel/github-delete-all-menu-and-hint-card-2026-06-13.md) | 删除全部菜单与提示卡片重构 |
| [github-settings-dialog-standardization-2026-06-13.md](./github-panel/github-settings-dialog-standardization-2026-06-13.md) | 设置对话框标准化 |
| [github-job-card-hover-and-status-dot-optimization-2026-06-14.md](./github-panel/github-job-card-hover-and-status-dot-optimization-2026-06-14.md) | Job 卡片悬停全宽延伸 + 状态点统一（z-index:-1 + 局部层叠上下文） |
| [github-log-viewer-toolbar-optimization-2026-06-14.md](./github-panel/github-log-viewer-toolbar-optimization-2026-06-14.md) | 日志查看器工具栏（自定义下拉、搜索框常驻、overflow 与下拉定位冲突） |
| [github-panel-i18n-full-coverage-2026-06-15.md](./github-panel/github-panel-i18n-full-coverage-2026-06-15.md) | GitHub 子面板 i18n 全覆盖（15 处硬编码清理、17 个翻译 key、标题行消失修复） |

### [terminal/](./terminal/)

终端面板交互（悬停菜单、xterm 滚动条、只读历史一致性）。

| 文件 | 说明 |
|------|------|
| [terminal-shell-menu-hover-lessons-2026-09-13.md](./terminal/terminal-shell-menu-hover-lessons-2026-09-13.md) | 复合按钮悬停菜单（子菜单卸载不触发 mouseleave）+ 去抖写污染水合测试 |
| [terminal-xterm-v6-scrollbar-copypaste-lessons-2026-09-13.md](./terminal/terminal-xterm-v6-scrollbar-copypaste-lessons-2026-09-13.md) | xterm v6 自绘滚动条覆盖法 + 原生事件复制粘贴 + flex 拖拽裁剪 |
| [terminal-history-live-parity-2026-09-15.md](./terminal/terminal-history-live-parity-2026-09-15.md) | 只读历史与实时终端一致性四处同口径（空格还原、Tango 调色板、出生几何、关闭落盘） |

### [search/](./search/)

检索（搜索）交互、加载态、设置弹窗。

| 文件 | 说明 |
|------|------|
| [search-paging-and-reveal-accuracy.md](./search/search-paging-and-reveal-accuracy.md) | 检索分页"提前 return"漏扫、CodeMirror 高度表估算 vs 渲染实测闭环、Windows 脚本写文件坑 |
| [search-freshness-hold-ready-reveal-lessons-2026-09-18.md](./search/search-freshness-hold-ready-reveal-lessons-2026-09-18.md) | 检索新鲜度、hold-ready-reveal 时序经验 |
| [search-loading-state-overlay-lessons-2026-09-19.md](./search/search-loading-state-overlay-lessons-2026-09-19.md) | 检索加载态时序与悬浮层（提交与加载同 tick、范围切换防抖泄漏） |
| [search-settings-dialog-lessons-2026-09-20.md](./search/search-settings-dialog-lessons-2026-09-20.md) | 检索设置弹窗（full-bleed 行类复用禁区、虚拟化 gap 陷阱、zustand 快照过期） |

### [git-vis/](./git-vis/)

Git 可视化（分支图、热力图、文件热点、loading）。

| 文件 | 说明 |
|------|------|
| [branch-graph-tag-drag-and-highlight-fix-2026-07-29.md](./git-vis/branch-graph-tag-drag-and-highlight-fix-2026-07-29.md) | 分支图标签拖拽与高亮修复 |
| [branch-graph-avatar-cache-and-flicker-fix-2026-07-30.md](./git-vis/branch-graph-avatar-cache-and-flicker-fix-2026-07-30.md) | 分支图头像缓存与闪烁修复 |
| [heatmap-scrollbar-oscillation-and-patterns-2026-07-25.md](./git-vis/heatmap-scrollbar-oscillation-and-patterns-2026-07-25.md) | 日历热力图 5 项 Bug 修复（scrollbar-gutter 振荡、时区解析、persisted writer 模式） |
| [git-vis-file-hotspots-leaderboard-2026-08-04.md](./git-vis/git-vis-file-hotspots-leaderboard-2026-08-04.md) | 文件热点排行榜（git numstat 转义、direction:rtl 禁用、虚拟滚动同步） |
| [git-vis-heatmap-loading-polish-2026-08-05.md](./git-vis/git-vis-heatmap-loading-polish-2026-08-05.md) | 热力图 loading 修复（React 批处理吞 loading、TOCTOU、loading 所有权分离） |

### [outline-file-tree/](./outline-file-tree/)

大纲树与文件树的连接线、导航、悬停。

| 文件 | 说明 |
|------|------|
| [outline-navigation-and-refresh-fix-2026-06-09.md](./outline-file-tree/outline-navigation-and-refresh-fix-2026-06-09.md) | 大纲导航折叠展开修复（uncollapseUnchanged 传参陷阱）+ 刷新按钮绕过懒加载守卫 |
| [outline-connecting-lines-alignment-fix-2026-06-11.md](./outline-file-tree/outline-connecting-lines-alignment-fix-2026-06-11.md) | 大纲树竖线对齐修复（递归树 ::before 无需缩进变量、死代码删除） |
| [file-tree-virtualized-connecting-lines-fix-2026-06-11.md](./outline-file-tree/file-tree-virtualized-connecting-lines-fix-2026-06-11.md) | 虚拟化文件树垂直连接线与悬停高亮修复（::before 溢出、JS 悬停传播） |

### [pointer-events/](./pointer-events/)

指针事件、命中区、拖拽、右键菜单、disabled 焦点。

| 文件 | 说明 |
|------|------|
| [right-click-menu-positioning-2026-06-08.md](./pointer-events/right-click-menu-positioning-2026-06-08.md) | 右键菜单跟随鼠标位置修复（4 条经验：定位方式、FileTree 机制复用、条件守卫） |
| [resize-handle-pointer-events-diversion-2026-06-23.md](./pointer-events/resize-handle-pointer-events-diversion-2026-06-23.md) | Resize Handle 与 Scrollbar 重叠：pointer-events 分流，::before 提供 3px 可拖拽边缘 |
| [disabled-button-pointerup-fix-2026-07-19.md](./pointer-events/disabled-button-pointerup-fix-2026-07-19.md) | disabled 按钮 pointerup 丢失修复 |
| [drag-overlay-pointer-event-penetration-2026-07-21.md](./pointer-events/drag-overlay-pointer-event-penetration-2026-07-21.md) | 拖拽覆盖层指针事件穿透修复 |
| [css-transform-hit-area-pointer-events-2026-08-03.md](./pointer-events/css-transform-hit-area-pointer-events-2026-08-03.md) | 旋转元素命中区跟随 transform，交互属性须下沉到旋转元素本身 |
| [tree-dnd-clipboard-source-2026-11-19.md](./pointer-events/tree-dnd-clipboard-source-2026-11-19.md) | 文件树拖拽副本几何、`copy-op` 菜单 id、同区粘贴失败保留剪贴板、吸顶行级 scroll-margin |

### [toast-hint-card/](./toast-hint-card/)

toast、错误提示、hint card 交互。

| 文件 | 说明 |
|------|------|
| [hint-card-arrow-positioning-fix-2026-06-11.md](./toast-hint-card/hint-card-arrow-positioning-fix-2026-06-11.md) | Hint Card 箭头定位 + 动态 DOM 内存泄漏 + 父级 hover 背景隔离 |
| [hint-card-dnd-fixes-2026-07-21.md](./toast-hint-card/hint-card-dnd-fixes-2026-07-21.md) | Hint Card 拖拽相关修复 |
| [toast-card-unification-hover-collapse-2026-08-16.md](./toast-hint-card/toast-card-unification-hover-collapse-2026-08-16.md) | toast 卡片统一 + 悬停折叠 |
| [error-toast-severity-scope-pop-layout-2026-08-12.md](./toast-hint-card/error-toast-severity-scope-pop-layout-2026-08-12.md) | 持久错误通知三级分级、模块作用域清除、popLayout 让位动画 |
| [toast-timer-callback-identity-2026-10-15.md](./toast-hint-card/toast-timer-callback-identity-2026-10-15.md) | Toast 计时器被内联回调身份抖动重置 → ref 解耦 |
