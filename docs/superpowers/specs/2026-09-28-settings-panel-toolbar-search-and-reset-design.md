# 设置面板首行工具栏改造设计：搜索设置 与 恢复全部默认

- 日期：2026-09-28
- 范围：右侧面板 → 设置面板 → 首行工具栏左侧「搜索设置」按钮、右侧「恢复全部默认」按钮
- 变更层级：L3（架构变更 + 跨模块 + 新增执行入口）

## 1. 背景与现状

设置面板首行工具栏结构见 `SettingsPanel.tsx`：

- 左侧：折叠导航按钮 | 分隔线 | 「搜索设置」图标按钮（点击展开为输入框）
- 右侧：「恢复全部默认」文字按钮

现状实现要点：

| 关注点 | 现状 | 位置 |
|---|---|---|
| 搜索过滤 | `searchQuery` 非空时对 `settings` 数组按 label/description 过滤 | `SettingsPanel.tsx` `filtered` |
| 搜索态渲染 | `searchQuery` 非空时 `ActiveComponent = undefined` → 富组件被卸载，只剩通用扁平列表 | `SettingsPanel.tsx` |
| 搜索覆盖范围 | `settings` 仅含 `groupId='general'` 的 8 项 | `utils/settingsViewModel.ts` `buildSettingsItems` |
| 组内搜索 | 快捷键组自带独立搜索框（用于按键捕获） | `KeybindSettings.tsx` |
| 恢复全部 | `updatePreferences(getDefaultPreferences())` | `SettingsPanel.tsx` `handleResetAll` |
| 恢复覆盖范围 | 仅偏好 patch；不含浏览器下载模式/路径、DSH 下载源/代理、存储路径/树缓存/下载路径 | `shared/defaultPreferences.ts` |
| 组级恢复 | general/workspace/shortcuts 走 patch；storage/browser/dsh 走各组自有对话框与多步流程 | `settingsGroups.ts`、三组件 |
| 组级禁用态 | `disabledResetGroups` 覆盖六组，侧边栏行据此禁用 | `SettingsPanel.tsx` |
| 顶部按钮态 | 无 disabled、无 pending、无进度 | `SettingsPanel.tsx` |

### 已确认缺陷

**搜索**

- A1（严重）搜索范围名不副实：仅覆盖 general 组 8 项，其余五组关键词恒为「无结果」。
- A2（中）搜索态整组降级：富组件被卸载，即使命中也无法看到真实控件与所在组语境。
- A3（中）空状态笼统：仅显示 `noResults`，未说明覆盖范围，易被误判为「无此项」。
- A4（轻）无键盘快捷键（`mod+F`），tooltip 未提示。
- A5（轻）输入框固定 `width: 120px`。

**恢复全部默认**

- B1（严重）语义不符：名为「恢复全部」，实际不覆盖浏览器/DSH/存储三组；这三组各自有独立桥与自有流程。
- B2（中）无 disabled 态：侧边栏组级 reset 已有全默认禁用判定，顶部按钮缺失同源判断，全默认时仍可点击并提示成功。
- B3（中）无 pending/防重入：确认后按钮不 disable，可反复提交。
- B4（轻）确认框未列出恢复范围，也未提示范围外项。

## 2. 目标

1. 「恢复全部默认」真正聚合所有组，包含三组自有流程，且保留存储迁移的时机/保留源选择。
2. 「搜索设置」升级为跨全部组的**跳转式**搜索：命中项标注所属组，点击跳转到对应组并定位到该设置项。
3. 补齐两处按钮的状态完备性：禁用态、执行中态、进度、失败汇总。

### 非目标

- 不改动任何组级（侧边栏行）恢复默认的既有行为、文案与执行顺序。
- 不新增危险色按钮变体；沿用现有 `ConfirmDialog` / `.adl-confirm-dialog` 视觉。
- 不改动快捷键组的按键捕获能力。

## 3. 关键决策（已与需求方确认）

| # | 决策 | 结论 |
|---|---|---|
| D1 | 恢复语义 | 真·恢复全部，聚合所有组 |
| D2 | 执行能力来源 | 提取可编程执行入口（非串联 4 个确认框） |
| D3 | 部分失败语义 | 失败即停，已成功的保留不回滚，并输出汇总清单 |
| D4 | 存储核心路径 | 包含，但**排在最后**，并在确认框中强提示 |
| D5 | 搜索形态 | 统一索引 + 跳转式结果 |
| D6 | 与快捷键组内搜索的关系 | 共存：组内搜索保留（按键捕获），面板搜索负责跨组检索 |
| D7 | 存储应用方式 | 由用户在确认框中选择「下次启动迁移」/「立即迁移并重启」 |
| D8 | 保留源选项 | 与存储组现状**完全对等**：提供勾选，默认**不勾选**（即默认迁移后删除旧路径数据） |
| D9 | `mod+F` | 包含 |
| D10 | 模块切分 | 执行函数下沉 `shared/`，采用依赖注入以避免 `shared ↔ stores` 运行时循环 |

### D10 依据

`stores → shared` 已存在运行时依赖（如 `stores/actions/generalActions.ts` 引 `@shared/resolveTheme`、`editorActions.ts` 引 `@shared/outline`）。若 `shared/settings-reset/*` 反向运行时 import `@stores`，将形成 `stores ↔ shared` 循环。故 `shared/` 内函数不 import stores / React / i18n，改由调用方注入依赖。

## 4. 架构与模块边界

### 4.1 新增模块

```
src/shared/settings-reset/
  types.ts              GroupKey / GroupResetResult / ResetDeps / progress 回调类型
  downloadPathReset.ts  下载路径恢复纯序列（storage 与 browser 复用，消除重复）
  storageReset.ts       computeStorageResetPlan(deps) / executeStorageResetPlan(deps, plan)
  browserReset.ts       computeBrowserResetPlan(deps) / executeBrowserResetPlan(deps, plan)
  dshReset.ts           computeDshResetPlan(deps) / executeDshResetPlan(deps, plan)

src/app/components/settings/
  resetAllSettings.ts        编排器（组装 deps + 串行执行 + 汇总结果）
  ResetAllDialog.tsx         聚合确认框（范围清单 + 存储预检 + 迁移时机/保留源 + 进度）
  settingsSearchIndex.ts     跨组搜索索引构建
  SettingsSearchResults.tsx  按组分组的结果列表 + 点击跳转
```

### 4.2 契约

```ts
// shared/settings-reset/types.ts —— 零 React / 零 i18n / 零 stores
export type GroupKey = 'preferences' | 'browser' | 'dsh' | 'storage';

export type GroupResetResult =
  | { ok: true }
  | { ok: false; failedStep: string; error?: AppError };

export interface ResetDeps {
  storageBridge?: StorageBridge;
  updatePreferences: (patch: AppPreferencePatch) => Promise<boolean>;
  changeDownloadPath: (path: string, migrate: boolean) => Promise<IpcResult<DownloadSettings>>;
  updateDownloadSettings: (patch: Partial<DownloadSettings>) => Promise<boolean>;
  saveSourceConfig: (cfg: SourceConfig) => Promise<boolean>;
  refreshStorage: () => Promise<StorageStatus | null>;
  readConfig: () => AppConfig | undefined;
}
```

```ts
// app/components/settings/resetAllSettings.ts
export interface ResetAllOutcome {
  done: GroupKey[];
  failedAt?: GroupKey;
  failedStep?: string;
  skipped: GroupKey[];          // 因前置失败被跳过（含存储）
}
export function resetAllSettings(
  deps: ResetDeps,
  opts: {
    storagePlan: StorageResetPlan | null;   // 由确认框打开时预先计算并传入
    applyNow: boolean;
    retainSource: boolean;
  },
  onProgress?: (key: GroupKey) => void,
): Promise<ResetAllOutcome>;
```

`storagePlan` 由 `ResetAllDialog` 在打开时调用 `computeStorageResetPlan(deps)` 得到（用于展示预检文件数/体积、errors/warnings 与迁移选择）；`resetAllSettings` 不再自行计算，只负责按序执行。计划为 `null`（全默认或计算失败）时跳过存储组并计入 `skipped`。

### 4.3 执行顺序

```
1. preferences   updatePreferences(getDefaultPreferences())
                 覆盖 general + workspace + shortcuts + 终端预算 + 浏览器挂起（单次调用）
2. browser       executeBrowserResetPlan   （挂起 → 下载模式 → 下载路径）
3. dsh           executeDshResetPlan       （download source=auto + proxy=auto + 静默实测）
4. storage       executeStorageResetPlan(deps, opts.storagePlan)
                 （核心路径 → 预算 → 树缓存 → 下载路径；可能迁移文件 / 重启应用）
```

存储必须最后：其核心路径恢复可能触发 `restartApp()`，若排在中间会撕掉后续组。

### 4.4 依赖注入的落地

`shared/settings-reset/*` 函数不直接访问 store。`ResetAllDialog`（组件）通过 hook 取得 store action 与 bridge，组装 `ResetDeps` 后传给 `resetAllSettings`。

既有 `useDownloadPathReset`（`features/storage-settings/downloadPathReset.ts`）改为薄包装：调用 `shared/settings-reset/downloadPathReset.ts` 的纯序列 + 自身 toast，保证块级/组级行为不变。

## 5. 详细设计

### 5.1 搜索（跳转式）

**索引** `settingsSearchIndex.ts`

```ts
export interface SettingsSearchEntry {
  group: SettingsGroupId;
  anchorId: string;              // 稳定锚点，与该组 DOM 的 data-settings-anchor 对应
  labelKey: keyof CopyDict;      // 或已解析文本
  descriptionKey?: keyof CopyDict;
  keywords?: string[];           // 额外匹配词（如快捷键 id / 按键文本）
}
export function buildSettingsSearchIndex(...): SettingsSearchEntry[];
```

索引来源：

| 组 | 来源 |
|---|---|
| general | `buildSettingsItems()` 逐项 |
| shortcuts | `DEFAULT_COMMANDS` 逐命令（含 id / titleKey / 按键文本） |
| workspace | 就近声明（并发上限、优先级列表、延后列表） |
| storage | 就近声明各块（核心路径、树缓存、终端预算、浏览器下载、不可移动项等） |
| browser | 就近声明各块（性能挂起、下载模式、下载路径） |
| dsh | 就近声明各块（下载源、代理） |

**锚点约定**：各组可搜索块挂 `data-settings-anchor="<groupId>:<anchorId>"`。

**交互**

| 环节 | 行为 |
|---|---|
| 打开 | 图标按钮 / `mod+F`（仅当焦点位于设置面板内时响应，`stopPropagation`） |
| 过滤 | 输入即过滤索引（label / description / keywords） |
| 结果 | 按组分组，组标题复用 `SETTINGS_GROUPS` 的 labelKey；命中词高亮 |
| 跳转 | 点击结果 → 清空并收起搜索 → `setActiveGroup(group)` → 下一帧 `scrollIntoView({ block: 'center' })` 到锚点 + 约 1.2s 高亮 |
| 导航栏 | 搜索态保留可见（与跳转语义一致） |
| 空态 | 无任何命中 → `noResults`；沿用 `EmptyRow` 组件 |
| 收起 | `Esc` / 失焦（保留现有 returnFocus 行为） |
| 富组件 | 非搜索态维持现状（渲染富组件）；搜索态渲染 `SettingsSearchResults` |

**快捷键组共存**：`KeybindSettings` 组内搜索框保留（职责：按键捕获）。面板搜索负责跨组文本检索；两者互不替代。

### 5.2 恢复全部默认

**按钮状态**

- 禁用：`disabledResetGroups.size === SETTINGS_GROUPS.length`（六组全默认）。
  - `language` / `themeMode` 恒视为默认（已在 `isPatchSatisfied` 口径内），不会因语言/主题非默认而误启用。
  - storage / browser / dsh 聚合信号未知（null / undefined）时 fail-open 启用。
- 执行中：`resetting` 为真 → 按钮 disabled，不重复触发。

**契合确认框** `ResetAllDialog.tsx`（`createPortal`，复用 `.adl-confirm-dialog` 样式）

打开即显示：

1. 范围清单：偏好（通用/工作区/快捷键）、浏览器、DSH、存储
2. 存储行进入 `计算中…`，并行执行 `computeStorageResetPlan()`
3. 存储计划就绪后：
   - 核心需恢复 → 显示预检汇总（文件数 / 体积）、errors / warnings、「保留源」勾选（默认不勾）、双确认键「下次启动时迁移」/「立即迁移并重启」；预检有 error → 两键禁用
   - 核心无需恢复 → 单确认键
   - 计划计算失败（如桥缺失）→ 存储行标注「跳过（原因）」，其余组仍可执行，汇总中注明

**执行**

- 顺序：preferences → browser → dsh → storage（见 4.3）
- 进度：逐组打勾；执行中禁用关闭/取消/遮罩点击（存储迁移不可中断）
- 失败：立即停止；不再执行后续组；存储被跳过时在结果中标注
- 成功：`settingsResetComplete`
- 重启：存储若 `applyNow && restartRequired` → 已在最后一步，先完成其余组，再沿用现有重启提示文案

**保留源与迁移时机**：与存储组现状完全对等——`retainSource` 默认 `false`（迁移成功后清理旧路径数据），用户须主动勾选才保留旧数据。

**错误处理规范**

- 执行函数不吞错，统一返回 `GroupResetResult`
- 编排器与组内 wrapper 走 `clearError` / `captureError`，`scope = 'settings'`
- 不改动既有组级 toast 文案

**i18n**：所有新增文案（搜索空态分组、跳转提示、聚合确认框标题/清单/进度/汇总/迁移时机与保留源说明）必须走 i18n key，中英双语齐备。

## 6. 测试

变更层级 L3 → 收尾执行全量测试。

| 层 | 用例 |
|---|---|
| shared 单测 | `resetAllSettings` 顺序（preferences→browser→dsh→storage）；失败即停（browser 失败 → dsh/storage 不被调用）；storage 仅在其他全成功时执行；`onProgress` 逐步触发；`ResetAllOutcome.done/skipped` 正确；`computeStorageResetPlan` 全默认 → null、桥缺失 → 结构化失败；`downloadPathReset` 成功/失败聚合 |
| 索引单测 | 每组至少 1 条；每条 `anchorId` 在对应组渲染后必存在（逐组 jsdom 挂载，断言 `[data-settings-anchor]` 集合 ⊇ 索引锚点）；快捷键条目含按键文本；general 条目由 `buildSettingsItems` 派生 |
| 面板组件 | 搜索 → 分组结果 → 点击切组 + 锚点高亮；空态 `noResults`；`mod+F` 打开搜索；六组全默认时按钮禁用；确认框含范围清单 + 存储预检 + 双确认键 + 保留源默认不勾；进度渲染中取消禁用；失败汇总文案列出已完成/失败/跳过 |
| 回归门禁 | 既有 `SettingsPanel.test` / `BrowserSettings.test` / `StorageSettings.test` / `DshSettings.test` / `KeybindSettings` 全绿；组级 reset 的 toast 文案与执行顺序不变；快捷键组内搜索仍可用 |

## 7. 风险与对策

| # | 风险 | 对策 |
|---|---|---|
| R1 | 提取重构改变组级 reset 行为 | 组件 wrapper 仅做「调 shared + 本地草稿重播种」；既有测试作为回归门禁 |
| R2 | 组级用「开框快照」判定迁移，编排器无对话框 | 编排器读执行时实时值（有先例：组级清单即用实时值，块级才用快照） |
| R3 | 重启中断后续组 | storage 排最后；其前失败则跳过存储 |
| R4 | 索引锚点漂移 | 「锚点必存在」测试锁定 |
| R5 | `mod+F` 与编辑器/浏览器 Find 冲突 | 仅当焦点在设置面板内响应 + `stopPropagation` |
| R6 | 索引遗漏新块导致漏搜 | 索引条目就近声明于各 feature 模块；测试至少保证已登记项锚点存在 |
| R7 | `shared/` 反向依赖 stores 成环 | 依赖注入（D10）：shared 不 import stores / React / i18n |

## 8. 受影响文件清单

**新增**

- `src/shared/settings-reset/types.ts`
- `src/shared/settings-reset/downloadPathReset.ts`
- `src/shared/settings-reset/storageReset.ts`
- `src/shared/settings-reset/browserReset.ts`
- `src/shared/settings-reset/dshReset.ts`
- `src/app/components/settings/resetAllSettings.ts`
- `src/app/components/settings/ResetAllDialog.tsx`
- `src/app/components/settings/settingsSearchIndex.ts`
- `src/app/components/settings/SettingsSearchResults.tsx`

**修改**

- `src/app/components/settings/SettingsPanel.tsx`
- `src/app/components/settings/KeybindSettings.tsx`（注册搜索索引 + 锚点）
- `src/app/features/workspace-settings/WorkspaceSettings.tsx`（锚点）
- `src/app/features/storage-settings/StorageSettings.tsx`（改用 shared 执行 + 锚点）
- `src/app/features/storage-settings/downloadPathReset.ts`（hook 改为薄包装）
- `src/app/features/browser-settings/BrowserSettings.tsx`（改用 shared 执行 + 锚点）
- `src/app/features/dsh/DshSettings.tsx`（改用 shared 执行 + 锚点）
- `src/app/i18n/zh-CN/settings.ts`、`src/app/i18n/en-US/settings.ts`（新增 key）
- 相关 `__tests__/` 与 `*.test.ts(x)`

## 9. 未决项

无。
