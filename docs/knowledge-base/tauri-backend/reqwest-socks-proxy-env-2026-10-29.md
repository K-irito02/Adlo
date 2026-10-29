# reqwest 缺 `socks` 特性导致 SOCKS 代理 env 下全部出站失败（2026-10-29）

## 现象

- 设置 → DSH 组：正式版本 / 预发布版本行恒显示“未知，请稍后重试”，当前版本显示“未安装”；点击“检查更新”只闪一下、无 toast。
- ad-server 日志：`settings_snapshot` 版本腿与目录腿双双降级为 null，
  `error sending request for url (https://registry.npmmirror.com/...)`；
  reqwest 日志：`proxy(socks5h://127.0.0.1:17890/) intercepts`。
- 前端无全局错误卡片（快照返回 ok，L2 按腿降级），属正常呈现——根因在后端出站。

## 根因

- 用户终端 env 有 `ALL_PROXY=socks5h://127.0.0.1:17890`（Dapan 类工具常见写法；
  curl / Node / 浏览器自带 SOCKS 实现，均认 `socks5h://`）。
- 本仓 workspace `reqwest` 特性缺 `socks`（`socks = []` 默认关闭）→ hyper-util
  拒识一切 SOCKS scheme，`ConnectFailed "unsupported scheme socks5h"`（446µs 即失败，
  `socks5://` 同样失败）。凡继承 `*socks*://` 代理 env 的进程，其 registry 查询、
  下载源测速、harness 下载全部失败。
- 已排除：网络不通（直连 200）、MITM 证书（Node 24 Mozilla 根体系经代理 200）、
  代理并发（6 并发全 200）。

## 修复

- `ai-digital-life/Cargo.toml`：workspace reqwest 特性加 `"socks"`。
  `socks = []` 无新增依赖，`Cargo.lock` 零变更；`socks5h://` 为 reqwest 0.13 原生合法 scheme。
- 生效条件：重编 ad-server 二进制（重启 dev Tauri 即可）。
- 注意：不要用“失败回退直连”代替——代理 env 可能是用户有意配置，直连会绕过用户代理策略。

## 复用判断

- 凡新增出站 HTTP 需求，一律走 `download-source::build_http_client`（自动继承代理与该修复）。
- 新增 reqwest 直连 `Client::builder()` 前先确认：是否需要 env 代理（`test_source` 保持直连仅用于连通性探测，不走业务流量）。
- 临时复现测试（live-network）不要入库：`Proxy::https("socks5h://…")` 构造必成功，
  失败发生在 connect 阶段，构造期断言锁不住该修；特性开关本身即锁定。
