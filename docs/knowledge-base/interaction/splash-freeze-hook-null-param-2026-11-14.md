# 开屏定格钩子把「参数缺失」当成 0ms（2026-11-14）

## 背景

开屏（`StartupOverlay`）为了能在**窗口不可见**时截图验证中间帧，加了一个 dev-only 定格钩子：`?adl-splash-at=<ms>` 把整条时间轴设到指定毫秒并 `pause()`。

上线后（开发态）用户报告：启动后只有纯黑（暗主题）/纯白（亮主题）底色 3–4 秒，没有任何 logo、名称或网格，然后直接进主界面。浏览器里同一页面却完全正常。

## 根因

```ts
const at = Number(params.get('adl-splash-at'));   // 无参数时 params.get() 返回 null
if (!Number.isFinite(at) || at < 0) return;      // Number(null) === 0 → 通过校验
animation.currentTime = at;                      // = 0
animation.pause();                               // 冻结在首帧
```

`Number(null) === 0`。于是**普通启动（URL 无参数）被当成"请把时间轴定格在 0ms"**，7 条开屏动画全部停在首帧 —— 而首帧恰好是各入场动画的起始态（`grid`/`mark`/`name` 为 `opacity: 0`、`rule` 为 `scaleX(0)`、`sweep` 移出视野），屏幕上只剩覆盖层自己的背景色。

关键排除步骤：先入为主怀疑"窗口 `visible:false` 导致隐藏期冻结动画时钟"，但用户在**窗口可见**后 `Ctrl+R` 仍黑屏，该假设被否证；真正的证据来自埋点采样 `getAnimations()`：`playState` 从 `running` 变 `paused`、`currentTime` 恒为 0，而计算样式里的 `animation-play-state` 仍是 `running` —— 说明是 **Web Animations API 主动 pause**，进而定位到唯一调用 `pause()` 的代码。

## 修法

把"参数缺失/空串/纯空白"与"显式 0"分开：

```ts
const raw = new URLSearchParams(search).get('adl-splash-at');
if (raw === null || raw.trim() === '') return null;   // 缺失 ≠ 0
const at = Number(raw);
return Number.isFinite(at) && at >= 0 ? at : null;
```

并在测试里同时钉住两个方向：无参数时**不得**调用 `pause()`、`currentTime` 保持 `null`；带参数时 `currentTime` 等于指定值且 `pause()` 被调用。

## 可复用教训

1. **`Number(x ?? 0)` / `Number(null)` 是"可选数字参数"的经典陷阱**：缺失会被当成 0。凡是"0 也是合法值"的参数（时间轴、偏移、索引、音量），必须显式判断 `null`/空串，不能依赖 `Number()` 的强制转换。
2. **`Number(' ')` 也是 0**：只判 `null` 不够，空串与纯空白要一起挡（`trim() === ''`）。
3. **动画类问题先看 `getAnimations()` 的 `playState` 与 `currentTime`**，再看计算样式。`animation-play-state` 显示 `running` 但 `playState` 是 `paused`，几乎可以断定是 JS 侧 `pause()`（或文档时间轴被冻结）。
4. **隐藏窗口会冻结动画时钟**（本仓规则 `desktop-ui-verification.md` 有记）。因此"窗口不可见时"的验证需要定格钩子；但也正因为有这个钩子，才引出了本次回归 —— dev 工具本身要按"生产默认路径也必须正确"来写。
5. **先否证最像的假设，再相信证据**：`visible:false` 那套理论能解释现象、也有文档佐证，但一次 `Ctrl+R` 就把它排除了。用户 30 秒的实测胜过两小时的推理。

## 相关位置

- `adlo/frontend/src/app/components/splashDebugParams.ts` — 参数解析（纯函数，11 条用例）
- `adlo/frontend/src/app/components/__tests__/StartupOverlay.test.tsx` — 接线用例（`Element.prototype.getAnimations` 桩）
- `adlo/frontend/src/app/components/StartupOverlay.tsx` — 钩子调用点
