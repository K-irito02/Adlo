# 检索加载态时序与悬浮层经验（2026-09-19）

本轮 5 事项：回车闪现"无结果"、加载条顶走结果、分页行换行、按钮去边框、刷新重检索。

## 1. 异步意图一旦提交，加载态必须同步进入；取消路径必须同步退出

`searchFiles` 先 `set({searchQuery})`、300ms 防抖后才 `searching=true`：
提交的新词把旧结果过滤为空，渲染分支在窗口期内走到"无结果"。
教训：凡"提交输入（query）"与"置位加载（searching）"分离的链路，
加载态必须与提交同 tick 进入；反之取消链路（`cancelPendingSearch`、
早退分支）必须同步复位，否则切换工作区/范围落入窗口即加载常驻。
单测要锁"防抖待发期 searching===true"与"cancel 后复位"，否则 mock 下恒过。

## 2. 悬浮 overlay 的高度前提必须实证，不能默认"内容多高遮罩多高"

`absolute inset:0` 的高度 = 定位锚点高度。结果树经
`.adl-multitree{flex:1+min-height:0}` ＋ `.adl-multitree-scroll{height:100%+overflow-y:auto}`
内部滚动，锚点高度恒等于可视区，spinner 居中恒可见。
教训：断言"长列表顶走 spinner"前，先读滚动容器是谁；
`pointer-events:none` 的非阻塞是刻意设计时，用注释写明安全依据
（本处：点击校验＋重定位＋stale 标记纠正误导航），并用测试锁住该语义。

## 3. 范围切换不经过 action 守卫时，防抖是泄漏源

`setFilesSearchScope` 只写状态不清防抖：键入新词 300ms 内切到文件范围，
旧 content 防抖仍会 firing 回写。取消必须放在守卫之前（幂等、无条件），
skip 路径同样复位；`scope` 切换本身的 cancel 缺口另起跟踪，不在本轮扩大。
