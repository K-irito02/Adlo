# 下载通道与网络（env-net-download）

## 症状

- 依赖安装或重试时下载失败，报 `EAI_AGAIN`、连接超时、TLS 证书错误。
- 「环境」设置组的网络行 registry 状态显示「不可达」。

## 检测命令

```powershell
curl.exe -sS -o NUL -w "%{http_code}\n" https://registry.npmjs.org/
Get-Content Env:\HTTP_PROXY, Env:\HTTPS_PROXY -ErrorAction SilentlyContinue
```

- 返回 `200` 说明 registry 连通；超时或域名解析失败说明本机到下载源不通。
- 设置组「复制诊断」载荷里的 `netprobe`（示例：
  `{"registryOk":false,"registryLatencyMs":0}`）可直接对照，无需猜测。

## 安装步骤

本项不是本地安装，而是下载通道处置：

1. 打开 设置 → 网络组，把下载源切换为可用的镜像，或填写代理地址。
2. 若只有本应用不通而浏览器正常，检查系统代理与环境变量 `HTTP_PROXY` / `HTTPS_PROXY`。
3. 回到「环境」设置组点「重新检测」，等 registry 恢复后再重试依赖安装。

## 装后回填

registry 状态恢复后，重新执行此前失败的安装；安装成功即完成回填。
若仍失败，复制诊断载荷（含 `netprobe`）交给助手继续排查。

## 回滚

把下载源切回「自动」、清空自定义代理，再点「重新检测」。
回滚只影响后续下载，不会卸载已装成功的依赖。
