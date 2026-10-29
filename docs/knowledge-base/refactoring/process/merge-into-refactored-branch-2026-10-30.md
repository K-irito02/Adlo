# 合入含大重构的分支：弃重写、就架构重落位（2026-10-30）

## 背景

`opencode-settings-parity` 分支（设置面板 DSH/OpenCode 对齐 4 事项，全量重写 `OpencodeSettings.tsx`）
合入 `slot-1` 时，目标分支已被另一会话的 40 提交重构：通用 `HarnessVersionCard` + 桥适配器 +
`harnessVersion` 文案域。5 处冲突（双方重写 1、内容冲突 2、删改 2）。

## 做法

不二选一（不取我方重写、不取对方删除），而是把需求逐项重落在新架构的扩展点上：

| 原实现位置 | 新架构落位 |
|------------|------------|
| 独立组件的行/卡结构 | 卡片 slots（`sourceOptions`/`currentHint`/`desc*`/`footer`/`sourceFooter`/`sourceNote`） |
| 检查更新语义 | `capabilities.updateAction: 'check'` + 桥 `checkUpdate` |
| 手动/已装/系统行 | `capabilities.extraRows: 'manual+installed'` |
| 会话缓存/骨架/扫光/刷新按钮 | 桥 `peekSnapshot/peekSourceMode` + 卡片骨架/刷新腿（capability `refreshRows` 开关，DSH 零影响） |
| 蓝色新版本提示 | 卡片通用 `updateNote`（两组共用文案域） |
| 被删文件（旧组件/旧 CSS/过渡缓存模块） | `git rm` 接受删除，样式并入共享 CSS，职责拆进桥模块 |

## 教训

1. 合并基线先看对方改了什么（`git diff main...<target> --stat`），再动手解冲突；5 处冲突中有 3 处是"对方已提供更好位置"（slots/capabilities/文案域），重写反而是倒退。
2. 共享组件加能力一律走可选开关 + 缺省无行为：DSH 侧零回归，审查与测试成本只落在新开关的消费方。
3. 搜索索引的定位文案与卡片 DOM 文案跨键一致时，加对等断言守卫（本轮 `opencode*` 行键 vs 通用文案 4 对，中英），否则"靠巧合工作"。
4. 定点取"合入前目标尖端"而非 `origin/HEAD` 的 merge-base，避免把对方会话的 40 提交扫入本轮审查范围（理由记进度文件）。
