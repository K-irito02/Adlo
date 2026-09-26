# 设置组级恢复与防抖草稿竞态（双重防护）

> 来源：2026-09-26 浏览器设置组 Phase 4 审查（F1）。关联：`settings-debounce-race-fake-timers-false-pass-2026-09-23.md`。

## 问题

自定义输入（500ms 防抖，草稿存 `pendingRef` + `setTimeout`）在途时，用户触发**组级恢复默认**并确认：
组级写（父组件直接调 store）成功后，旧草稿 timer 到期仍提交，覆盖刚写入的默认值。
入口守卫拦不住——守卫只认"确认框已开"，纯键入无框。

## 根因

防抖提交只认"草稿存在"，不认"外部值是否已变"。组级恢复绕开子块写桥，
子块 sterile 地持有过期草稿。

## 修复（双重防护，缺一即 reopen，勿删其一）

1. **提交前校验**（覆盖"timer 抢跑"）：草稿携带输入时外部值快照 `base`；
   到期执行前读 store 最新值，漂移则丢弃草稿并同步显示，不写桥。
2. **外部变化 effect**（覆盖"外部已落盘"）：`prevRawRef` 守卫 + 有草稿/自定义态
   才 `cancelPendingSuspend` 并重播种；正常键入不改变外部值，不误杀；
   用户自己的提交先清 pending 再写桥，重播种为同一值（无闪动）。

## 测试要点

- 写穿 mock（`updatePreferences.mockImplementation` 真改 store），否则外部值不变、竞态不可复现。
- fake timers 下：键入草稿 → 触发组恢复 → 确认 → `advanceTimersByTimeAsync` → 断言只写一次默认值。
- 行为断言：组成功后自定义输入消失（预设显示回归），锁 UI 同步。
- `afterEach` 恢复 real timers + `beforeEach` 重置 mock，否则 fake-timer/实现泄漏到后续用例。

## 适用

任何"防抖本地草稿 + 跨组件外部写入同一字段"的结构（树缓存 TTL + 存储组恢复同构，
建议一并排查）。
