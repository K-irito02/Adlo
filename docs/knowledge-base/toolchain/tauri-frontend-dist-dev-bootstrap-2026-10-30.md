# Tauri dev 需要 frontendDist 目录存在（2026-10-30）

## 症状

干净检出（或被清理过）的工作树里执行 `pnpm dev:tauri`，编译壳层时报：

```
error: proc macro panicked
  --> src-tauri\src\main.rs:...
   = help: message: The `frontendDist` configuration is set to "../frontend/dist" but this path doesn't exist
```

## 根因

Tauri 的 `generate_context!` 在**编译期**就校验 `frontendDist`（`src-tauri/tauri.conf.json` 的 `../frontend/dist`）是否存在——即使 dev 模式实际走 `devUrl`、从不读取该目录。而：

- `frontend/dist` 是 gitignore 的构建产物；
- `beforeDevCommand` 只构建 sidecar（`build-stage-sidecar.ps1`），不生成前端产物。

## 处置

`scripts/run-project-surface.mjs` 在 spawn `cargo tauri dev` 前调用 `ensureFrontendDist()`：缺少 `frontend/dist/index.html` 时写一个最小占位页并打印提示。dev 模式不读取该内容；`tauri build` 的 `beforeBuildCommand` 会真正执行 `pnpm frontend:build` 覆盖占位（Vite 默认清空 outDir）。

## 教训

- 编译期依赖的「构建产物目录」必须由 dev 启动器保证存在，不能依赖上次构建残留。
- 占位文件只允许出现在 dev 路径；release/e2e 的 beforeBuildCommand 必须能覆盖它（本仓 e2e 使用独立 config，同样会重建前端）。
