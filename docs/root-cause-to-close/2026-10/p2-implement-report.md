# P2A 实施报告 — 通用版本卡片恢复旧 DSH 视觉（2026-10-29）

分支 `slot-1`，基线 `681722805`，共 4 个提交（不含 P0 进度文件）：
`db61f162c`（structure 测试，先红）→ `1b938dd42`（卡片重写，转绿）→
`051a3c9ef`（既有测试跟进）→ `74703a2d3`（快照竞态加固）。

## 结论

通用 harness 版本卡片的表现层已按旧 DSH 版本管理块（基线 `2ea69fd7` 的
`DshVersionManagement.tsx` + `dsh-version.css`）重写，中性前缀
`adl-harness-version__*` 复刻旧 DOM/行顺序/条件显隐。桥 / 适配器 / store /
action / 轮询逻辑零改动（只新增能力旗标与插槽）。DSH 默认渲染旧 6 行单卡；
OpenCode 同卡 + 终端行 + 手动/已安装。

## 逐文件变更

- `harness/harnessVersionBridge.ts`：`HarnessVersionCapabilities` 新增
  `extraRows?: 'none' | 'manual+installed'`（缺省 `'none'`）。
- `harness/hooks/useHarnessVersionChannelMenu.ts`：重写为旧菜单交互——sizer 实测
  （菜单 replica + 下拉框 replica 取最大，`maxWidth`）、右对齐视口钳制几何
  （`top/bottom/left/width/maxHeight`，`MENU_OFFSET 6 / MAX 280 / MIN 80`）、
  失连触发器自动收起、外部 mousedown/ Esc 关闭、滚动跟随（面板内滚动 capture、
  菜单自身滚动不重定位）。选择/开关语义不变。
- `harness/HarnessVersionCard.tsx`：单卡编排——来源行（`SettingsSelect` + 来源说明
  插槽）→ 系统路径行（仅 extraRows）→ 来源尾部插槽 → 当前版本行（读数容器 +
  插槽/回退）→ 缺失横幅（仅 extraRows）→ 检查更新行 → 双通道选择器行或传统
  下拉行 → 手动版本行（仅 extraRows）→ 尾部插槽（官方链接行，卡内末行）→ 测量尺；
  卡外：已安装独立卡（仅 extraRows + 管理可见）、独立任务卡（仅无选择器形态）、
  恢复默认卡（能力门控如前）。根 `div.adl-harness-version` 保留，
  CSS 置 `display: contents`（零视觉效果；`DshSettings.test` 断言其存在）。
- `harness/sub-components/ChannelRow.tsx`：旧行结构（`__row--stack`、
  `__version-list` / `__version-list-item[--current]`、picker + 固定宽 + 时间 +
  行内动作 / 行内任务、Portal 菜单 `__version-menu*`、徽章优先级
  当前 > 已装、勾号槽位常驻）+ `ChannelMenu`（RevealScrollbar）+
  `ChannelSizer`（双通道测量尺）。
- `harness/sub-components/VersionStatusRows.tsx`：`CurrentVersionRow`（单读数容器
  - 可选 hint + 卸载警告行）+ `FallbackReadout`（无插槽时的通用读数）+
    `MissingBannerRow`（缺失引导行，extraRows 才渲染；失败态只走读数，不再单列失败行）。
- `harness/sub-components/SourceCard.tsx`：`SourceRow`（SettingsSelect + 行内说明）
  - `SystemPathRow`（extraRows，旧 DSH 无此行）。
- `harness/sub-components/UpdateRow.tsx`：旧结构（`__version-actions` 控件组，
  check/install 行为缝不变，无 hint 文案的 check 模式）。
- `harness/sub-components/TaskRow.tsx`：独立卡改用 `__version-task*` 类（计数/百分比/
  取消；选择器形态不渲染本卡，任务走行内）。
- `harness/sub-components/LegacyChannelRows.tsx`：预发布版本号改用
  `__readout-value`（旧无对应新类已删）。
- `harness/sub-components/icons.tsx`：Check/Chevron 路径恢复旧版。
- `harness/sub-components/{InstalledVersionsCard,ManualVersionRow,ResetSourceRow}.tsx`：
  未动（结构本就与旧一致，类名已是中性）。
- `dsh/DshSettings.tsx`：插槽改为旧行内容——`sourceOptions`（DSH 三态文案）、
  `currentHint`/`stableHint`/`prereleaseHint`、`sourceNote`（行内警告）、
  `runtimeReadout`、`footer`（官方链接行，卡内末行）。移除 `missingBanner` 传递。
- `dsh/DshVersionReadout.tsx`：只渲染片段（容器由卡片提供），最新版本行改用
  `__latest`，其余类不变（徽章/骨架/副行）。
- `dsh/sub-components/DshOfficialLinksCard.tsx`：去掉自带卡片容器，只返回行
  （由卡片渲染为卡内末行）。
- `dsh/sub-components/DshVersionSourceNote.tsx`：说明 plain small，警告改用
  `__row-warn`（旧行内警告口径）。
- `dsh/sub-components/DshSourceSwitchDialog.tsx`：正文类改回
  `adl-dsh-source-dialog__message`（+ `--warn`），DSH 专属名保留。
- `dsh/dshVersionBridge.ts` / `opencode/opencodeVersionBridge.ts`：能力分别加
  `extraRows: 'none'` / `'manual+installed'`；其余逻辑零改动。
- `opencode/OpencodeSettings.tsx`：未动（同卡 + `sourceFooter` 终端行 + 桥能力）。
- `styles/regions/harness-version.css`：旧 `dsh-version.css` 逐条移植（见下表），
  无旧对应物的新类全部删除（`__value/__hint/__note/__channel/__channel-time/
__actions/__progress/__picker-check/__menu-item-action/__dialog-message`），
  根节点只剩 `display: contents`。
- `settingsSearchAnchors.test.tsx`：`harnessVersionManual` 移入条件行清单
  （DSH 默认不渲染；检索仍命中版本块，落点回退块锚点）。

## 旧 → 新类映射（`adl-dsh-settings__X` → `adl-harness-version__X`）

| 旧（基线）                                                                      | 新                                            | 备注                                                    |
| ------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| `__version-readout`                                                             | `__readout`                                   | 容器改由卡片提供，插槽只给片段                          |
| `__version-value[.is-empty]`                                                    | `__readout-value[.is-empty]`                  | 逐字移植                                                |
| `__version-latest`（副行/最新行共用）                                           | `__readout-sub`（副行）/ `__latest`（最新行） | 拆分，结构测试要求                                      |
| `__version-loading`                                                             | `__readout-loading`                           | 骨架值逐字移植                                          |
| `__badge[--update]`                                                             | 同名                                          | 逐字移植                                                |
| `__version-actions`                                                             | 同名                                          | 检查更新行控件组                                        |
| `__version-task[-stage-shimmer-count]`                                          | 同名                                          | 行内任务 + 独立卡复用                                   |
| `__action-btn[--danger]`                                                        | 同名                                          | `border: transparent` + `font-size` + `transition` 恢复 |
| `__row-warn`                                                                    | 同名                                          | 见下“中性色” deviations                                 |
| `__version-menu[-list-item-revert-version-time-badges-check-installed-current]` | 同名                                          | 几何/徽章/勾号槽位全移植                                |
| `__version-picker[-label-version-chevron]`                                      | 同名                                          | 固定宽 + `margin-right: auto`                           |
| `__version-list[-item--current-time-actions]`                                   | 同名                                          | `--current` 无 CSS（与旧一致）                          |
| `__row--stack`                                                                  | 同名                                          | 作用域改挂卡片根                                        |
| `__version-sizer[-item]`                                                        | 同名                                          | 测量尺全移植                                            |
| `__inline-link`                                                                 | 同名                                          | 官方链接行                                              |
| `__test-button*`                                                                | 未移植                                        | 卡片无此组件，避免死 CSS                                |
| `__source-mode`                                                                 | 未移植                                        | `dsh-settings.css` 已有，EnvDepRow 在用                 |
| `.adl-dsh-settings .adl-settings-dropdown`                                      | `.adl-harness-version .adl-settings-dropdown` | 来源下拉 160px                                          |
| `__dialog-message[--warn]`                                                      | `adl-dsh-source-dialog__*`（原名保留）        | DSH 对话框专属                                          |
| `--dsh-note-fg`（token 定义）                                                   | 删除                                          | 见下                                                    |

## 能力旗标

- `extraRows: 'none'`（缺省；DSH）：单卡 6 行，无手动行/已安装卡/系统路径行/
  缺失横幅行/独立任务卡。
- `extraRows: 'manual+installed'`（OpenCode）：主卡追加系统路径行 + 终端行 +
  手动行；另有已安装独立卡；任务走独立卡（无选择器形态）；其余行为缝
  （`updateAction` check/install、`taskPercent`/`taskCounts`、`resetSourceAction`、
  `channelPicker`、`sourceManaged`、`uninstallConfirm`、`sourceModeChange`）不变。

## 测试清单

- 新增 `harness/__tests__/HarnessVersionCard.structure.test.tsx`（9 用例）：
  单卡 + 旧 6 行顺序、来源行（SettingsSelect + `__row-warn`）、当前行读数
  （值/徽章）、picker 菜单（`__version-menu*`、版本/时间/徽章/check 槽、
  `aria-expanded/haspopup/selected`）、无新前缀残留、DSH 无手动/已安装；
  另 3 用例覆盖真实 `DshVersionReadout` 片段（无嵌套 readout、`__latest`、
  `role=status` 骨架、`is-empty`）。
- 更新：`HarnessVersionCard.test.tsx`（27，helper 缺省能力加 `extraRows`，
  来源行/延迟切换改走 SettingsSelect，check 槽类名跟进，缺失横幅用例等快照
  落定）；`DshSettings.test.tsx`（19，缺失横幅→读数「未安装」、来源切换改走
  下拉菜单、三态显隐去掉手动行）；`settingsSearchAnchors.test.tsx`
  （`harnessVersionManual` 条件化）。
- 行为零改动：`dshVersionBridge` / `opencodeVersionBridge` / 任务轮询 /
  parity / mock-opencode 测试未动（桥测试用 `toMatchObject`，新增旗标无影响）。

## 验证输出

- 相关域全量（2026-10-29，连续 2 次）：35 文件 / 482 测试，零失败。
  `vitest run harness dsh opencode components/settings styles i18n
mock-opencode harness-version-parity`。
  （中途 2 次单例失败：一次不明 flake，一次首帧快照竞态，已用
  `findBy`/落定等待加固，见 `74703a2d3`。）
- `pnpm run check:static` 全绿：lint（0 errors；11 warnings 皆为既有
  `vite.config`/`vitest.config` 风格警告）、typecheck、typecheck:dev、
  check:vite-config、format、check:i18n（1767/1767 一致）、glossary、
  dead-code（OK）、gen:check。
- 失败预算：死代码 `harnessVersionSourceHint` 无消费者 1 次（修：来源行缺省改回
  该 key），其余一次通过。

## Deviations（有意偏离旧实现）+ 原因

1. `--dsh-note-fg` accent 推导未复活：`__row-warn` 与
   `__version-menu-item-current` 文字色用中性 `var(--text-muted)`（hint-color
   规则；评审已采用的中性值）。`__version-menu-item-current` 底色保留旧
   `color-mix(accent 8%)`（非文字色，属旧值）。
2. 读数时间格式沿用 Intl 短格式（`harnessVersionFormat` 未动）：既有行为测试
   锁定该格式，旧 `YYYY-MM-DD HH:mm` 未恢复。
3. 行内操作按钮无 per-version spinner：`run()` 只有全局 busy；按钮禁用态保留，
   spinner 未移植（spec #1 已简化，结构测试未要求）。
4. 旧 `__version-list-item-time` 在任务进行时隐藏（与旧一致）；传统下拉形态
   （OpenCode）保留原生 `<select>`（行为缝）。
5. `DshSettings.test` 的「缺失横幅」用例改为读数「未安装」断言：旧 DSH 本就无
   此行，新契约以读数空态为准；OpenCode 形态的横幅覆盖保留在卡片单测。

## 评审风险

- `display: contents` 根节点：零盒子但改变 DOM 层级（调试工具的节点路径与旧
  差一层）；`DshSettings.test` 已锁定其存在。
- `settingsSearchIndex` 未改：`harnessVersionManual` 检索仍命中 dsh 版本块但
  落点回退块锚点（行不存在）。用户已批准 identical-or-better。
- OpenCode 视觉走新卡：未做双端人工验证（任务要求），终端行/传统下拉行在
  浏览器与 Tauri 的表现需 reviewer 目检。
- i18n 退役键（`dshCheckUpdate` 等）未复活，`keys.test` 退役断言继续通过；
  如未来需要旧行文案，需走新 key 流程而非恢复旧 key。
