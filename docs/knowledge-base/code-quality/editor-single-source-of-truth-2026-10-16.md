# 编辑器"五账本"不同步致内容反复被覆盖/复活（2026-10-16）

来源：文件面板/变更面板内容区怪象连环报（打字被清空、清空保存后复活、切走切回变空）。

## 现象

同一文件内容存在五个互不同步的真相源：CodeMirror 视图态、模块级暂存 `pendingEditorText`、
store 基线 `fileContent`、两套钥匙的文件缓存（`工作区ID:路径` vs `路径:文件`）、磁盘；
三个异步写者（自动保存/Ctrl+S/切换 flush）与三个异步读者（open/对账/watcher 批次）
无互斥，迟到的旧回复覆盖新鲜状态。日志实锤两例：`cacheHit:true cachedLength:0`
（切回读到另一套钥匙下的过期空缓存）、`hasPending:false + isDirty:true` 的回写
（过期脏标记配旧基线覆盖新盘）。

## 根因

1. 缓存键双轨制：`openFileForWorkspace` 用 `路径:文件`，其余全用 `工作区ID:路径`；
   保存只暖自己那套，切回读另一套。
2. 脏判断读闭包旧值：300ms 定时器拿击键时刻的值对比已被保存移动过的基线，误标脏；
   保存见脏就拿基线回写（`pending ?? fileContent`），旧基线覆盖新盘。
3. Tauri 单事件通道无人 emit（`src-tauri` 零引用），外部跟手全靠批次通道；
   保存后变更面板靠 watcher 回声刷新，而回声又被自写过滤吞掉——两边互等，等于没人干。

## 修复

- 钥匙统一为 `scopedFileKey（工作区ID:归一化路径）`；保存只认暂存（无暂存即 no-op + 清过期标记）；
  同路径读写 generation 守卫（迟到旧读丢弃）；脏定时器读暂存现值；保存落定 bump 代际。
- 批次通道扇出到同一调度器（Tauri 主通道）；`saveFile` 成功后显式刷 git 状态，
  不等 watcher 回声。
- 外部变更不再顺手打蓝点（曾导致自动保存用旧基线回写覆盖外部新内容）；外部态只走
  `externalFileChange` 独立标识。

## 教训

- 同一份数据出现第二套键/第二份拷贝时，先统一钥匙再谈逻辑——键分叉的 bug 永远表现为"玄学旧数据"。
- 脏标记必须可溯源到草稿（有暂存才有脏）；"脏而无暂存"按定义就是过期，直接清。
- 凡 `x ?? fallback` 的写路径，问一句 fallback 被写入的后果：`pending ?? fileContent` 的 fallback 就是回写漏洞。
- 跨端事件通道以上线 grep 为准：订阅了没人 emit 的 channel，等于没订阅（`src-tauri` 零引用即证据）。
