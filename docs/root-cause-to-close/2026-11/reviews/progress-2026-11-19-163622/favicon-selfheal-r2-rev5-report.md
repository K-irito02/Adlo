# P4 R2 rev5 审查报告 — favicon-selfheal

## 范围

- 快照：`.review-diffs/*-rev5.diff`（`manifest-rev5.md`，base `ab91161741fc569c03281c5c7e23456f57289682`），只审 rev5，未复用旧快照、未看增量 diff。
- 本轮清单（10 个）：`adlo/frontend/src/app/components/BrowserFavicon.tsx`、`adlo/frontend/src/app/components/__tests__/BrowserFavicon.test.tsx`、`adlo/frontend/src/app/features/browser/faviconSelfHeal.ts`、`adlo/frontend/src/app/features/browser/__tests__/faviconSelfHeal.test.ts`、`adlo/frontend/src/app/features/browser/browser-landing/ShortcutCard.tsx`、`ShortcutCard.test.tsx`、`ShortcutGrid.css`、`adlo/src-tauri/src/commands/browser.rs`、`adlo/scripts/check-rust-changed.mjs`、`adlo/scripts/dev-tools.test.mjs`。
- 变更面：对比 rev4 快照字节数，本轮只有 `BrowserFavicon.tsx`（3502 → 9268）与其测试（2501 → 4461）变化，其余 8 个 scope 文件与 rev4 逐字节一致（rev4 的 R2 结论对其继续成立）；本轮实质审查集中在 `BrowserFavicon` 的 URL 归属修复。
- R2 视角：死代码 / 冗余守卫 / 根因修复后多余的防御 / 应删或降级的诊断日志 / 测试重复覆盖与空断言。
- 只读核对（未修改）：`frontend/src/app/utils/siteMetaCache.ts`（`isSiteMetaResolvedOrRedirected` / 镜像命中语义）、`stores/slices/browserTypes.ts` 与 `browserLandingSlice.ts`（`ShortcutSite.icon` 唯一写入路径）、`stores/slices/../persisted` 快捷站点持久化、`src-tauri/src/commands/browser.rs`（`get` / `warmup` / 新函数与单测）、`scripts/check-rust-changed.mjs` 全文。
- 约束遵守：未运行 `git diff/log/show`，未改源码/配置，未跑测试套件，未启动 dev server / 浏览器 / headless Chrome。**端口：无**（未使用任何端口，无后台进程残留）。

## 上轮问题关闭情况（逐条）

- **R2 rev4 F1（`BrowserFavicon` 自愈 effect 缺 URL 归属判定，会给新页提前发一次补抓）**：**已关闭。**
  - 归属成对落地：新增 `resolvedEmptyUrl`（`BrowserFavicon.tsx:136`）与 `exhaustedUrl`（`:148`），全部写入点统一走 `markResolvedEmpty` / `markExhausted`（`:161-177`）在同一个回调里成对 `setState`（React 同事件/同 effect 内批量提交）。逐条核对写入点：`applyMetaUpdate`（`:186` / `:194`）、URL 重置 effect（`:217` / `:219`）、5s 降级计时器（`:331`）、重试耗尽分支（`:374`）均已改为 `mark*`；grep `setResolvedFaviconEmpty|setExhaustedSrc` 确认文件内已无绕过归属的直接写入（两个 setter 只出现在 `:164` / `:173`）。
  - 读取侧：`resolvedEmptyForUrl = resolvedFaviconEmpty && resolvedEmptyUrl === url`、`exhaustedForUrl = Boolean(exhaustedSrc) && exhaustedUrl === url`（`:415-416`），自愈 effect 改用两者且依赖数组同步（`:417-428`）。换页那次提交里两个归属值仍是旧 URL ⇒ 派生布尔为 false ⇒ 不会给新页提前 `ensureSiteFavicon`；随后 URL 重置 effect 把两个归属刷成新 URL，才允许按新页自己的事实触发。
  - 回归保护：`does not carry an exhausted source across a URL change`（`__tests__/BrowserFavicon.test.tsx:296-323`）先让 A 页外链图标耗尽重试并断言 A 收到 `{force:true}`，`mockClear()` 后 `rerender` 到 B 页断言未调用。删除性推演：把 `exhaustedForUrl` 改回 `Boolean(exhaustedSrc)`，换页提交里 `exhaustedSrc` 仍是 A 的 URL（真值）⇒ effect 会以 B 发 `{force:true}` ⇒ 该断言变红（与主代理回退实测一致，本次未实跑）。
  - 同时上一轮「记录不修」的 **force 分支无回归保护**已被 `force-refreshes once the external icon exhausts its retries (spinner mode)`（`:270-294`，fake timers 连发 7 次 `error` 后断言 `{ force: true }` 且仅一次）覆盖，该项关闭。
- **R1 rev3 结论（零问题）与 rev1/rev2/rev4 的「记录不修」项**：这 8 个文件本轮字节未变，维持；按派发要求不复报（TOCTOU、跨层重复补抓、冷却表无淘汰、ShortcutCard FIFO、Rust 新分支无自动化用例、`ShortcutSite.icon`、`browser.rs` 行数、ui-manual 证据）。

## 新增发现

无。（主表为空。）

### 记录不修 / 观察（不进入主表）

- **修复的「空图标」一侧没有换页回归用例**：`resolvedEmptyForUrl` 的 URL 判定同样修掉了 rev4 F1 的另一半（A 页已结算空图标 → 换到 B 页时 `preferredSrc` 仍为空，旧值会让 B 提前补抓），但删除性推演里只有 `exhaustedForUrl` 有对应用例：把 `resolvedEmptyForUrl` 改回 `Boolean(resolvedFaviconEmpty)`，现有 3 条自愈用例（`:254`、`:263`、`:270`）都不含「A 已结算空 + 换页到 B」场景，不会变红。可在后续顺手补一条（A 页 `mirrorFavicon(url,'')` → rerender 到未结算的 B，断言未以 B 调用 `ensureSiteFavicon`）。按既有校准（rev4 对同类无覆盖分支记「记录不修」）不列入主表。
- **成对状态未沿用文件内已有的单 state 约定（设计/可读性，非缺陷）**：同文件 `probe = { src, ownerUrl }`（`:120-126`）的注释明写「两者放在同一个 state 里，保证渲染闭包看到的 src 与 ownerUrl 永远来自同一次提交」；本轮用两个独立 `useState` + 回调内批量 `setState` 达到同样效果（当前所有写入都经 `mark*`，不会拆对），但若将来有人直接调 setter 会静默失去原子性。另 `:134-135` 的注释「上述两个失败事实」写在只声明了 `resolvedFaviconEmpty`/`resolvedEmptyUrl` 的位置，`exhaustedSrc`/`exhaustedUrl` 在下方才声明，措辞位置略超前。纯可读性，不阻塞。
- **Rust `has_favicon` 与 tracing 字段同名不影响编译**：`browser.rs:586` / `:617` 的 `has_favicon = fav_present` 是 tracing 字段名而非局部变量，不构成与 `:297` 新函数的遮蔽/冲突（已核对）。
- **诊断日志复核（本轮变化面）**：`BrowserFavicon` 未新增日志；rev5 新增代码无临时 console，无应删/降级项。Rust 侧日志 rev5 未改动，rev4 的复核结论继续成立。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——**本轮零问题**。
