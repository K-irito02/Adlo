---
dep: webview2
baseline: 140.0.0.0
detect: reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv ; reg query "HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv ; reg query "HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv
---

# WebView2 运行时（env-webview2）

## 症状

- 应用窗口一片空白或根本起不来，日志提示 WebView2 运行时缺失。
- 「环境」设置组 WebView2 行显示「需手动安装」或版本过低。

## 检测命令

```powershell
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv
reg query "HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv
reg query "HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv
```

- 前两条是机器级安装（32 位 / 64 位注册表视图），第三条是用户级安装；`pv` 即已装版本。
- 三条都报「找不到指定的注册表项」= 未安装。版本与设置组行内基线对比。

## 安装步骤

1. 打开微软官方下载页 https://developer.microsoft.com/microsoft-edge/webview2/ 。
2. 选择 Evergreen 的 Bootstrapper（体积小、需联网）或 Standalone Installer（离线可用），x64 架构。
3. 校验签名：`Get-AuthenticodeSignature "<下载文件>"`，确认签名状态为 `Valid` 且签发者为 Microsoft。
4. 运行安装程序，按默认选项完成。

## 装后回填

完全退出并重新启动本应用——WebView2 是系统级组件，不会在运行中的进程里热加载。
重启后在设置组点「重新检测」。

## 回滚

不适用：WebView2 由微软 Edge 更新通道统一维护，本应用不下载、也不删除它。
若升级后出现异常，请在系统「应用」里对 WebView2 Runtime 执行修复或重装，不要手工删除系统组件目录。
