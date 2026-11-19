---
description: Desktop UI verification workflow - must restart app after UI changes
globs: adlo/frontend/**
alwaysApply: false
---

# 桌面端 UI 验证

## 核心规则

修改桌面端 UI 后，必须重新运行应用以验证效果。**主观 UI/UX 验收由用户完成；CSS 选择器、层叠关系、主题 token 或布局变更还必须做机械计算样式验证**：用 `node adlo/scripts/ui-probe.mjs --url <预览地址> --selector <css> --props <属性>` 读取亮暗两套计算值，或使用环境内置 browser 工具的 `getComputedStyle`；不能只靠截图/肉眼。

## 适用范围

| 路径                    | 说明       |
| ----------------------- | ---------- |
| `frontend/src/**/*.tsx` | React 组件 |
| `frontend/src/**/*.css` | 样式文件   |

## 验证流程

1. 修改 UI 代码
2. 运行 `pnpm --dir frontend run dev` 或 `cargo tauri dev`
3. 验证视觉效果与交互功能
4. **双端验证**：在 Tauri 桌面和浏览器模式下分别确认功能一致

### 可选自动化冒烟

桌面-only 交互（标题栏/面板开合、窗口几何、真实 IPC）可先跑 `pnpm run e2e`（命令与前置见 [commands.md](commands.md#测试命令)，流程见技能 `desktop-e2e-wdio`）。**自动化通过 ≠ 视觉验收通过**：仍须按上方清单在真实窗口内人工确认。

### 样式回归锁

改/新增 CSS 时，凡是「被改回去就会出错」的关键约束（flex 方向、居中、层叠顺序、宽度上限），在 `frontend/src/styles/*.test.ts` 补一条规则锁：

- 复用 `src/styles/testing/cssRules.ts` 的 `findRuleGroups` / `ruleBody`（单一真源，禁止复制解析实现）；既有 13 个样式锁可作范例。
- 锁只钉声明字符串，真实级联仍按上一节的 `getComputedStyle` 取证；两层各管一半。
- 交付前做删除性推演：删掉该声明，锁必须变红。`check:changed` 只改 CSS 时会跑 `src/styles` 下的样式锁，因此这是日常门禁能覆盖到的退化路径。

## 验证手段排障（2026-11-13）

- **内置 browser 工具**：`screenshot` 要求桌面窗口可见；报 `needs visible tab` 时改用
  `getComputedStyle` 断言，不要反复重试。标签 ID 会过期，操作前用 `tabs.list` 重取；
  `evaluate` 的入参名是 `script`。
- **面板浏览器连不上 dev 应用**：`pnpm dev*` 的窗口带实例令牌，把启动行打印的地址粘进 Review
  面板页会拿到 CORS 报错或 502 —— 这是设计使然，不是服务坏了。要读真实窗口按下面的 CDP 端口走，
  或把用户当「手」（编号步骤 + 预期日志）。
- **Review 面板页的时间轴可能恒为 0**：即使 `document.visibilityState === 'visible'`，面板内嵌页的
  `document.timeline.currentTime` 也可能一直停在 0（未合成/被遮挡），此时任何 `getAnimations()`
  读数都不可信 → 换 CDP 或真实窗口，不要在面板页上反复断言。
- **动画类改动**：窗口不可见时浏览器会冻结动画时钟（`getAnimations()` 的 `currentTime` 恒为 0），
  中间帧无法测量。开屏已提供 dev-only 钩子：`?adl-splash-at=<ms>` 定格时间轴、
  `?adl-motion=reduce` 复现 reduced-motion；新增其它长动画时按同样方式加钩子再验证。
- **「定格了一帧」≠「动画在走」**：定格钩子只把时间轴钉到某个毫秒，不能证明动画真在推进。要证明活性
  用采样：临时在组件里打 `[DBG-<name>]`，读 `getAnimations({ subtree: true })` 的 `playState` 与
  `currentTime`（0/400/1600/2800ms 各一次），经调试日志落到 `.adl-logs/debug-logs.txt`；判据是
  `playState === 'running'` 且 `currentTime` 递增。2026-11-14 开屏事故正是靠这条定位到「钩子把动画
  pause 在首帧」，只靠肉眼/截图无法区分「没播」与「播了但内容透明」。

### 真实 WebView2 的 CDP 验证（不改源码）

需要读取真实 Tauri 窗口的计算样式、点击链路或控制台时，用 WebView2 官方环境变量打开 CDP 端口：

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
pnpm --dir adlo run dev:tauri
# 另一个终端
Invoke-RestMethod http://127.0.0.1:9222/json
```

- WebView2 运行时会把该变量**追加**到每个 WebView 的 additionalBrowserArguments；主窗口、面板、中心区与静默 WebView 仍共享同一份参数，不会触发 `0x8007139F`。
- 只在需要时设置；验证完执行 `Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 并重启应用。
- **不要把 `--remote-debugging-port` 写进源码或 `tauri.conf.json`**：CDP 端口会把页面暴露给本机其它进程；`check:changed` 的 source hygiene 会拦截这类提交。
- 端口被占用时换一个；连接后仍按核心规则读 `getComputedStyle` / 真实点击，不要用截图或肉眼代替。

## 验证清单

修改 UI 后必须在 Tauri 桌面和浏览器模式下分别验证：

| 验证项                                              | 差异说明                                                  |
| --------------------------------------------------- | --------------------------------------------------------- |
| 窗口控制按钮                                        | Tauri: 可实际操作; 浏览器: 仅显示                         |
| 标题栏拖拽                                          | Tauri: 可拖拽; 浏览器: 不可拖拽                           |
| 拖拽打开工作区                                      | Tauri: `onDragDropEvent`; 浏览器: HTML5 `dragover`/`drop` |
| 主题/语言切换                                       | 两模式一致                                                |
| 文件树/变更面板                                     | Tauri: Rust 后端; 浏览器: Preview API                     |
| 终端面板（多会话/Shell 切换/命令执行）              | Tauri: Rust PTY; 浏览器: Node.js `child_process.spawn`    |
| Tooltip 方案（自定义组件/原生 `title`）双端一致检查 | 两模式一致                                                |
| 终端主题同步 / 空状态按钮组                         | 两模式一致                                                |

## 相关文件

- [mandatory-testing.md](./mandatory-testing.md)
- [design-system.md](./design-system.md)
- 技能 `desktop-e2e-wdio`（`adlo/e2e/` 的自动化冒烟）
