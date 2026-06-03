---
description: Browser automation rules, tool selection, and lessons learned from testing
alwaysApply: true
---

# 浏览器自动化规则

## 工具选择导航

| 场景 | 推荐工具 | 说明 |
|------|----------|------|
| Trae 内置浏览器交互 | integrated_browser（MCP 工具） | Trae 内置浏览器，通过 MCP 工具调用（非 CLI），支持导航、点击、输入、截图等全功能 |
| 让用户在内置浏览器中打开 URL | 纯文本 URL（不包裹） | Trae IDE 自动检测纯文本 URL 使其可点击，点击后在内置浏览器中跳转 |
| 交互式测试、表单填写、元素点击 | agent-browser | 全功能终端自动化，**打开的是独立 Chrome 实例**，非 IDE 内置浏览器 |
| 连接用户现有 Chrome、坐标点击 | Browser Harness | 基于 CDP，需 Chrome 调试模式 |
| 仅静态截图 | Playwright CLI | 轻量级，无交互能力 |

> 详细用法参见 [browser-automation 技能](../../.opencode/skills/browser-automation/SKILL.md)

## 核心经验教训

> 经验教训见 [知识沉淀/浏览器自动化/rules-lessons.md](../../知识沉淀/浏览器自动化/rules-lessons.md)

## 测试产物存储

所有浏览器自动化测试产物统一保存到根目录 `test-artifacts/`（已加入 `.gitignore`）。

```
test-artifacts/
├── screenshots/    # 截图
├── videos/         # 录屏
└── documents/      # 测试报告等文档
```

### 命名规范

| 类型 | 格式 | 示例 |
|------|------|------|
| 截图 | `{功能名}-{时间戳}.png` | `changes-panel-20260516-132800.png` |
| 视频 | `{功能名}-{时间戳}.webm` | `file-tree-20260516-132800.webm` |
| 文档 | `{报告类型}-{时间戳}.md` | `dogfood-report-20260516-132800.md` |

时间戳格式：`yyyyMMdd-HHmmss`

```powershell
# 截图保存示例
agent-browser --session test screenshot "e:\Programs\Obsidian\notes\test-artifacts\screenshots\my-test-$(Get-Date -Format 'yyyyMMdd-HHmmss').png"
```

## 相关文件

- [browser-automation 技能](../../.opencode/skills/browser-automation/SKILL.md) — 完整用法与步骤清单模板
- [desktop-ui-verification.md](./desktop-ui-verification.md) — 桌面端 UI 验证
- [commands.md](./commands.md) — 常用命令
