# dsh-port — R2 / rev7 定向复核报告（rev6 F1 关闭核对 + 清理回归扫描）

## 范围

- rev：7，scope：`dsh-port`（manifest `### dsh-port` 共 35 个文件）；只看 rev7 快照与当前源码，未复用旧 diff。
- 复核对象：rev6 主表唯一 finding（high：去掉双层清态后 `resolveDshPortConflict` 在无 pending 的种子状态路径变 no-op，`DshPortConflictDialog` 两条用例会红）的关闭情况，以及本轮「清态移回 action、resolver 只解除 pending」是否引入新死代码 / 重复守卫 / 行为回归。
- 只读：未跑 `git diff/log/show`，未改源码/配置，未跑测试套件 / `check:*` / dev server / 浏览器，**未占用任何端口**；唯一写入是本报告。测试有效性用删除性推演（简报 §5.1 允许），未实跑 vitest。
- 主要阅读：`stores/actions/dshActions.ts`（:66-86、:141-193、:195-251、:283-360）、`features/dsh/DshPortConflictDialog.tsx`、`components/ConfirmDialog.tsx`、`features/dsh/DshPortConflictDialog.test.tsx`、`features/dsh/dshAuthUrl.ts` 与 `.test.ts`、`features/center/__tests__/{CenterEntryPage.test.tsx,useCenterBrowserAddressSubmit.test.ts}`、`features/browser/__tests__/useBrowserPanelAddressSubmit.test.ts`、`stores/actions/__tests__/dshActions.test.ts`、`stores/{StoreState.ts,slices/dshSlice.ts}`；并用全仓 grep 核对四处符号（`resolveDshPortConflict` / `setDshPortConflict` / `pendingPortConflict` / `askDshPortConflict`）的读写点。

## 上轮问题关闭情况（逐条）

- **F1（high）「无 pending 时 `resolveDshPortConflict` 变 no-op，确认框清态用例必红」→ 已关闭。**
  - 最终实现（`dshActions.ts:248-251`）：
    ```ts
    resolveDshPortConflict: (accept: boolean) => {
      get().setDshPortConflict(null);
      pendingPortConflict?.(accept);
    },
    ```
    清态是无条件的，不再依赖 resolver 是否存在。
  - `askDshPortConflict` 的 resolver（`:187-190`）只剩 `pendingPortConflict = null; resolve(accept);`，不再清 store 态；全仓 grep 确认 `setDshPortConflict(null)` 唯一调用点就是 action（其余调用点是 `askDshPortConflict:191` 置 info 与 slice 定义/测试播种）。
  - 无 pending 路径：`DshPortConflictDialog.test.tsx:56/66`（确认）与 `:70-96`（取消）直接 `setDshPortConflict(...)` 播种、不经过 `ensureDshUrl`，此时 `pendingPortConflict === null`；点击 → `resolve(true|false)` → `setDshPortConflict(null)` 生效，`pendingPortConflict?.()` 为空操作，两条 `toBeNull()` 断言恢复。
  - pending 路径：`dshAuthUrl.test.ts:78-94`、`CenterEntryPage.test.tsx:163-172`、`useCenterBrowserAddressSubmit.test.ts:225-232`、`useBrowserPanelAddressSubmit.test.ts:348-356`、`dshActions.test.ts:347-355` 都是「ensure/open 进行中 → 断言 `dshPortConflict` 非 null → `resolveDshPortConflict(...)` → 等 promise 落定」，断言（`{canceled:true}` / `force=true` / 不导航 / `toBeNull()`）仍由同一 action 驱动；`ensureDshUrl` 的续体在 `:229-233` 只读 `accepted` 布尔，不读 store 字段，清态先于续体不影响决策。
  - 删除性推演：删掉 `:249` 的 `setDshPortConflict(null)` → `DshPortConflictDialog.test.tsx:66`、`:96` 与 `CenterEntryPage.test.tsx:172` 三处必红；删掉 resolver 内的 `pendingPortConflict = null`（`:188`）→ 已决议的 resolver 会留在模块变量里，下一次 `resolveDshPortConflict` 会对已 settle 的 promise 二次调用并吃掉本次 `accept`（当前无用例覆盖，但属必要清理，非重复守卫）。因此本轮修复点有真实回归保护。

## 新增发现

无。

补充核对（均为通过，不单列 finding）：

- **清态次数**：pending 路径每次用户选择只在 `resolveDshPortConflict:249` 写一次 store；resolver 不再碰 store（`:187-190`），双层清态确未回潮。`askDshPortConflict:191` 是「置 info」，与清态不是同一路径。
- **职责划分**：`pendingPortConflict` 变量由 resolver 自己置空（因为 `resolveDshPortConflict` 不再在调用前摘变量），store 字段由 action 清；两处写入互不重叠，不构成重复守卫。模块变量仅在 `:76`（声明）、`:187-188`（安装/自清）、`:250`（消费）出现，无死代码。
- **行为回归**：清态发生在 `pendingPortConflict?.(accept)` 之前，与 rev5 的 resolver 内「先清态再 resolve」对观察者顺序一致（store 先变 null、promise 后 settle）；`ConfirmDialog` 只回调 `onConfirm/onCancel`（`ConfirmDialog.tsx:71,80`），卸载不触发额外回调，故无「点一次触发两次」风险；重复点击的第二次是 `set(null)` + 空 resolver 的空操作（幂等）。Zustand 对该字段无副作用订阅者（全仓仅 `DshPortConflictDialog` 读），`setDshPortConflict(null)` 不会同步重入 `ensureDshUrl`。
- **注释/契约**：`dshActions.ts:75`「resolve 由 `resolveDshPortConflict` 触发」、`:182`「由 `resolveDshPortConflict` 解除」、`:244-247` 的 JSDoc、`StoreState.ts:401`、`dshSlice.ts:80-85` 均与最终实现一致；未出现「新请求会先结束旧等待」之类的旧措辞残留（全仓 grep 无）。
- **调用方契约**：`DshPortConflictDialog.tsx:52-53` 仍只调 `resolve(true|false)`，不自行清态/关框；清态回到 action 后组件无需改动，4 文件测试面的前提成立。

## 记录不修

- **rev6「记录不修」清单维持**（重复 toastSlice 测试、确认框默认焦点、加载 toast 用 `warning`、`wasRunning` 判据、确认框 Promise 无超时、`PortOccupant.cmdline` 未展示、后端错误文案未 i18n、文档留 P5）：逐条复读本轮涉及的源码仍成立且未扩大。
- **`resolveDshPortConflict` 的 JSDoc 只描述 `accept=true` 的 force 重启**，未提「无 pending 时仅关闭确认框」；措辞不假、调用方只有确认框组件，属可选补全，非本轮回归。
- **`DshPortConflictDialog.test.tsx:24` 的 `t` 用 `as unknown as CopyDict` 做部分文案夹具**：属于测试夹具的形状收窄，不是「绕过类型读私有状态」的断言替代；与仓库既有测试写法一致，维持不修。
- **文档类（P5）**：ADR 0035、`docs/**`、进度文件的事实/措辞同步留给 P5，不计入本表。

## 结论

- rev6 F1 已完整关闭：无 pending 的种子状态路径恢复清态（两条确认框用例恢复绿色），pending 路径仍只清一次，且 resolver 自清模块变量的职责未丢。
- 未发现本次清理引入的新死代码、重复守卫或行为回归；清态与 pending 解除的顺序对调用方与测试均无可观察差异。
- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）— 本轮零问题。
