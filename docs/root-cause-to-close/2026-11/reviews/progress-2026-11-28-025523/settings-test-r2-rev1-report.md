## 范围

- 快照：`.review-diffs/adlo_frontend_src_app_components_settings_SettingsPanel.test.tsx-rev1.diff`
- 文件：`adlo/frontend/src/app/components/settings/SettingsPanel.test.tsx`
- 变更：仅在「对话框按 Escape 与点 overlay 关闭且不执行」用例中，增加对话框打开后焦点已进入对话框的 `waitFor` 断言。
- 审查重点：死代码、冗余等待、测试污染、临时诊断残留，以及会降低保护强度的同步逻辑简化。
- 约束：只读源码，未修改源码或配置，未运行测试套件，未启动开发服务器或浏览器。

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

- R1 已给出零问题结论，没有需要本轮关闭的 finding。
- 本轮变更是在既有 Escape / overlay 回归用例上补充焦点同步保护，不涉及对 R1 已报告问题的修复。

## 新增发现

无需修复项。

### 清理核对

- **死代码**：新增的 `dialog` 与 `document.activeElement` 均直接参与断言，没有未使用的辅助函数、变量或导入。
- **冗余等待**：`findByText` 只能证明对话框内容已经出现；`ResetAllDialog` 在打开后另通过 effect 将焦点移到主确认键（`ResetAllDialog.tsx:128-139`）。新增 `waitFor` 等待的是焦点 effect 的落定，而非重复等待容器存在。该同步点与随后向 `document.body` 派发 Escape 的事件目标相关，删除后会重新引入异步时序风险。
- **测试污染**：新增代码仅读取 DOM 并执行断言，没有写入 store、全局对象、监听器或定时器，也没有改变跨用例状态。
- **临时诊断残留**：未发现 `console.*`、调试标签、跳过用例、临时 fixture 或只写不读的诊断代码。
- **同步逻辑简化**：把 `waitFor` 改为立即执行 `expect`，或直接删除焦点断言，会降低对“对话框打开后焦点进入框内”这一契约的保护；当前 `contains(document.activeElement)` 是合理的粗粒度回归断言，不应为本轮清理而移除。改为精确按钮断言属于可选增强，不是需修复项。

## 记录不修

- `SettingsPanel.test.tsx:411` 的既有 `await screen.findByRole('dialog')` 仍以容器出现作为第二段 overlay 操作的同步点；该行不在本轮未提交改动中，且本轮不将其升级为需修复项。
- 未用 jsdom 的焦点包含断言推导真实浏览器中的 Tab 焦点陷阱或焦点修正行为；本断言仅锁定当前组件已实现的开框焦点移入逻辑，不构成真实浏览器无障碍验证声明。

## 结论

- 需修复项：0
- 分级数字：critical 0 / high 0 / medium 0 / low 0
