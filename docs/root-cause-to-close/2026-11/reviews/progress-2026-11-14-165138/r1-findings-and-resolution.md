# R1 审查记录（rev1–rev5）— 兜底文件图标 + 开屏定格钩子

> 归档：主代理落盘的子代理结论汇总。原始轮次报告为子代理返回内容，此处保留结论、证据与处置；快照 diff 已随 `.review-diffs/` 清理删除，代码以最终提交为准。

## 轮次

| rev | 范围 | 发现 | 处置 |
| --- | --- | --- | --- |
| rev1 | file-icon 3 文件 / splash 3 文件 | file-icon：medium 1 + low 4 + 优化 1；splash：low 2 | 全部验证后修复（见下表） |
| rev2 | 同范围 | file-icon：medium 1（升级）+ low 3；splash：low 1 + 可选 2 | 修复 |
| rev3 | 同范围 | file-icon：low 2；splash：low 2（均为进度文档） | 代码注释修复；进度文档留 P5 |
| rev4 | 定向：file-icon 注释 ×3 / splash 接线用例桩 | file-icon：low 1；splash：通过 | 修 1 |
| rev5 | 定向：Tier 5 注释范围 | 通过 | — |

## rev1 发现与处置

| # | severity | 位置 | 问题 | 处置 |
| --- | --- | --- | --- | --- |
| F1 | medium | `FileIcon.tsx` | 两张特殊文件名表大量条目不可达、docblock 举例失真 | 经 rev2 复核升级：整层删除（事项 5） |
| F2 | low | `FileIcon.tsx:isDotfile` docblock | 「曾走库 config 风格」「`.env.local` 保持扩展名图标」两处断言不实 | 重写；后经 rev2 进一步证伪 config 说法，再改 |
| F3 | low | `FileIcon.test.tsx` | `LICENSE` 用例只做反向断言，返回空 SVG 也绿 | 补骨架 path 正向断言 + `toHaveLength(2)` |
| F4 | low | `FileIcon.test.tsx` | Tier 2 语义变化（`.env`/`.eslintrc`/`.prettierrc`）无覆盖 | `it.each` 扩到 7 名 + `.env.local` 反向用例 |
| F5 | low | `fallbackIcons.tsx` | 注释把 com/scr/pif 说成"脚本" | 改为 `Script / executable` |
| — | 优化 | `FileIcon.tsx` | react-symbols 自带 `.gitignore`/`.editorconfig` 图标（需 `autoAssign`） | 记录不修（推翻用户选型） |
| S1 | low | `StartupOverlay.test.tsx` | 接线层无回归保护（重新内联 `Number(null)` 单测仍绿） | 新增桩 + 正负两条接线用例 |
| S2 | low | `splashDebugParams.ts` 注释 | 「每个元素的 from 态（opacity 0 / scaleX 0）」不精确 | 改为逐元素精确表述；测试文件同句后续同步 |

## rev2 发现与处置

| # | severity | 位置 | 问题 | 处置 |
| --- | --- | --- | --- | --- |
| M1 | medium | `FileIcon.tsx` | 存活条目映射值 `docker`/`config` 不是 `defaultStyles` 键（114 键实测），Tier 5「查得到、渲染全死」；docblock 仍写不成立行为 | 整层删除 Tier 5 |
| L1 | low | `FileIcon.tsx` docblock | 「any name carrying a dot」绝对断言不成立（`foo.` 仍可达） | 随层删除移除 |
| L2 | low | 注释 + 进度文件 | 「改前走 config 风格」描述不实（实际落通用未知图标） | 注释改事实；进度文件 P5 订正 |
| L3 | low | `FileIcon.test.tsx` | 3 条反向用例可空跑；缺特殊名正向用例 | 各补 `paths.length > 0`；新增 `Dockerfile` 正向用例 |
| S3 | low | `splashDebugParams.test.ts` | 与 S2 同一句不精确注释残留在测试文件 | 改概括表述 |

## rev3 发现与处置

| # | severity | 位置 | 问题 | 处置 |
| --- | --- | --- | --- | --- |
| F1 | low | `FileIcon.tsx` Tier 5 注释 | 「库没有 docker/config 字形」过度概括成"该层无法渲染" | 改为"旧表键无效所以从未渲染" |
| F2 | low | `FileIcon.test.tsx` describe | 「任意扩展名都会渲染通用文档」字面为假 | 改为「任意**未识别的**扩展名回退通用文档」 |
| S4 | low | 进度文档 | 计数/用例名过期 + 「所有元素 from 态」不精确 | P5 统一订正 |

## 删除性推演证据（全部实跑）

| 回退方式 | 结果 |
| --- | --- |
| 点号分支改成 `isDotfile(...) && false` | `7 failed | 17 passed` |
| `FALLBACK_EXTENSION_MAP` 分支改成 `extension && false` | `3 failed | 17 passed`（当时 20 条） |
| 恢复问号 path | `5 failed | 12 passed`（当时 17 条） |
| `parseSplashFreezeAt` 换回 `Number(raw)` | `5 failed | 6 passed`（11 条） |
| 组件换回 `Number(params.get(...))` | `1 failed | 4 passed`（5 条接线） |
