# 设置页去抖竞态与 fake-timers 假绿测试（2026-09-23）

来源：设置面板工作区组重构（`WorkspaceSettings.tsx` 外部 config 同步 effect，Phase 4 根因验证 1-A）。

## 1. 本地/外部双写竞态：用 ref 镜像做"本地已一致则早退"

场景：本地编辑走 200ms debounce 落盘；外部（侧栏组级重置等）回写 config 触发同步 effect。旧 effect 在非 own-echo 时无条件 `clearTimeout`——外部同内容更新（新数组身份）或首轮 `persisted === null` 会清掉用户在途编辑且无提示。

修复：effect 首行比较本地与外部，**一致则直接 return，不碰 timer**：

```tsx
// 本地最新值镜像（ref，不进 effect 依赖）
const localRef = useRef({ max: maxConcurrent, pri: priorityIds, /* … */ });
localRef.current = { /* …当前值… */ };

useEffect(() => {
  if (localMatchesCfg(localRef.current)) {
    return; // 不清 debounce
  }
  /* …own-echo 判断与同步… */
}, [hasConfig, cfgMax, cfgPri, cfgDef, cfgNat]);
```

**关键约束**：不能把本地 state 直接加入 effect 依赖——每次击键都会触发 effect 并清掉刚调度的 debounce（比原 bug 更糟）。用 render 期赋值的 ref 镜像绕开依赖，同时拿到最新值。

## 2. 假绿测试陷阱：act 之外的 setState 推迟重渲染，timer 先开火

复现竞态的测试初版**通过了，但没测到任何东西**：

```tsx
fireEvent.change(input, { target: { value: '12' } }); // 调度 T1
useAppStore.setState(/* 同内容新身份 */);            // 裸调，不在 act 内
await act(async () => {
  vi.advanceTimersByTime(200); // ← T1 先开火，effect 之后才跑，断言恒过
});
```

根因：`IS_REACT_ACT_ENVIRONMENT` 下，act 之外的更新被推迟；进入 `await act` 后先执行 scope 里的 `advanceTimersByTime`，重渲染 + effect 在 scope 之后才 flush——timer 已开火，effect 永远看不到竞态窗口。

修复：外部写入包进**同步** `act()`，强制重渲染 + effect 先执行，再推进 timer：

```tsx
act(() => {
  useAppStore.setState(/* … */);
}); // effect 已跑（旧代码清掉 T1）
await act(async () => {
  vi.advanceTimersByTime(200);
});
expect(updatePreferences).toHaveBeenCalledWith({ /* … */ }); // 旧代码红，新代码绿
```

**规则**：凡断言"外部更新 vs 在途 timer"的竞态测试，外部 `setState` 必须包进同步 `act`；跑红后要用探针（effect 内临时日志）确认失败原因真是 timer 被清，而非调度时序漂移。
