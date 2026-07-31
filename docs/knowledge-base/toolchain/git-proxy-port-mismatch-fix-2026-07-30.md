# Git 代理端口配置与 Clash 实际监听端口不一致导致推送失败

## 问题现象

`git push` 失败，错误：`Failed to connect to github.com port 443 via 127.0.0.1 after 2062 ms: Could not connect to server`

同时：
- 用户确认 Clash 代理已开启
- 但 git 始终无法通过代理连接 GitHub

## 根因

git 配置的代理端口与实际代理监听端口**不一致**：

| 项 | 值 |
|----|----|
| git 配置的代理 | `http://127.0.0.1:7890`（Clash 默认端口） |
| 实际代理 | `Dapan.exe`（maoxiong-vpn，基于 mihomo 核心） |
| 实际监听端口 | `17890`（HTTP 代理）、`19090` |

`7890` 是 Clash 传统默认端口，但 maoxiong-vpn 核心实际监听在 `17890`。git 连接的 `7890` 端口没有服务在监听，导致连接失败。

## 诊断手段

### 1. 检查 git 当前代理配置

```powershell
git config --global --get http.proxy
git config --global --get https.proxy
```

### 2. 查找本机所有监听端口

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalAddress -eq '127.0.0.1' -or $_.LocalAddress -eq '0.0.0.0' } | Sort-Object LocalPort | Select-Object -Unique LocalPort, LocalAddress
```

### 3. 定位端口归属进程

```powershell
Get-NetTCPConnection -State Listen -LocalPort <PORT> | Select-Object OwningProcess
Get-Process -Id <PID> | Select-Object ProcessName, Path
```

### 4. 测试端口是否为 HTTP 代理

```powershell
curl -sv -x http://127.0.0.1:17890 --max-time 10 https://api.github.com -o NUL
```

返回 HTTP 响应即表示该端口是可用代理。

## 修复

将 git 代理端口更新为实际监听端口：

```powershell
git config http.proxy http://127.0.0.1:17890
git config https.proxy http://127.0.0.1:17890
git config --global http.proxy http://127.0.0.1:17890
git config --global https.proxy http://127.0.0.1:17890
```

## 验证

更新后 `git push` 立即成功：

```
a9d2fcd7..f1fbc957  main -> main
```

## 经验教训

1. **代理端口可能随客户端不同而不同**：Clash for Windows 用 7890，但 mihomo 核心（如 maoxiong-vpn）可能用其他端口。不要假设默认端口。
2. **先查实际监听端口再改配置**：`Test-NetConnection` 确认目标端口是否有服务监听，`Get-NetTCPConnection` 列出实际监听端口，找到代理进程后再更新 git 配置。
3. **curl 直接测代理连通性**：用 `-x` 指定端口 + `-sv` 详细输出验证端口是否真的可用作 HTTP 代理，比直接改 git 配置再试更高效。
