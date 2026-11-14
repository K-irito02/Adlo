# 第二轮审查记录（rev7–rev10）— 库点名图标优先 + 原型链修复

> 归档：主代理落盘的子代理结论汇总。快照 diff 已随 `.review-diffs/` 清理删除，代码以最终提交为准。

## 轮次

| rev | 范围 | 发现 | 处置 |
| --- | --- | --- | --- |
| rev7 | 6 文件（增量） | high 1 / medium 2 / low 3 | 全部修复 |
| rev8 | 同上（修后） | medium 1 / low 3 | 全部修复 |
| rev9 | 定向：4 项修复 | **通过** | — |
| rev9（R2） | 清理轮 | low 3 | 全部修复 |
| rev10 | 定向：3 项 R2 修复 | **通过** | — |

## rev7 发现与处置

| # | severity | 位置 | 问题 | 处置 |
| --- | --- | --- | --- | --- |
| F1 | high | `FileIcon.tsx` Tier 2 | 点号分支未挡原型链，`.constructor` / `.__proto__` 仍崩（我方旧修复只覆盖扩展名层） | Tier 2 调库前加 `isPrototypeMember(fileName.slice(1))`；补 3 条点号伪名用例 |
| F2 | medium | `FileIcon.tsx` Tier 4 | `autoAssign` 只开在 Tier 2 → 同族分裂（`.eslintrc` vs `.eslintrc.json`、`.env` vs `.env.local`） | Tier 4 传 `autoAssign={fileName.startsWith('.')}`；补同族用例 |
| F3 | medium | 快照/进度文件 | rev7 快照与工作树不一致、进度计数落后 | 重出快照 + 按最终代码重写进度 |
| F4 | low | 三处注释 | 仍描述旧行为 | 逐处改写 |
| F5 | low | 测试 | 库图标用例只有否定断言，抓不到「退化成库默认文档」 | 加 `LIBRARY_DEFAULT_DOC_PATHS` 反向锚定 |
| F6 | low | `2026-11/README.md` | 索引摘要仍是第一轮结论 | 改写 |

## rev8 发现与处置

| # | severity | 位置 | 问题 | 处置 |
| --- | --- | --- | --- | --- |
| N1 | medium | `FileIcon.test.tsx` | `.eslintrc.json` 同族断言假绿（关掉 `autoAssign` 会退回 JSON 图标，三条否定断言仍过） | 改为成对比较 `pathData`；helper 补 `paths.length > 0` |
| N2 | low | 进度文件 | 回退计数是中间态数字 | 按最终 31 条重测并改写 |
| N3 | low | 进度文件 | 遗留表仍称原型链缺陷未修 | 标注「已在事项 7 修复」 |
| N4 | low | `FileIcon.test.tsx` | 顶部注释仍称「点号文件必须有配置图形」 | 改为「库无点名图标的点号文件才落配置字形」 |

## rev9（R2 清理轮）发现与处置

| # | severity | 位置 | 问题 | 处置 |
| --- | --- | --- | --- | --- |
| C1 | low | `FileIcon.tsx` Tier 2 注释 | 崩溃链说错：库是按「带点全名」查表未命中后，**拿末段当扩展名再索引**才撞原型 | 注释改为真实链路 |
| C2 | low | 进度文件 | 遗留表写「三处注释」，已收敛为两处 | 改计数并说明 |
| C3 | low | `FileIcon.test.tsx` | `a.toString` / `a.valueOf` 被说成「沿原型链取到成员」（小写后原型上并不存在） | 拆两组用例，各自注明保护目标 |

## 最终门禁

- `FileIcon.test.tsx`：31 条通过
- `check:changed`：21 文件 / 201 用例通过
- 回退证据（按最终 31 条）：Tier 2 关库优先 `6 failed | 25 passed`；Tier 4 `autoAssign=false` `2 failed | 29 passed`；去 `Object.hasOwn` `2 failed | 29 passed`；Tier 4 去 `isPrototypeMember` `4 failed | 27 passed`；Tier 2 去 `isPrototypeMember` `3 failed | 28 passed`
