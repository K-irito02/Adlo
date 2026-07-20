# {功能名称} 测试 — 步骤清单

> **执行方式**：Agent 按步骤逐步执行，每步后通过 `snapshot -i` 确认状态，动态调整。
> **前置条件**：应用已运行（`npm run dev:browser`），agent-browser 已安装。

---

## 步骤

### Step 1：{步骤标题}

```powershell
{命令}
```

{等待时间}。{验证标准（可选）}。

### Step 2：{步骤标题}

```powershell
{命令}
```

{等待时间}。{验证标准（可选）}。

---

## 清理

```powershell
agent-browser --session {session-name} close --all
```
