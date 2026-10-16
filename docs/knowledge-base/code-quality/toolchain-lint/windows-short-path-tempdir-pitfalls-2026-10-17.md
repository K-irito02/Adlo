# Windows 短路径与测试临时目录命名两坑（2026-10-17）

来源：CI Quality Gates 在 Windows runner 上连续失败（`TEMP=C:\Users\RUNNER~1\…`，8.3 短名）+ 一次并行测试 flake（141/1）。

## 现象

1. 同一份代码本地全绿、CI 红，且失败点逐轮后移：先 `gitWorktree.test.ts` 路径断言，再 `migrate_dir_*` overlap 检查漏判，接着 `get_current` rootPath 断言。
2. 另一次 CI 出现单用例 flake：`path escapes workspace boundary: a.txt`，本地 15 轮加压复现不出。

## 根因

1. Windows 上同一目录有多种拼写（8.3 短名 `RUNNER~1` vs 长名 `runneradmin`、`\\?\` 前缀、大小写）。`canonicalize()` 会展开短名/前缀，而词法拼接保留原样——**比较两侧若一侧 canonicalize、一侧词法，前缀/相等判断必失配**。`normalize_path_key` 正是如此混用，致迁移 overlap 检查被绕过（genuine 产品 bug，目标会被搬进源内部）；两处测试断言拿原始短路径输入比服务端规范长路径，同理必败。本地 TEMP 无短名分量，所以本地永远是绿的。
2. 测试临时目录只用 `pid + nanos` 命名：Windows 时钟粒度粗，并行测试同 tick 共名，结尾 `remove_dir_all` 删掉他人目录 → 窄窗口 flake（逻辑排除法定案：parent 存在时边界判定不可能失败，走到 Security 分支当且仅当目录已被外部删除）。

## 修复

- 比较键统一同源：整条能 canonicalize 就整条解析，否则把「最深的已存在祖先」canonicalize 后拼回词法尾（`resolve_for_compare`）；测试断言侧用同配方（`canonicalize + strip_verbatim_prefix`，对标仓内 `unique_ws_dir` 的 `(raw, ws)` 双值范式）。
- 临时目录名追加线程 id + 进程内原子单调计数（对标 `test_util.rs` 的 `static COUNTER` 范式），保证每次调用唯一。
- 本地复现技巧：找/造一个 8.3 短名目录（`cmd /c dir /x` 确认，如 `ADL-SH~1`），把 `TEMP`/`TMP` 指向它再跑测试，可逐字复现 CI 失败。注意：不要全局改 TEMP 去编译 Rust（link.exe 写临时文件会失败）；应先正常编译出 test binary，再单独跑该 binary。

## 教训

- Windows 上凡做路径相等/前缀比较，先问一句“两侧拼写同源吗”；`canonicalize` 不是纯函数式归一，它依赖文件系统存在性，不存在的路径会回退——回退分支必须显式处理，否则就是 overlap/越界检查的绕过点。
- 并行测试的临时目录名必须带进程内唯一计数，只靠 `pid + 时间戳` 不够；结尾删目录是 flake 放大器（删之前先想想谁会共名）。
- CI 失败逐轮后移时，说明修的是真问题链，不是同一个坑——继续按“日志 + 本地复现”打，不要动删 CI 的念头。
