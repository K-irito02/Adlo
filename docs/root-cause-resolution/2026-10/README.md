# Root Cause Resolution — 2026-10

## 进度文件索引

- [progress-2026-10-03-140019.md](./progress-2026-10-03-140019.md) — 中间区「新建终端」选择器美化与终端视图 9 事项：选中终端类型/新建按钮去品牌蓝改中性灰阶（亮暗双主题）、四角偏直角、`绑定工作区` 小标题对齐卡片标题、下拉复用设置面板 `SettingsSelect`（撑满内容宽 + 失效工作区回退）、中间工具栏「视图布局+交换」移到左侧、只读历史补 xterm 同款悬停滚动条（3px 细线 → 14px 粗方形）、**修复只读历史被裁剪并永久丢失的根因**（列数变化＝xterm 重排会使按绝对行号的增量采集失效 → 视为整段重采；重建后仅在已产出新块时淘汰旧代尾部，定稿同口径，消除索引指向已删块与磁盘孤儿）、时间戳分隔线改虚线、区域按钮改为「最大化/还原」语义（图标对调 + title/aria-label 解耦 + 渲染期归一化防空面板）；Phase 4 子代理只读审查循环（A 根因验证 rev1→rev2 修 1 严重 + 3 中 + 4 低；B 死代码清理零行动项）+ 全量 3374 用例全绿；
- [progress-2026-10-02-131147.md](./progress-2026-10-02-131147.md) — 中间区统一入口页与 DSH 版本管理迁移 9 事项：新建标签页→新建入口页、三入口（deepseek harness/浏览器/终端）图标+悬停灰底+左对齐居中、DeepSeek 品牌图标考证重建（9 月删除的 `DeepSeekIcon` → 独立 `IconDeepSeek`）、版本管理迁入设置面板 DSH 组并合并为单卡设置行（提示图标按钮 + 统一操作按钮 + 窄档换行左对齐）、`CenterLauncherPage→CenterEntryPage` 更名与 `dsh.css→center-entry.css + dsh-version.css` 样式拆分、死 CSS/i18n 清理、`openDsh` freedPort/失败通知回归、卸载 busy 态、抽共享 `SettingsHintButton`、测试隔离根因修复（防抖计时器泄漏）；Phase 4 子代理只读审查循环（A 根因验证 rev1–rev2 / B 死代码清理 rev3–rev5，终局零行动项）+ 分级验收 287 用例全绿；提交 `2dae1def` + 收尾修复 commit
