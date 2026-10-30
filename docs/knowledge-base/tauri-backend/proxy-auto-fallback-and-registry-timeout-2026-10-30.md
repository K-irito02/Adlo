# 代理自动回退与版本目录超时（2026-10-30）

## 症状

用户环境里 `ALL_PROXY=socks5h://127.0.0.1:17890`（代理软件已关闭，端口无监听），设置面板出现：

- DSH / OpenCode「正式版本 / 预发布版本」显示「未知，请稍后重试」或「官方暂无」；
- 网络组切换下载源弹「自动检测失败」，测试连接直接显示英文 `error sending request for url (...)`；
- 切到「不使用代理」也无法在界面里解决（测试按钮仍走环境代理）。

## 根因

1. **环境代理残留**：代理软件退出后系统级 `ALL_PROXY` 仍在，应用「自动检测」如实跟随 → 所有 registry 请求走死代理。
2. **探针不遵循配置**：`adl_download_source::test_source` 自建裸 `reqwest::Client`，忽略 `DownloadSourceConfig.proxy`，与真实下载路径（`build_http_client`）不一致。
3. **OpenCode 目录必然超时**：完整 packument 实测 25 MB / 33 s，而目录请求超时 15 s；reqwest 未开 gzip。
4. **失败信息不可诊断**：界面直接展示 reqwest 原文；OpenCode 适配器从不回传 `catalogFailed`，把断网说成「官方暂无版本」。

## 处置

- 两个解析口统一：`resolve_proxy_url` / `env_proxy_for_scheme` 采用同一优先级（同一 scheme：`HTTP(S)_PROXY` 非空即胜出 → Windows 注册表 `ProxyServer` → `ALL_PROXY`；只有缺失或空串才算未设置，纯空白视为「已设置但不可解析」继续回退）。
- `ProxyMode::Auto` 先做代理端点 TCP 预检（5 s 缓存），不可达即整只 client `no_proxy()` 静默直连；**手动模式不回退**（尊重用户显式选择，仍报 `proxy_unreachable`）。
- 探针镜像同一决策（全局端点不可达 → `proxy: None`），并返回 `error_kind`（proxy_unreachable / network / http / unknown）+ 脱敏端点，界面按分类出本地化文案。
- 客户端构建改为 async（`build_http_client*`），统一 7 处调用点；`/env/status` 只对 Auto 模式做健康探测，并把回退状态纳入缓存 key。
- OpenCode 目录：reqwest 开 `gzip`（25 MB → 3.6 MB）+ 目录超时 60 s。
- `ProxyHealth { endpoint, autoFallback }` 经 `/dsh/source-status` 暴露，设置面板用蓝色提示行显示「当前实际使用」状态。

## 验证

- 真实 adl-server（独立数据目录）实测：Auto + 死代理 → `proxyEffective.autoFallback=true`，探针 750 ms 直连成功；手动死代理 → `proxy_unreachable`；`/opencode/version-catalog` 12–15 s 返回。
- 单测：`adl-download-source` 24 例（含 env/注册表优先级、NO_PROXY 匹配、ProxyOverride 转换、代理地址规范化、手动代理不回退）；前端 185 例。
- 注册表路径 E2E 冒烟：清空 `ALL_PROXY` 后启动真实 adl-server，`proxyEffective = {endpoint:null, autoFallback:false}`（与本机 `ProxyEnable=0` 一致），探针直连成功。正路径（`ProxyEnable=1`）未做机器级验证，以免改动用户系统代理；由注入式纯函数测试 + Windows 读取冒烟覆盖。

## 边界与教训

- **代理解析与 reqwest 同源**：同一 scheme 下 `HTTP(S)_PROXY`（非空即胜出）→ Windows 注册表 `ProxyServer` → `ALL_PROXY`；注册表读 `HKCU\...\Internet Settings` 的 `ProxyEnable / ProxyServer / ProxyOverride`（`ProxyOverride` 按 `;`→`,`、去 `*.` 转成直连名单）。PAC（`AutoConfigURL`）hyper-util 不解析，本应用同样忽略，因此界面可以如实显示「未检测到代理，当前直连」。
- **注册表 `ProxyServer` 按 hyper-util 原样使用**：它不解析 `http=...;https=...` 的映射写法；无 scheme 的 `host:port` 会按 `http://` 规范化后再探测/展示。
- **环境变量在进程启动时快照**：代理软件开关不会改父进程 env；系统代理变化靠下一次客户端构建重新读取注册表（健康缓存 5 s）。
- 代理健康缓存 TTL 5 s：开关代理软件后最多 5 s 自愈，不必重启应用。
- 探针与客户端必须共用同一套解析，否则「测试通过但下载失败」这类假信号会长期存在。
