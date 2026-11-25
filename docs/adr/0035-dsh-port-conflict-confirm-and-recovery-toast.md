# DSH 端口占用先确认，断连自动恢复并提示

## 背景

DSH 固定使用 3080。旧 `/dsh/open` 在拉起前会静默结束命令行识别为 dsh 的端口占用者（包括用户自己 `npx @deepseek-ai/dsh web` 启动的外部实例）；非 dsh 占用则返回错误。断连恢复虽然会自动 spawn，但入口页在约 20 秒内没有任何可见反馈，用户会反复点击。

## 决定

1. **端口占用不静默杀进程**：`/dsh/open` 默认返回 `status="port_occupied"` + `occupant`（端口、进程 pid/name/cmdline/isDsh），不结束任何进程。前端在 App 根部挂载确认框，说明占用者并提供「结束并重启 / 取消」；确认后以 `force=true` 重新调用，后端结束占用者并拉起项目内 DSH。
   - 文案（2026-11-25 用户选定「简洁友好」）：标题「无法打开 DeepSeek Harness」；单进程正文「3080 端口正被{processes}使用。」，多进程正文「3080 端口正被以下进程使用：」+ 逐行列表；问句前先放警告「其中还有其它程序，结束它们可能会影响正在使用它们的应用。」再问「要结束占用并重启应用内的 DeepSeek Harness 吗？」；按钮「结束并重启 / 取消」。
   - 阅读顺序固定为「说明 → 进程列表 → 警告 + 问句」：单进程内联在正文里，多进程逐行列出。若占用者无法识别（进程列表为空），不弹空列表确认框，直接提示「无法识别占用 3080 端口的进程，请手动结束后再试。」并中止。
2. **断连自动恢复 + 常驻加载提示**：端口空闲但托管进程已死时直接重新拉起；请求超过 1.2 秒才显示加载型 toast（避免秒开的正常情况也弹提示）。文案按拉起前是否已有运行实例区分：首次启动「正在启动 DeepSeek Harness…」，断连恢复「正在自动恢复…」。toast 文字使用项目统一的扫光效果（`adl-text-shimmer`，与加载行/按钮忙碌态同一套 keyframes），**常驻直到承载 DSH 的标签页打开**（`dismissDshRecoveryToast`），失败/取消/桥抛错/被新提交取代时立即收起。加载型 toast 与普通 toast 分槽：普通提示不会清除它，只有新的 `showLoadingToast` 才替换；未提供手动关闭按钮，由调用方负责收起。入口保持 `aria-busy`，重复点击复用同一在途请求。
3. **单一解析器**：中心入口页、欢迎页快捷站点/本地端口、中心/面板地址栏、浏览器树共用 `ensureDshUrl`（store action）；端口确认与恢复提示只实现一次，避免只修某个入口。
4. **`pre_start` 不触发确认**：启动期预拉起遇到端口占用时记录并跳过，用户点击打开时才弹确认框。

## 后果

- 用户显式启动的外部 DSH 不会被应用静默杀掉；需要强制接手时必须确认。
- 断连恢复仍有约 20 秒的等待，但用户能看到常驻的「正在自动恢复…」扫光提示，直到 DSH 标签打开才收起。
- 非 dsh 占用进程的结束也需用户确认；确认框会额外提示「其中还有其它程序」，且警告放在问句之前。

## 相关

- 后端：`adlo/crates/server/src/handlers/dsh.rs`（`PortPolicy`、`port_occupants`、`kill_port_occupants`、`open`）
- 前端：`adlo/frontend/src/app/stores/actions/dshActions.ts`（`ensureDshUrl`/`openDsh`/`resolveDshPortConflict`）、`DshPortConflictDialog.tsx`
- 测试：`dshActions.test.ts`、`dshAuthUrl.test.ts`、`CenterEntryPage.test.tsx`、`DshPortConflictDialog.test.tsx`、`Toast.test.tsx`、`toastSlice.test.ts`、`dsh.rs` 单测
