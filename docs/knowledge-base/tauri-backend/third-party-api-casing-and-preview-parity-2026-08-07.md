# 第三方 API 响应字段大小写 + 浏览器预览双端一致（2026-08-07）

## 问题

1. **Google Gemini `models.list` 实时拉取在桌面端恒回退静态目录**：`GoogleModelItem`
   用 snake_case 字段（`display_name`/`supported_generation_methods`）且无
   `#[serde(rename_all = "camelCase")]`，而真实 API 返回 camelCase
   （`displayName`/`supportedGenerationMethods`）→ 两个字段永远反序列化失败 →
   `generateContent` 过滤后列表为空 → `fetch_models` 每次回退目录、前端还显示"无法获取最新模型"。
2. **浏览器预览模式用一套请求逻辑打所有 provider**：preview 的 `/models` 分支对所有
   provider 都发 `Authorization: Bearer`，但 Anthropic 要 `x-api-key` + `anthropic-version`
   头、Google 要 `?key=` 查询参数、Ollama 无 key 走 `/api/tags` → Anthropic/Google 必 401，
   fallback toast 首次把这个既有双端缺口暴露给用户。

## 根因

- serde 反序列化对字段名大小写敏感，必须与真实 API 契约一致（Google 例外地用了 camelCase）。
- 浏览器与 Tauri 双端"各写各的"请求/解析逻辑，遇到 provider 差异化鉴权就漂移。

## 修复

1. **Rust**：`GoogleModelItem` 加 `#[serde(rename_all = "camelCase")]`，并新增
   `google_models_response_parses_camel_case_fields` serde roundtrip 测试（删除该属性即测试失败）。
2. **浏览器 preview**：抽 `fetchProviderModelsLive` 共享 helper，按 provider 镜像 Tauri 适配器：
   - ollama：无 key `GET /api/tags`；
   - anthropic：`x-api-key` + `anthropic-version: 2023-06-01`，解析 `data[].display_name`；
   - google：`GET /models?key=...`（无 Authorization 头），解析 `models[].name`（去 `models/`
     前缀、过滤 `generateContent`、取 `displayName`）；
   - 其余（含自定义 OpenAI 兼容）：`/models` + Bearer，`display_name ?? name ?? id`。
   - `LiveModelsResult` 判别联合：任意 2xx 返回 `ok`（允许空列表，`safeJson` 解析失败不抛），
     `testProviderConnection` 任意 2xx 视为 connected（对齐 Tauri 状态码检查），
     `fetchProviderModels` 仅非空列表视为 live（对齐 `Ok(models) if !models.is_empty()`）。
   - 30s `AbortSignal.timeout` 对齐 reqwest 客户端；尾斜杠 `replace(/\/+$/, '')` 对齐
     `trim_end_matches('/')`。

## 教训

- 接第三方 API 前确认字段大小写（Google 是 camelCase 的少数派）；改响应模型必须配
  serde roundtrip 测试防回归。
- "双端一致"不是复刻 UI，而是**同一套请求/解析语义**：鉴权头、查询参数、字段映射、
  成功判据（状态码 vs 列表非空）都要逐 provider 对齐 Tauri 适配器。
- 浏览器模式对远程 API 天然受 CORS 限制：连通性测试对远程 provider 的网络失败回退到
  "密钥存在即视为已配置"，本地 Ollama 失败才判定不可达（并在注释中说明
  `OLLAMA_ORIGINS`/HTTPS 预览可能误报）。

## 相关

- 进度：`docs/root-cause-resolution/2026-08/progress-2026-08-07-100000.md`
- 文件：`crates/model-gateway/src/providers/google.rs`、`frontend/src/preview-bridge/preview-model.ts`
