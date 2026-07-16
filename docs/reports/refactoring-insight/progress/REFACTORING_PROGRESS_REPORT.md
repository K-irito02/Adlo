# 重构进度报告

> 更新日期: 2026-07-08（第九十三轮）

## 完成状态

| 轮次 | 日期 | 内容 | 状态 |
|------|------|------|------|
| 第一轮 | 2026-05-20 | Zustand 切片定义（10 个切片） | ✅ |
| 第二轮 | 2026-05-21 | 切片合并 + 性能优化（Rust DRY、搜索 debounce 等） | ✅ |
| 第三轮 | 2026-05-21 | CSS Token 迁移 + 模块化分层 + 错误码统一 | ✅ |
| 第四轮 | 2026-05-21 | 重构洞察验证与修复（消除 11 处 `as any`、LRU 优化、SSE 管理等） | ✅ |
| 第五轮 | 2026-05-22 | CodeMirror 双实例 Bug 修复 | ✅ |
| 第六轮 | 2026-05-22 | Store/桥接/接口/性能/Rust 全面重构 | ✅ |
| **第七轮** | **2026-05-23** | **25 项全面修复 + 大型组件拆分（17 文件）** | ✅ |
| **第八轮** | **2026-05-23** | **重构洞察第二轮 26 项（渲染性能 + 模块化 + 架构治理 + Rust 改进）** | ✅ |
| **第九轮** | **2026-05-24** | **重构洞察执行 22 项（Rust 长文件拆分 + 前端重构 + 性能优化）** | ✅ |
| **第十轮** | **2026-05-24** | **重构洞察修复 11 项（Regex OnceLock + 死 CSS 清理 + 文件拆分）** | ✅ |
| **第十一轮** | **2026-05-25** | **ChangesPanel 组件提取（3 组件 → patch-review 模块）** | ✅ |
| **第十二轮** | **2026-05-25** | **4 个大型模块 → 12 个独立文件（ChangesPanel/CenterPane/StatusBar 拆分）** | ✅ |
| **第十三轮** | **2026-05-25** | **God Function 拆分 + UI 复原修复** | ✅ |
| **第十四轮** | **2026-05-26** | **终端工作区默认终端类型功能修复** | ✅ |
| **第十五轮** | **2026-05-26** | **终端层级树状视觉优化** | ✅ |
| **第十六轮** | **2026-05-26** | **终端面板精细化修复（10+ 项）** | ✅ |
| **第十七轮** | **2026-05-28** | **架构深度重构（Rust crate 17→19、Store 增强、5 个新 Hook、DB 连接池）** | ✅ |
| **第十八轮** | **2026-05-29** | **重构洞察全面修复（虚拟滚动、CenterPane 简化、RightPanel 优化）** | ✅ |
| **第十九轮** | **2026-05-30** | **terminal/pty crate 职责边界重构** | ✅ |
| **第二十轮** | **2026-05-31** | **代码清理、工具函数统一、缓存添加、性能优化** | ✅ |
| **第二十一轮** | **2026-05-31** | **浏览器子目录 parentId 传递断链修复** | ✅ |
| **第二十二轮** | **2026-06-01** | **文档大纲连接竖线对齐修复** | ✅ |
| **第二十三轮** | **2026-06-01** | **全面重构执行 + 滚动条溢出修复（11 项：死代码删除、i18n 拆分、类型解耦、as any 消除、icons 拆分、Mutex 降级、audit 批量写入、browser 错误通道、React.memo、滚动条修复）** | ✅ |
| **第二十四轮** | **2026-06-01** | **浏览器标签树功能增强 + 全面板计数对齐 + CSS 清理（硬编码 i18n 修复、重复回调抽取、历史按级别删除实现、RenameDialog 替换、计数右偏移统一标准化为 --space-3、CSS 重复块清理）** | ✅ |
| **第二十五轮** | **2026-06-01** | **重构洞察执行：消除重复、TTL 缓存优化、代码质量提升** | ✅ |
| **第二十六轮** | **2026-06-01** | **重构洞察全量执行：31/32 项落地** | ✅ |
| **第二十七轮** | **2026-06-02** | **浏览器标签树计数优化（计数语义修正 + 子目录计数右对齐 + URL 标签隐藏计数 + 长名省略号截断 + 抽出 resolveChildCount 纯函数）** | ✅ |
| **第二十八轮** | **2026-06-02** | **四位一体治理（openTabCount 语义错位 + 工作区删除级联清理 + 死状态清理 + i18n P0 硬编码）** | ✅ |
| **第二十九轮** | **2026-06-02** | **浏览器面板计数重叠修复 + 溢出裁切体系统一（:focus-within 子目录计数消失修复 + 子目录计数回退 flex 流 4px 偏差消除 + 顶级目录名称 overflow:hidden + 基类 text-overflow: ellipsis→clip 统一）** | ✅ |
| **第三十轮** | **2026-06-03** | **浏览器面板 WebView 可见性治理（面板切换隐藏/显示 + 跨面板状态保持 + 离屏坐标从负值改为正值 + 可见性 prop 化替代 Zustand selector + ResizeObserver 守卫）** | ✅ |
| **第三十一轮** | **2026-06-04** | **重构洞察 2026-06-03 执行（11 项：死代码删除、Promise.allSettled 修复、useShallow 纠偏、@deprecated 标注、localStorage 错误日志、CSS transition: all 修复、重复 CSS 清理、Rust 错误枚举扩展、依赖清理 15 条、JSON 损坏处理、重复构造提取）** | ✅ |
| **第三十二轮** | **2026-06-04** | **浏览器控制台报错修复（TS1261 大小写一致性 + React 19 iframe 跨源 $$typeof SecurityError 修复）** | ✅ |
| **第三十三轮** | **2026-06-04** | **全仓库代码质量治理 Phase 1-2（ESLint v9 React 19 hooks 规则 128 errors→0、clippy 8+ warnings→0、TypeScript 3 errors→0、cargo fmt 格式化）** | ✅ |
| **第三十四轮** | **2026-06-04** | **代码质量修复回滚（requestAnimationFrame 反模式移除、InlineDiffViewer 双重创建修复、DiffViewer React.memo 包装、handleSelectNavigatorNode 陈闭包修复）** | ✅ |
| **第三十五轮** | **2026-06-04** | **四维门禁清零收尾（ESLint 200+ warnings→0、TypeScript 16 errors→0、i18n 缺失 key 补充、prettier 格式化、`_param` 解构重命名修复、ComposerFooter 类型对齐、react-window rowComponent 类型校正）** | ✅ |
| **第三十六轮** | **2026-06-07** | **UI Store 迁移与代码重构（ui-store.ts 完全迁移到 uiSlice.ts、10 个组件更新、task.rs 大函数拆分、删除废弃代码、98 Rust 测试 + 214 前端测试全通过）** | ✅ |
| **第三十七轮** | **2026-06-08** | **Navigator 方法重构与警告清理（toggleNavigator/setNavigatorCollapsed 移动到 uiSlice、ESLint 警告全清理、保持向后兼容包装器）** | ✅ |
| **第三十八轮** | **2026-06-08** | **低风险修复（死代码删除、useShallow 补充、command→task 依赖倒置、store 订阅提取、anyhow 字符串匹配修复）** | ✅ |
| **第三十九轮** | **2026-06-08** | **核心重构（PTY Mutex 合并、3 个 mini crate 合并入 kernel、ChangesPanel 拆分 PatchReviewSection+DiffEditorSection、storage/lib.rs 拆 5 子模块、workspace/lib.rs 拆 detect+preview）** | ✅ |
| **第四十轮** | **2026-06-09** | **大纲导航折叠展开修复 + 刷新按钮绕过懒加载守卫 + Markdown 预览 DOM 导航死代码消除 + `collapseTo` 负值防护 + 知识沉淀更新 + 清理临时文件** | ✅ |
| **第四十一轮** | **2026-06-09** | **残余架构清理（删除死代码 TitleBar/StatusBar、切片耦合解耦、bridge 层级越界修复、React.memo 包装、Rust 上下文结构体提取）** | ✅ |
| **第四十二轮** | **2026-06-09** | **Clone 消除 + 命令层测试 + package.json 修复（deserialize_params std::mem::take、12 单元测试、@types 移至 devDependencies）** | ✅ |
| **第四十三轮** | **2026-06-09** | **CI 模块全量 bug 修复 15 项（Rust 分号/注释语法、workflow_id 过滤、日志二进制判断、前端 Token API、双端类型重复、useEffect 依赖、内存泄漏防护）+ 知识沉淀更新** | ✅ |
| **第四十四轮** | **2026-06-11** | **桥接层方法对齐 + 统一错误处理（listPendingApprovals 补全、reorder 参数类型统一、IpcResult<T> 返回类型一致性）** | ✅ |
| **第四十五轮** | **2026-06-11** | **文件树虚拟化渲染（useVirtualList hook + fileTree.tsx 扁平虚拟列表 + TreeNodeRow React.memo）** | ✅ |
| **第四十六轮** | **2026-06-11** | **虚拟列表测试环境降级（viewportHeight === 0 时渲染全部节点）** | ✅ |
| **第四十七轮** | **2026-06-11** | **状态订阅优化（右面板 useAppStore() → 选择器 + useShallow，CenterPane/ConversationPanel 选择器粒度细化）** | ✅ |
| **第四十八轮** | **2026-06-11** | **useBrowserPanel.ts 20+ 字段选择器 useShallow 化** | ✅ |
| **第四十九轮** | **2026-06-11** | **Zustand 选择器全量 useShallow 覆盖收尾** | ✅ |
| **第五十轮** | **2026-06-11** | **列表项 Hook 优化（6 个列表项组件 React.memo + useCallback 事件引用稳定化）** | ✅ |
| **第五十一轮** | **2026-06-11** | **IPC 契约文档注释（shared/ipc.ts 15 个接口、90+ 个方法 JSDoc）** | ✅ |
| **第五十二轮** | **2026-06-11** | **Store 跨切片依赖文档（stores/actions/ 11 个模块 @reads/@writes 注释）** | ✅ |
| **第五十三轮** | **2026-06-11** | **应用启动延迟加载（12 个重型组件 React.lazy + Suspense）** | ✅ |
| **第五十四轮** | **2026-06-11** | **浏览器面板渐进式拆分（BrowserToolbar.tsx + useBrowserNavigation.ts + useBrowserUrlState.ts）** | ✅ |
| **第五十五轮** | **2026-06-11** | **内存泄漏清理（Toast/FileCreationBar/MarkdownPreview setTimeout 清理 + hook 事件监听器清理）** | ✅ |
| **第五十六轮** | **2026-06-12** | **CSS 死代码清理（删除 10 个孤立 CSS 文件）+ @keyframes 去重 + 颜色变量化（44 处硬编码 hex → var）** | ✅ |
| **第五十七轮** | **2026-06-12** | **桥接层语义修复（11 处参数/返回类型对齐 IPC 契约）+ communicateSlice 拆分为 githubSlice（712→109行）** | ✅ |
| **第五十八轮** | **2026-06-12** | **GitHubPanel 组件提取（1351→554行，8 个子组件独立文件）** | ✅ |
| **第五十九轮** | **2026-06-12** | **browserSlice 拆 5 片（962→244 行）+ useBrowserPanel 彻底拆散（1042 行删除，4 个独立 Hook）** | ✅ |
| **第六十轮** | **2026-06-12** | **知识沉淀 + 文档同步 + 项目清理** | ✅ |
| **第六十一轮** | **2026-06-13** | **重构洞察第8次全量执行（16项发现）：CSS 徽章色变量主题化、shared.ts 拆分、browserpanel 辅助函数提取、ChangesPanel Hook 提取(840→237行)、githubSlice 拆分为CiConfig+CiStatus、MultiTreeEntryShell 共享骨架提取、browser-panel.css 拆分(1153→3文件)、agent_pipeline 13个单元测试** | ✅ |
| **第六十二轮** | **2026-06-14** | **重构洞察第9次全量执行（7项）：路径别名体系+41条深层导入替换、BrowserTabBar O(1)书签、useMemo包装、NavigatorResizeHandle组件提取、useFileContextMenuItems Hook提取(~250行重复消除)、DiffViewer useRef回调稳定化、fileTree事件委托** | ✅ |
| **第六十三轮** | **2026-06-14** | **ESLint/Prettier/Clippy/rustfmt四维门禁全量清零：ESLint 208 warnings→0、Prettier 6文件格式化、17项未使用import手动清理** | ✅ |
| **第六十四轮** | **2026-06-15** | **GitHub 子面板 i18n 全覆盖：清除 6 组件 15 处硬编码字符串（标签/过滤器/aria-label/tooltip/相对时间/日期 locale）；新增 17 个翻译 key；修复语言切换时面包屑标题行消失的预存 Bug** | ✅ |
| **第六十五轮** | **2026-06-15** | **重构洞察第10次全量执行（16项发现）+ 文件拆分冲刺：cmScrollLeftSync→3文件、FoldTooltipOverlay→2hook+精简组件、GitHubTreeEntry→菜单+子条目、GitHubPanel→4子视图、trunkHeightMap O(n²)→O(n)、CSS变量统一+硬编码样式迁移+TitleBar订阅合并** | ✅ |
| **第六十六轮** | **2026-06-16** | **重构洞察第11次全量执行（13项发现）：Phase 1 GitHubTreeEntry 去重（~178行冗余删除）+ @root 别名修复深层导入；Phase 2 BrowserTreeEntry 拆分（711→463行）+ FoldTooltipOverlay 进一步拆分（666→209行）；Phase 3 githubSlice 二拆三（githubRepoSlice + githubTreeSlice）+ uiSliceTypes 类型提取；Phase 4 ci-status crate 模块化（453→36行 lib.rs）+ browser crate 模块化（440→5行 lib.rs）；Phase 5 15处内联样式迁移到CSS类** | ✅ |
| **第六十七轮** | **2026-06-16** | **右侧面板导航按钮统一 + Bug 修复：leftbar CSS min-width 修复（折叠后内容区域不扩展）；审计/模型/设置/通信面板添加"右侧面板-切换左侧边栏"按钮（使用 communicateNavigatorCollapsed 状态同步）；通信面板按钮与平台标签同行布局；浏览器搜索栏英文翻译修正（Bookmarks/History/All）；i18n key 统一为 panelNavigatorToggle** | ✅ |
| **第六十八轮** | **2026-06-17** | **浏览器 iframe 嵌入崩溃修复：Vite 中间件 check-embed（HEAD 请求检测 X-Frame-Options/CSP frame-ancestors）+ checkEmbed.ts 客户端 LRU 缓存 + SafeIframe 组件 + Guard Effect（验证持久化 URL 可嵌入性）+ 双重状态（iframeBlockedDetected/iframeLoadError）+ 渲染条件改用 ref（同步无竞态）+ BrowserNavigator 提取（~300 行）** | ✅ |
| **第六十九轮** | **2026-06-17** | **错误 UI 优化 + 调试清理：移除常驻 proxy note；将错误消息与外部按钮合并为单个容器；重写 browserCannotOpenEmbedded 中英文文案；移除所有 [ADL-DEBUG] console.log（3 个文件）；删除 usePageReloadDetector 钩子 + DBG_KEY；清除未使用的 browserProxyNote i18n key** | ✅ |
| **第七十轮** | **2026-06-17** | **重构洞察第12次全量执行（9项发现）：Phase 1 BrowserPanel 导航器提取为 BrowserNavigator.tsx（977→~670行）+ TitleBar 菜单项提取到 titleBarMenus.ts（490→~410行）；Phase 2 CSS 架构规范化——3个超1000行CSS文件拆分（communication-panel 1738行→4文件、files-panel 1724行→3文件、file-tree 1234行→2文件）；Phase 3 性能优化——TitleBar setInterval(500ms)轮询替换为Tauri onResized事件监听、BrowserPanel 5个useShallow合并为1个；Phase 4 类型提取——terminalSliceTypes.ts 常量和类型提取、selectors.ts 按域拆分为9个独立文件** | ✅ |
| **第七十一轮** | **2026-06-17** | **Cross-origin iframe SecurityError 终极修复（Shadow DOM attachShadow closed 方案，6次迭代后成功）+ 四维门禁全量清零（ESLint 21 warnings→0、Prettier 27文件格式化、rustfmt/clippy 通过）+ browserSelectors.ts 空桩→完整24个选择器实现** | ✅ |
| **第七十二轮** | **2026-06-19** | **重构洞察第13次执行（13项发现）：Gutter hover overlay 提取为 FoldTooltipOverlay.tsx（~230 行）+ 8 个大型 CSS 文件拆分（全量 1000 行以下）+ 剩余空状态提取为独立组件（3 个）+ useFoldTooltipState 提取 checkEmbed.ts（~80 行）** | ✅ |
| **第七十三轮** | **2026-06-20** | **重构洞察第14次执行（9项发现）：7 个大型文件拆分——browserpanel.tsx 提取 useBrowserPageMeta + useBrowserMetaSubscription（1033→939行）、GitHubTreeEntry.tsx 提取菜单函数（828→322行）、useChangesPanelState.tsx 提取 21 个纯函数（624→295行）、useFoldTooltipState.ts 提取 useFoldTooltipPosition（584→286行）、workspaceActions.ts 提取 browserCleanupActions（547→448行）、useBrowserWebView.ts 提取 useBrowserUrlChange（471→356行）；代码质量清理——浏览器模块 24 处 console.log 全量清理、3 处 window as any 消除** | ✅ |
| **第七十四轮** | **2026-06-21** | **重构洞察第15次执行（11项发现）：前端 JSX 去重——browserpanel.tsx 提取 ExternalLinkError 组件消除 3 处重复；组件提取——EditorSurfaceShell 提取 FilePreviewRenderers（512→434行）、ChangesToolbar 拆分为 ChangesTopToolbar+ChangesNavigatorToolbar（451→18行）；CSS 拆分——file-tree.css（767行→2文件）、files-panel.css（724行→2文件）、composer.css（710行→3文件）；Rust 拆分——agent_pipeline.rs 提取 collect_file_context+collect_symbol_context+decide_audit_operation、model-gateway chat 提取 select_provider；CSS 硬编码清理——files-panel-core.css 8 处自定义属性替换为语义化变量** | ✅ |
| **第七十五轮** | **2026-06-21** | **浏览器导航去重修复：handlePageMeta 并发回调去重——新增 processedMetaRef 去重机制防止两个回调路径（onUrlChanged + meta-changed）创建重复标签/历史记录；修复 markUrlSeen 在新建标签模式中缺失的调用导致页面刷新循环** | ✅ |
| **第七十六轮** | **2026-06-22** | **重构洞察第16次执行（8项发现）：BrowserPanel Hook 提取（useBrowserToast + useBrowserDialogs，1040→877行，-163行）+ 合并两个 CreateTabDialog 渲染；Rust clone 消除——agent.rs make_activity_emitter 参数 &str 化（3 次 clone 消除）；CSS !important 清理——file-tree-core.css（26 处移除）+ files-panel-list.css（18 处移除）** | ✅ |
| **第七十七轮** | **2026-06-23** | **浏览器目录菜单交互优化：重命名"删除所有子标签"→"删除所有标签[嵌套]"，新增"删除自身目录标签"菜单项（"!"图标 + hint 提示卡），新增 store 函数 browserDeleteOwnTabsInNode，新增 action handleDeleteOwnChildTabs，工具栏"全部关闭"增加 favicon/meta/bookmark/title cache 清理，更新 SectionCallbacks 接口 + 3 处菜单组件（BrowserTreeEntry/BrowserEntrySubEntries/BrowserTabTree）+ BrowserNavigator/BrowserPanel 透传** | ✅ |
| **第七十八轮** | **2026-06-23** | **浏览器标签刷新语义优化：悬停按钮 tooltip 改为"刷新Logo/标题"，上下文菜单中"刷新"项改为"刷新Logo/标题"+ 新增"!"图标 + hint 提示卡，新增 i18n key browserRefreshMeta/browserRefreshMetaHint，BrowserTreeEntry 新增 showTabHint 回调 + 标签菜单新增"!"图标渲染** | ✅ |
| **第七十九轮** | **2026-06-23** | **重构洞察第17次执行（11项发现）：前端组件拆分——BrowserPanel（814→616行）、BrowserTreeEntry（721→476行）、GitHubCITree（715→273行）、preview-bridge/index.ts（622→75行，13子模块）、mock/shared.ts（519→57行，4子模块）；Rust clone 消除——agent_pipeline.rs（16→8）、task.rs（13→10）、workspace_sidebar.rs（11→7）、task/lib.rs 结构优化；CSS transition:all 修复（2处）；console.log 清理（3处）** | ✅ |
| **第八十轮** | **2026-06-24** | **浏览器导航栏4模式重构：Store 简化（删除 viewMode/showTabButtons）、BrowserNavigator 重写为4模式扁平按钮（open/tabs/list/search）、Flash 消除（display:none 包装）、搜索外部点击修复、Close 按钮仅 open 模式显示、Flat 模式标签溢出修复（::after 渐变蒙版 + position:relative + text-overflow:clip）、auto-sync 修复与调试日志清理** | ✅ |
| **第八十一轮** | **2026-06-25~26** | **浏览器历史记录修复（6 Bug）：INIT_SCRIPT/轮询脚本/handlePageMeta 三处 title===hostname 误跳过修复、同站 SPA 导航历史写入、跨域/同域 iframe 加载历史降级写入、首次导航 prefetch 成功时无历史写入的 Race Condition 修复** | ✅ |
| **第八十二轮** | **2026-06-26** | **FLIP 动画重构 + 浏览器标签标题修复：文件树 FLIP→Web Animation API 替代、延迟标签 URL 更新直到真实标题到达、通用 HTTP prefetch** | ✅ |
| **第八十三轮** | **2026-06-27** | **重构洞察第18次执行（15项发现，7项已落地）：BrowserNavigator OpenTabFlatList 提取（578→484行，-94行）；BrowserPanelContent BrowserIframeStack 提取（574→461行，-113行）；useChangesPanelState 对话框回调提取→useChangesPanelDialogs（548→515行，-33行）；useBrowserTreeActions 工具函数提取→browserTreeUtils（539→503行，-36行）；ESLint poolVersion 修复（22→20 warnings）** | ✅ |
| **第八十四轮** | **2026-06-27** | **SDD 子代理驱动重构（5 子代理 + 5 审查循环）：browser.rs Mutex unwrap→expect；model-gateway 模块化（382→163行 lib.rs + 6子模块）；BrowserEntrySubEntries 工具函数提取→browserEntrySubEntriesUtils（-238行）；useBrowserUrlChange 工具函数提取→browserUrlUtils（-38行）** | ✅ |
| **第八十五轮** | **2026-06-28** | **浏览器 WebView 覆盖检测修复：重叠感知 MutationObserver（bounding rect 相交判定替代粗粒度 DOM 检测），移除 browserMenuOpen/contextMenu.open 误触隐藏；Tauri permission 修复（core:window:allow-start-dragging）；代码质量治理——ESLint 18 warnings→4（any→proper type 11处、curly 2处、prettier 4处、useAppStore dep），Prettier 全量格式化，rustfmt + Clippy 全 clean；清理 stale 调试日志；知识笔记更新为三路协同架构** | ✅ |
| **第八十六轮** | **2026-06-29** | **重构洞察第19次执行：宏观扫描发现 4 处回归（!important 23→311、console.log 0→25、React.lazy 丢失、BrowserNavigator 膨胀至 495 行）；console.log 清理（fetchPageMeta 6 处）；App.tsx getState()→选择器订阅 activeSessionId；Rust unwrap 确认为测试代码；Rust clone 均属惯用模式；生成洞察报告（24 项发现）和实施计划（24 项任务）** | ✅ |
| **第八十七轮** | **2026-06-30** | **浏览器书签删除跨域污染修复：`browserRemoveTabBookmarks` 工作区过滤从 `tabId`-only 改为 `(tabId, url)` 对；新增可选 `scopeFolderId` 参数限定文件夹范围；`handleRemoveBookmarkTab` 从 store 推算目标文件夹并传入 scope；知识沉淀更新** | ✅ |
| **第八十八轮** | **2026-06-30** | **重构洞察第20次执行（Phase 1 全部7项 + Phase 2 关键5项完成）：useBrowserTreeActions 718→18行（-700行）；ipc.ts 1322→953行；kernel/index.ts 1312→13行；useBrowserTreeActions 4子Hook；React.lazy恢复3组件；深层导入281处→@别名；BrowserTreeEntry 531→199(-332)；fileTree 482→360(-122)；useBrowserTreeData 504→433(-71)；App.tsx getState()→选择器；28+新文件创建；278测试通过** | ✅ |
| **第八十九轮** | **2026-07-01** | **终验与合并：CodeMirror 多实例冲突修复（pnpm.overrides + resolve.dedupe + 5 direct deps）；ESLint 12→0 warnings（清理未使用导入/泛型/import type()→顶层导入）；TypeScript 预存错误修复（casing/JsonValue）；Clippy + cargo check + 类型检查 + 282 测试全通过；知识沉淀 WORKTREE-RERUN-ISSUES.md；文档更新；日志清理** | ✅ |
| **第九十轮** | **2026-07-01** | **浏览器 Favicon/Title 同步修复（8 Task）：Favicon 缓存 localStorage 持久化 + 源优先级系统（com>iframe>http>google）+ HTTP prefetch/browser-mode submit 统一路由至 handlePageMeta + fetchPageMeta 纯函数化 + BrowserTabBar 通过 BrowserFavicon 订阅 favicon 变更 + 过期缓存 onError 驱逐 + 全部通过 287 测试 + ESLint/clippy/rustfmt 全 clean** | ✅ |
| **第九十一轮** | **2026-07-01~02** | **refactoring-insight 全流程执行（6 阶段 18 任务，SDD 模式）：死代码 + IPC 契约修复 + CSS diff 合并（!important 147→115）+ 大文件域拆分（outline.ts 862行→14模块、ipc.ts 932行→16域文件）+ Store 切片提取 + Hook/组件分解 + Rust unwrap 治理 + i18n 硬编码修复 + leaf module 打破类型循环（详见下方第九十一轮章节）** | ✅ |
| **第九十二轮** | **2026-07-03** | **refactoring-insight 第23次执行（34项发现，13/17任务完成）：死代码清理 + i18n 硬编码修复（21处）+ Store 切片分解（workspaceLifecycleActions + githubCiRefresh）+ CSS 文件拆分（statusbar/editor-content/markdown-preview/highlightjs-theme）** | ✅ |
| **第九十三轮** | **2026-07-08** | **OpenCode 功能审计缺陷修复（10项）：核心正确性（Plan Mode write 白名单、Compaction 阈值修正、Subagent 权限继承）、可靠性（DurableSession 错误处理、Plugin hook 链式传播、默认模型动态解析、SubagentManager 状态更新）、WebTools 增强（WebFetch 5MB/30s/HTML→Markdown）、MCP 完善（SSE/StreamableHTTP 拆分、自动重连）** | ✅ |

## 说明

各轮重构的详细信息请参考对应的重构洞察报告文件，位于 `docs/reports/refactoring-insight/report/` 目录下。

## 2026-06-11 重构洞察修复计划第 43-55 轮

### 本轮完成的工作

1. **桥接层方法对齐**（第 43 轮）
   - `mock-task.ts`：添加缺失的 `listPendingApprovals` 方法
   - `preview-bridge/index.ts`：`reorder` 参数类型统一为 `ReorderWorkspacesInput`
   - `mock-workspace.ts`：补全缺失方法

2. **统一错误处理**（第 44 轮）
   - 三个桥接层的 `IpcResult<T>` 返回类型一致性检查
   - 消除 `string` 与结构化错误混用

3. **文件树虚拟化**（第 45-46 轮）
   - 新增 `hooks/useVirtualList.ts`：基于 `scrollTop` + `viewportHeight` 计算可见范围
   - `fileTree.tsx`：从递归嵌套渲染改为扁平虚拟列表渲染
   - `TreeNodeRow.tsx`：行组件独立 + `React.memo` 包裹
   - 测试环境降级：`viewportHeight === 0` 时渲染全部节点（SSR/无 DOM 环境）

4. **状态订阅优化**（第 47-49 轮）
   - 右面板 `useAppStore()` 全量订阅 → 选择器 + `useShallow`
   - `CenterPane.tsx`、`ConversationPanel.tsx` 选择器粒度细化
   - `useBrowserPanel.ts`：20+ 字段选择器使用 `useShallow`

5. **列表项 Hook 优化**（第 50 轮）
   - `BrowserTreeEntry.tsx`、`WorkspaceFileTreeEntry.tsx`、`WorkspaceChangesEntry.tsx` 等 6 个列表项组件
   - 添加 `React.memo`，事件处理函数 `useCallback` 包装

6. **IPC 契约文档注释**（第 51 轮）
   - `shared/ipc.ts`：15 个接口、90+ 个方法添加 JSDoc 注释

7. **Store 跨切片依赖文档**（第 52 轮）
   - `stores/actions/` 目录下 11 个 action 模块添加 `@reads` / `@writes` 注释

8. **应用启动延迟加载**（第 53 轮）
   - `RightPanel.tsx`、`EditorSurfaceShell.tsx`、`DiffEditorSection.tsx`
   - 12 个重型组件使用 `React.lazy` + `Suspense`

9. **浏览器面板渐进式拆分**（第 54 轮）
   - 新增 `BrowserToolbar.tsx`、`useBrowserNavigation.ts`、`useBrowserUrlState.ts`
   - `browserpanel.tsx` 逻辑分层更清晰

10. **内存泄漏清理**（第 55 轮）
    - `Toast.tsx`、`FileCreationBar.tsx`、`MarkdownPreview.tsx` 的 `setTimeout` 清理
    - `useFileCreation.ts` 等 hook 的事件监听器清理

### 架构变更总结

| 维度 | 变更前 | 变更后 |
|------|--------|--------|
| 文件树渲染 | O(N) DOM 节点 | O(viewport / 28px) 虚拟列表 |
| Zustand 订阅 | `useAppStore()` 全量 | 选择器 + `useShallow` 浅比较 |
| 首屏 bundle | 包含 CodeMirror / xterm | React.lazy 代码分割 |
| 列表项性能 | 父组件刷新连带刷新所有子项 | React.memo 跳过未变更项 |

### 质量门禁结果（执行时间 2026-06-11）

| 检查项 | 结果 |
|--------|------|
| `pnpm run typecheck`（frontend） | ✅ 0 errors |
| `pnpm test`（frontend，212 tests） | ✅ all passed |
| `cargo fmt --all -- --check` | ✅ passed |
| `cargo clippy --workspace --all-targets -- -D warnings` | ✅ 0 warnings |
| `cargo test --workspace --exclude adl-pty` | ✅ passed |

> `adl-pty` 的 Windows PTY 测试在本地环境超时，属于预存在的环境问题，与本次重构无关。

## Round 68 – 2026-06-19

### Target
前端 CSS/TSX 大型文件减负 + Rust agent_pipeline 模块化 + 清理生产代码 console.log

### 变更清单

**CSS 架构规范化（5 个文件拆分为 22 个）**
- components.css (1075行) → 14 个独立组件 CSS + barrel
- communication-workflows.css (988行) → workflows (526行) + jobs (465行)
- diff-viewer.css (965行) → diff-viewer (437行) + diff-inline (162行) + diff-side-by-side (367行)
- leftbar.css (941行) → leftbar (382行) + leftbar-session (226行) + leftbar-workspace (217行)
- editor-surface.css (918行) → editor-surface (177行) + editor-content (614行)

**前端大型文件减负（7 个 TS/TSX 文件拆分，提取 14 个新文件）**
- useChangesPanelState.tsx (655行) → 提取 useChangesPanelStateTypes.ts + useChangesPanelStateUtils.ts
- uiSlice.ts (541行) → 拆分为 uiSliceWidths.ts (182行) + uiSliceExpansion.ts (152行)
- githubRepoSlice.ts (529行) → 提取 githubRepoSliceTypes.ts + githubRepoSliceHelpers.ts
- githubSlice.ts (464行) → 提取 githubSliceHelpers.ts (142行)
- workspaceActions.ts (589行) → 提取 browserCleanupHelpers.ts (50行)
- StatusBar.tsx (560行) → 拆分为 StatusBarGitInfo.tsx (290行) + StatusBarEditorInfo.tsx (130行)
- FileNavigatorShell.tsx (624行) → 拆分为 FileNavigatorToolbar.tsx (170行) + FileNavigatorTree.tsx (110行)

**Rust 模块化**
- agent_pipeline.rs (898行) → 提取 agent_pipeline_stream.rs 子模块（流式事件发射 + 8 个单元测试）

**性能与代码质量**
- 清理 13 个文件中的 29 处 console.log/warn/error
- useTaskCenterPolling 评估：Tauri 无暴露事件 API，保留轮询 + 添加注释说明

**红绿测试验证**
- ESLint: 0 problems (51 auto-fixable warnings resolved)
- Prettier: All matched files formatted
- Cargo clippy: 0 warnings
- Rustfmt: clean
- Frontend typecheck: passed
- Frontend tests: 38 files, 250 tests, 0 failed
- Cargo test: all crates, 0 failed
- Rust format check: clean

### 本轮的 2 个失败与重试
- `outlinePanelWiring.test.ts`、`cmPreviewStyling.test.ts` 因 CSS/TSX 文件拆分断言位置和 CSS 名称变更，已追跟随更新
- useTaskCenterPolling 事件驱动无法实现（Tauri 无暴露事件 API），已记录
- 重复的 eslint/format lint fix，后续 CI 中要注意前置阶段巡检

### 本轮重构的杠杆点
- CSS barrel 模式推广：components.css 成为纯 @import barrel，新增组件只需创建一个 CSS 文件并加入 barrel，无需修改 barrel 文件
- 通用 slice 拆分模式：类型提取 + helpers 提取 + slice 编排的三层架构，可推广到其他 slice
- StatusBar 组件拆分模式：GitInfo/EditorInfo 可独立测试和复用

## Round 73 – 2026-06-20

### Target
浏览器标题/图标同步 + 导航循环根治 + iframe 标题污染清零

### 变更清单

**Rust INIT_SCRIPT 守卫（根因修复）**
- `crates/browser/src/browser_navigation.rs`：快速标题上报 IIFE 加 `window.top !== window.self` 守卫，仅顶层框架上报标题，iframe 跳过

**前端导航循环三层防护**
- `useBrowserWebView.ts`：
  - 单值 `currentWebViewUrlRef` → `recentNavigatedUrlsRef: Map<string, number>`（1s 窗口），防并发 iframe URL 覆盖导致跳过检查失效
  - 新增 `expectedNavigationUrlRef` + `isProbablySameSite` 同站过滤器，防 HTTP 抓取路径的 iframe meta 污染
  - 新增 `setExpectedUrl`（3s 超时自动清除），统一导航预期目标跟踪
  - 移除 `useEffect` 内嵌创建/导航逻辑，统一委托给 `navigateTauriUrl`
  - 新增 `forceReloadTauri` 绕过防抖直接导航（硬刷新）

**Favicon 预加载同步**
- `BrowserPanel.tsx`：`handleNavigationStart` 预加载 Google S2 favicon（300ms 提前量）；`handlePageMeta` 预加载实际 favicon

**死代码清理**
- `browser.rs`：删除 `browser_report_page_meta` 命令 + `ReportMetaPayload` 结构体 + 未使用的 imports
- `fetchPageMeta.ts`：删除 `clearPageMetaCache()`（零调用者）
- `main.rs` eval 脚本：移除 `location.hash` 通道
- `capabilities/digital-life.toml`：移除 `browser_report_page_meta` 权限

**红绿测试验证**
- ESLint: 0 problems
- Prettier: All matched files use Prettier code style
- Cargo clippy: 0 warnings
- Rustfmt: clean

## 第八十一轮：浏览器历史记录修复（2026-06-25~26）

### 背景

导航器"历史记录"目录中部分页面访问未被记录，且不同网站表现不一致（B 站首页首次导航不记录，YouTube 首页正常）。

### 修复的 6 个 Bug

| # | Bug | 涉及文件 | 类型 |
|---|-----|----------|------|
| 1 | `isTitleMeaningful` 在 title===hostname 时误跳过，阻塞 INIT_SCRIPT postMessage 上报 | `browser_navigation.rs` | Rust |
| 2 | 轮询 `fetch_script` 同样 title===hostname 检查 | `browser_webview.rs` | Rust |
| 3 | `handlePageMeta` 额外 `title===urlHostname` 检查直接 `return` | `useBrowserPageMeta.ts` | 前端 |
| 4 | 同站 SPA 导航（Tauri 模式）无历史写入 | `useBrowserUrlChange.ts` | 前端 |
| 5 | iframe 跨域/同域加载（浏览器模式）丢失历史 | `useBrowserUrlChange.ts`, `BrowserPanel.tsx` | 前端 |
| 6 | 首次导航（noTabExists）prefetch 成功时创建标签但不写历史，meta-changed 到达时标题匹配又跳过 | `useBrowserUrlChange.ts` | 前端 |

### 核心发现

Bug 6 是最难排查的 Race Condition：

```
首次导航 → noTabExists → prefetch 成功(真实标题)
  ├─ 创建标签(标题=pageTitle) ← 但没写历史
  └─ meta-changed 到达:
       └─ exactMatch.title === pageTitle → false → ❌ 跳过
```

不同网站表现不一致的原因：B 站的 HTTP prefetch 能返回真实标题，YouTube 的 prefetch 返回空标题。前者走 prefetch 成功路径丢失历史，后者走 fallback 路径由 meta-changed 成功写入。

### 关键经验

详见 `docs/knowledge-base/browser/2026-06/browser-history-recording-fix-2026-06-26.md`

## 第八十二轮：FLIP 动画重构 + 浏览器标签标题修复（2026-06-26）

### 背景

两个独立的 Bug：

1. **文件树 FLIP 动画双重播放**：CSS `@keyframes adl-entry-slide-in` 与手动 RAF FLIP 同时作用，新条目触发两次动画。同时 FLIP 的 `el.style.transition` 覆盖了 CSS `transition: opacity`，导致悬停透明度过渡失效。

2. **浏览器标签标题闪烁/错误**：导航时旧标题短暂显示后才更新为正确标题（Issue 1）；同站 SPA 回退导航后标题永久停留在旧值（Issue 2）。

### 修改的文件

#### FLIP 动画
| 文件 | 变更 |
|------|------|
| `fileTree.tsx` | 移除 `isNewEntry` ref/state/effect/prop；FLIP 改用 `el.animate()` 替代 RAF+inline styles；移除 `flipCleanupTimersRef` |
| `TreeNodeRow.tsx` | 移除 `isNewEntry` prop、CSS class、`data-is-new-entry` attribute |
| `file-tree-core.css` | 移除 `@keyframes adl-entry-slide-in`、`.adl-filetree__item--new-entry` |

#### 浏览器标签标题
| 文件 | 变更 |
|------|------|
| `browserSlice.ts` | `browserNavigateActiveTab` 不再保留旧标题（`title: title \|\| tab.title` → `title: title \|\| ''`） |
| `useBrowserUrlChange.ts` | 延迟标签 URL 更新直到真实标题到达；移除 `isSameSite` 门控，HTTP prefetch 始终进行；prefetch 回调原子更新 URL+title；移除未使用的 `hostnameFromUrl` 导入 |

### 核心改动

1. **FLIP → Web Animation API**：`el.animate()` 替代 `requestAnimationFrame` + `el.style.transition/transform`，消除 CSS 过渡覆盖，自动清理动画副作用。
2. **延迟标签创建**：`onUrlChanged` 不再立即调用 `browserNavigateActiveTab(url)`，而是等待 prefetch 或 `handlePageMeta`（COM 事件）提供真实标题后才原子更新 URL+title。
3. **通用 prefetch**：同站 SPA 导航也执行 HTTP prefetch，弥补 COM 事件在 SPA pushState 下不可靠的问题。

### 关键经验

详见 `docs/knowledge-base/browser/2026-06/browser-tab-title-deferred-update-2026-06-26.md`

## 第九十一轮：refactoring-insight 全流程执行（2026-07-01~02）

### 背景

通过 `refactoring-insight` 技能系统性执行重构洞察工作流：6 阶段、18 任务，使用子代理驱动开发（SDD）模式在隔离 worktree 中完成，最终合并到 main 分支。

### 修改的文件

#### Phase 1：死代码 + IPC 契约修复
| 文件 | 变更 |
|------|------|
| `frontend/src/styles.css` | 删除孤立 shim |
| `frontend/src/shared/ipc.ts:616` | `listPendingApprovals?` → `listPendingApprovals`（必需，非可选） |
| `frontend/src/app/stores/cacheHelpers.ts` | 删除 4 个已弃用函数 |
| `frontend/src/app/stores/slices/workspaceSlice.ts` | 删除 workspaceTree 字段 + setter |
| `frontend/src/preview-bridge/preview-events.ts` | 删除 onUrlChanged/onMetaChanged |

#### Phase 2：CSS diff 合并 + 颜色 token 化
| 文件 | 变更 |
|------|------|
| `frontend/src/styles/regions/rightpanel/diff-shared.css` | 新建，共享 diff 规则 |
| `frontend/src/styles/themes.css` | 添加 5 个 diff 颜色 token |

**`!important` 从 147 减少至 115**

#### Phase 3：大文件域拆分
| 文件 | 变更 |
|------|------|
| `frontend/src/shared/outline.ts` | 862 行 → 14 个模块 + index.ts (157 行) |
| `frontend/src/shared/ipc.ts` | 932 行 → 16 个域文件 + index.ts (15 行) |

#### Phase 4：Store 切片提取
| 文件 | 变更 |
|------|------|
| `browserFoldersSlice.ts` | 437 → 392 行（提取 `browserFoldersTypes.ts` + `browserFoldersUtils.ts`） |
| `workspaceActions.ts` | 425 → 287 行（提取 `workspaceTreeActions.ts`） |
| `githubRepoSlice.ts` | 422 → 362 行（提取 `githubRepoSliceHelpers.ts`） |

#### Phase 5：Hook/组件分解
| 文件 | 变更 |
|------|------|
| `useBrowserFolderActions.ts` | 521 → 10 行（orchestrator）+ `useBrowserFolderCrud.ts` (460) + `useBrowserFolderReorder.ts` (73) |
| `GitHubLogViewer.tsx` | 419 → 313 行（提取 `useFloatingMenu.ts` 41 行 + `useLogViewerJobs.ts` 122 行 + `useLogSearch.ts` 85 行） |

#### Phase 6：Rust + i18n + 类型循环
| 文件 | 变更 |
|------|------|
| `crates/adl-logging/src/manager.rs:80,83,268` | `unwrap()` → poisoned mutex 优雅恢复 |
| `src-tauri/src/commands/browser.rs:162` | `expect()` → `unwrap_or_else(into_inner)` |
| `crates/ci-status/src/ci_client.rs:131` | `unwrap_or_default()` → match + tracing::warn |
| `crates/workspace/src/search.rs:62` | `unwrap_or_default()` → match + tracing::warn |
| `src-tauri/src/commands/workspace_git.rs:41,140` | 消除 `WorkspaceMeta` clone（级联签名调整） |
| `frontend/src/app/components/QuickActions.tsx` | 3 个硬编码 tooltip → i18n（复用现有 quickSkills/quickMcp/quickNewWorkspace 键） |
| `frontend/src/app/stores/slices/browserSliceShared.ts` | 新建，打破 browser 三切片类型循环 |
| 5 个 browser slice 文件 | 更新 imports 指向 shared leaf module |

### 核心改动

1. **SDD 工作流**：隔离 worktree + 子代理驱动（每任务一个新子代理），完成后 fast-forward 合并到 main
2. **leaf module 模式**：`browserSliceShared.ts` 作为 leaf module 打破循环依赖
3. **域拆分模式**：`outline.ts` 和 `ipc.ts` 按功能域拆分为多文件 + barrel `index.ts`
4. **CSS 共享提取**：`diff-shared.css` 统一 diff 规则，`themes.css` 添加颜色 token

### 红绿测试验证

- ESLint: 0 errors（6202 个预存 CRLF 警告，已记录为已知项）
- TypeScript: 0 errors
- 前端测试: 287/287 passed
- Cargo check: clean
- Cargo clippy: 0 warnings
- Rust 测试: exit 0

### 关键经验

详见 `docs/knowledge-base/重构/2026-07/refactoring-insight-execution-2026-07-01.md`

### 待后续治理项

- `useBrowserFolderCrud.ts` (460 行) 仍是拆分候选
- `GitHubLogViewer.tsx` (313 行) 未达 <250 目标（JSX 必须保持不变）
- QuickActions 丢失 "Ctrl+N" 提示（UX 微小回退）
- CRLF 警告 6202 个（仓库级治理决策，待用户确认）

## 第九十二轮：refactoring-insight 第23次执行（2026-07-03）

### 背景

通过 `refactoring-insight` 技能系统性执行重构洞察工作流：6 阶段，34 项发现，13/17 任务完成。基于 origin/main 的 worktree（commit 4cd85c99）。

### 修改的文件

#### Phase 1：死代码 + 常量集中化 + React.memo（Tasks 1-3）
| 文件 | 变更 |
|------|------|
| `frontend/src/preview-bridge/preview-window.ts` | 删除 `createPreviewWindowBridge()` 返回的死代码 `browser` 属性（10个方法，零消费方） |
| `frontend/src/app/stores/slices/browserSliceShared.ts` | 新增 3 个导出常量：`BROWSER_SHORTCUTS_KEY`、`BROWSER_LOCAL_PORTS_KEY`、`BROWSER_BG_CONFIG_KEY` |
| `frontend/src/app/stores/slices/browserSlice.ts` | 删除 3 个本地常量定义，改为从 leaf module import |
| `frontend/src/app/stores/slices/browserLandingSlice.ts` | 同上 |
| `frontend/src/app/features/browser/BrowserOpenTabFlatListItem.tsx` | **新建** — 从 BrowserOpenTabFlatList 提取的 React.memo 包裹子组件（91行） |
| `frontend/src/app/features/browser/BrowserOpenTabFlatList.tsx` | 从 101 行减至 57 行，用子组件替代内联 `<li>` 渲染 |

#### Phase 2：i18n 硬编码中文修复（Tasks 4-7）
| 文件 | 变更 |
|------|------|
| `src/app/i18n/zh-CN/communicate.ts` + `en-US/communicate.ts` | 新增 4 key：`relativeTimeJustNow`/`MinutesAgo`/`HoursAgo`/`DaysAgo` |
| `src/app/i18n/zh-CN/browser.ts` + `en-US/browser.ts` | 新增 4 key：`browserDateYear`/`DateMonth`/`DateDay`/`NewTabFolder` |
| `src/app/i18n/zh-CN/changes.ts` + `en-US/changes.ts` | 新增 4 key：`cmFoldNoChanges`/`FoldRestore`/`FoldAccept`/`FoldReject` |
| `src/app/i18n/zh-CN/common.ts` + `en-US/common.ts` | 新增 3 key：`debugCopyLogs`/`debugCopied`/`debugCopyFailed` |
| `src/app/regions/.../communicate/githubPanelUtils.ts` | `formatRelativeTime` 改为返回结构化 key+params |
| `src/app/features/browser-tree/useBrowserTreeData.ts` | 4 处硬编码中文 → i18n key |
| `src/app/features/editor/cmTheme.ts` | 将 `getPhrasesExtension(locale)` 改为 `getPhrasesExtension(phrases: CmPhrases)` |
| `src/app/features/editor/CodeEditor.tsx` + `SideBySideDiffViewer.tsx` + `InlineDiffViewer.tsx` | 更新为使用 `useTCopy()` 计算 `CmPhrases` |
| `src/app/features/browser/useBrowserMenus.ts` | `'新建标签文件夹'` → `t.browserNewTabFolder` |
| `src/app/utils/settingsViewModel.ts` | `'中文'` → i18n key |
| `src/app/components/conversation/RunSummaryBlock.tsx` | 移除硬编码 fallback |
| `src/app/utils/debugLogCollector.ts` | 5 处硬编码按钮文本 → `getAppCopy()` |
| **总计**：26 文件修改，15 个新 i18n key，21 处硬编码消除 |

#### Phase 3：Store 切片分解（Tasks 8-11）
| 文件 | 变更 |
|------|------|
| `frontend/src/app/stores/actions/workspaceLifecycleActions.ts` | **新建** — 提取 `openWorkspace`/`clearWorkspaceContext`/`pickWorkspaceDirectory`（96行） |
| `frontend/src/app/stores/actions/workspaceActions.ts` | 303→220 行（-83行，3个生命周期 action 移出） |
| `frontend/src/app/stores/slices/githubCiRefresh.ts` | **新建** — 提取 `refreshCiStatus`/`refreshCiStatusForWorkspace` 共享 helper（52行） |
| `frontend/src/app/stores/slices/githubSlice.ts` + `ciSlice.ts` | 改用共享 helper |
| Task 8（githubRepoDeleteHelpers）和 Task 11（browserFoldersDeletionHelpers）| **已验证**：helpers 已在之前的重构中创建，本轮无需新增 |

#### Phase 4：CSS 文件拆分（Tasks 14-15）
| 文件 | 变更 |
|------|------|
| `frontend/src/styles/regions/statusbar-menu.css` | **新建** — 从 statusbar.css 提取菜单样式（456行） |
| `frontend/src/styles/regions/statusbar.css` | 770→317 行（-453行，仅保留状态栏本体） |
| `frontend/src/styles/regions/rightpanel/markdown-preview.css` | **新建** — 从 editor-content.css 提取 Markdown 预览样式（309行） |
| `frontend/src/styles/regions/rightpanel/highlightjs-theme.css` | **新建** — 从 editor-content.css 提取 Highlight.js 主题样式（109行） |
| `frontend/src/styles/regions/rightpanel/editor-content.css` | 719→306 行（-413行，仅保留 CodeMirror 布局） |
| `frontend/src/app/regions/right-panel/cmPreviewStyling.test.ts` | 修复 — 添加拆分后 CSS 文件到测试读取列表 |

### 核心改动

1. **React.memo 组件化**：BrowserOpenTabFlatListItem 从内联 `<li>` 提取为独立 memo 组件
2. **i18n 全量覆盖**：21 处硬编码中文清除，15 个新 i18n key（zh-CN + en-US 双语言）
3. **Store 架构**：2 个新 helper 文件，2 个已验证已有（无需新增）
4. **CSS 架构**：3 个大 CSS 文件拆分，2 个从 >500 行降至 <400 行

### 红绿测试验证

- TypeScript: 0 errors
- 前端测试: 49 files / 299 tests / 0 failed
- Cargo check: clean
- Cargo clippy: 0 warnings

### 关键经验

详见 `docs/refactoring-insight/report/daily-insights/2026-07/refactor-insight-2026-07-03.md` 和 `docs/plans/refactoring/refactor-plan-2026-07-03.md`

### 待后续治理项

- `useTerminalPanel.ts` (323行) — 未拆分（Task 12-13，本轮跳过）
- `TerminalPanel.tsx` (378行) — 未提取 TerminalHeaderBar（Task 13，本轮跳过）
- `BrowserPanel.tsx` (731行) — 未进一步拆分（本轮跳过）
- Rust `webview2_message.rs` 5x Mutex → RwLock — 未迁移（Task 16，本轮跳过）

## 第九十三轮：OpenCode 功能审计缺陷修复（2026-07-08）

### 背景

Phase 2 功能完成后，对照 OpenCode 进行功能审计，发现 10 项实现缺陷，分为 4 组修复：核心正确性（3项）、可靠性（4项）、WebTools 增强（1项）、MCP 完善（2项）。Squash commit `5a83ebfb` on `main`。

### 修改的文件

#### Group A: 核心正确性（3项）

| 缺陷 | 修复 |
|------|------|
| Plan Mode 完全禁止 `write` 工具 | `write` 工具加入白名单，但限制仅可写 plan 文件路径 |
| Compaction 触发阈值错误使用 PRUNE_PROTECT(40000) | 改为 PRUNE_MINIMUM(20000) 作为触发点，PRUNE_PROTECT 作为保护区 |
| Subagent 权限继承未考虑父 Agent 限制 | `derive_subagent_permission` 使用父 Agent 的 `allowed_tools`，write 工具强制 deny |

#### Group B: 可靠性（4项）

| 缺陷 | 修复 |
|------|------|
| DurableSession 所有错误用 `let _ =` 静默吞掉 | 替换为 `tracing::warn!` 或返回 `Result` |
| Plugin hook 执行结果未链式传播 | `fire_hook` 链式传递 Modify 结果；插件存储从 HashMap 改为 Vec 保证有序执行 |
| 默认模型解析硬编码 match | `default_model()` 查询 ProviderRegistry 动态解析 |
| SubagentManager.update_status 未知 ID 静默忽略 | 返回 `Result` 以报错未知 ID |

#### Group C: WebTools 增强（1项）

| 缺陷 | 修复 |
|------|------|
| WebFetch 无大小限制、无超时、无格式选择 | 5MB 限制 + 30s 超时 + HTML→Markdown（html2text）+ 格式选择（text/markdown/html） |

#### Group D: MCP 完善（2项）

| 缺陷 | 修复 |
|------|------|
| SSE 与 StreamableHTTP transport 合并处理 | 拆分为独立 match arm + 文档说明差异 |
| MCP 连接断开无自动重连 | 实现 `auto_reconnect()` + `ToolListChanged` 通知（rmcp `ClientHandler` trait） |

### 核心改动

1. **Compaction 阈值语义明确化**：PRUNE_MINIMUM(20000) 是触发点，PRUNE_PROTECT(40000) 是保护区下限，两者职责不同
2. **Plugin hook 有序执行**：从 HashMap 无序存储改为 Vec 有序存储，确保 hook 按注册顺序执行且结果链式传播
3. **DurableSession 错误可见性**：静默失败是 bug，所有错误必须通过 `tracing::warn!` 或 `Result` 返回暴露
4. **MCP 自动重连机制**：通过 rmcp `ClientHandler` trait 实现断线重连 + 工具列表变更通知

### 关键经验

详见 `docs/knowledge-base/code-quality/2026-07/opencode-audit-fix-2026-07.md`

