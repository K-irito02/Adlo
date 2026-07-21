# Git Schannel 证书吊销检查导致推送超时

## 问题现象

`git push` 失败，错误：`Failed to connect to github.com port 443 after 21000 ms: Could not connect to server`

同时：
- `ping github.com` ✅ 正常（ICMP 可达）
- `Invoke-WebRequest https://github.com` ✅ 正常（PowerShell HTTPS 返回 200）
- 但 git 始终连接超时

## 根因

Git for Windows 默认使用 Windows 的 **Schannel** SSPI 作为 SSL/TLS 后端（而非 OpenSSL）。GitHub 服务器在 TLS 握手阶段请求重新协商（renegotiation），Schannel 此时发起**证书吊销检查**（CRL/OCSP）：

- 如果 CRL 分发点不可达或响应慢
- Schannel 会阻塞等待，直到超时（约 21 秒）
- 导致整次 `git push` 连接挂起并最终失败

## 诊断手段

启用 `GIT_TRACE` 和 `GIT_CURL_VERBOSE` 环境变量查看详细握手过程：

```powershell
$env:GIT_TRACE=1; $env:GIT_CURL_VERBOSE=1; git push
```

关键线索是 trace 中的：
```
schannel: remote party requests renegotiation
```

## 修复

禁用 Schannel 证书吊销检查：

```powershell
git config --global http.schannelCheckRevoke false
```

### 原理

- `http.schannelCheckRevoke false` 让 Schannel 跳过 CRL/OCSP 检查
- 不会降低 TLS 加密强度（证书链验证仍然进行）
- 仅跳过证书是否被吊销的在线查询
- 仅在无法访问 CRL 分发点或 CRL 响应慢时有影响

### 其他可行方案

| 方案 | 说明 |
|------|------|
| `http.schannelCheckRevoke false` | ✅ 推荐，最小影响 |
| `http.sslBackend openssl` | 切换 Git 到 OpenSSL 后端，但可能与其他工具冲突 |
| 设置 `http.version HTTP/1.1` | 部分环境下可缓解，但非根因 |
| 配置 VPN/代理 | 如果 CRL 被防火墙阻断 |

## 验证

设置后 `git push` 立即成功。
