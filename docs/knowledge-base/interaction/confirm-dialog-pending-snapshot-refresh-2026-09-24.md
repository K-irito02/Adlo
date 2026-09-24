# 确认对话框三模式：pending 信号 / 开框快照 / 写成功读失败可见（2026-09-24）

来源：存储设置组级恢复（`StorageSettings.tsx` 组对话框，2026-09-24 四事项）+ closing 审查三轮验证。

## 1. 跨组件触发用 pending 布尔，不用递增序号

侧边栏按钮与对话框分属不同挂载生命周期的组件时，序号信号有"首跳漏弹"：切组与发信号同批提交，新挂载组件把新序号当历史值播种消费，对话框不弹。

```ts
// ❌ seq：挂载时播种即消费，首跳取决于批处理时序
// ✅ pending 布尔：挂载即消费，不存在"新值当历史"
requestStorageGroupReset: () => set({ storageGroupResetPending: true }),
consumeStorageGroupReset: () => set({ storageGroupResetPending: false }),
```

要点：承接方 effect 首行 consume（幂等）；开框/忙时收到信号则消费后丢弃（at-most-once，不堆积补弹）；卸载兜底再 consume 一次防残留；transient 字段不进持久化注册表。

## 2. 无焦点陷阱的对话框：落盘用开框快照，不读实时状态

确认框无焦点陷阱时，后台 Tab 可达输入框/开关。落盘若读实时草稿，展示与行为分裂。
做法：开框成功后把"补丁快照 + 开关快照"存 ref，文案与执行同源；用例覆盖"开框后改草稿再确认 → 落盘仍是快照"。

## 3. 写成功但回读失败不可静默

`invoke` 写成功后紧跟 `fetchSettings` 回读：回读失败若吞掉，UI 显示旧值为当前值。
做法：回读返回 boolean；失败时返回哨兵错误（本例 `DOWNLOAD_REFRESH_FAILED` 常量，slice 与调用方同源 import），调用方映射专用 toast（"已保存，但刷新显示失败，请重新打开确认"）。
