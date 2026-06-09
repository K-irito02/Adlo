# CI 状态监控模块经验

> 来源：2026-06-09 CI 模块全量 bug 修复（15 项）

## 1. Token 安全存储

### Tauri 模式：系统钥匙串

```rust
// crates/credential/src/lib.rs
CredentialStore::new("ai-digital-life", "ci-access-token")
    .set_password(token)?;  // 自动降级到加密文件
```

- **优先**写入系统钥匙串（Windows Credential Manager / macOS Keychain / Linux Secret Service）
- **降级**：系统钥匙串不可用时自动降级到机器密钥加密文件
- **禁止**：禁止在 console.log/error 中输出 token

### 浏览器模式：localStorage + 内存

```typescript
// ciSlice.ts
if (isTauriMode()) {
  await bridge.ci.setAccessToken(token);  // 后端存钥匙串
} else {
  window.localStorage.setItem('adl-ui:ci-access-token', token);  // 前端存 localStorage
}
```

- **双层存储**：调用 bridge API + localStorage 双写，保证页面刷新后能从 server 恢复
- **安全头传输**：token 通过 `X-CI-Access-Token` 自定义头传递，**不**放在 URL 参数中

## 2. GitHub API 安全实践

### 认证头构建

```rust
fn build_auth_header(&self, token: &Option<String>) -> Option<HeaderValue> {
    token.as_ref()
        .filter(|t| !t.trim().is_empty())
        .and_then(|t| HeaderValue::from_str(&format!("Bearer {t}")).ok())
}
```

- 空 token 过滤，避免发送无效认证头
- GitHub 匿名限制 60 次/小时，认证后提升到 5000 次/小时

### 错误状态处理

```rust
// 错误做法：静默失败，隐藏认证问题
if !response.status().is_success() {
    return Ok(Vec::new());  // ❌ 隐藏真实错误
}

// 正确做法：传播错误
if !response.status().is_success() {
    return Err(AppError::Network(format!(
        "GitHub API returned {}: {}", status, body
    )));
}
```

### 日志二进制判断

```rust
// GitHub 返回的是 zip，二进制内容不能当作文本
let preview = if content.as_bytes().starts_with(b"PK") || content.len() > 20_000 {
    format!("({} bytes - view the full log at GitHub)", content.len())
} else {
    content  // 只有文本才显示
};
```

## 3. 双端一致性（Tauri / 浏览器）

### 预览模式 API 端点

```typescript
// previewWorkspaceService.ts
const API_PREFIX = '/__adl_preview_api__';

// CI 令牌管理
if (request.method === 'POST' && requestUrl.pathname === `${API_PREFIX}/ci/set-access-token`) {
  ciAccessToken = JSON.parse(body).token;
  writeJson(response, ok(true));
}
```

- 预览模式需要**完整复刻** Tauri IPC 接口，否则浏览器模式下功能不可用
- 本次补充了 `/ci/set-access-token`、`/ci/clear-access-token`、`/ci/has-access-token` 三个端点

### 类型定义集中管理

```typescript
// 正确：从 kernel/index.ts 导入
import type { CiJobSummary, CiStatusSnapshot, CiWorkflowRunSummary } from '../src/kernel/index';

// 错误：重复定义
interface CiWorkflowRun { ... }  // ❌ 与 kernel/index.ts 重复
```

- `kernel/index.ts` 是前端类型定义的真源，`ipc-types.generated.ts` 是 Rust 生成的 bigint 版本
- `previewWorkspaceService.ts` 仅需保留 `CiWorkflowRunRaw` 用于 GitHub API 原始 JSON 映射

## 4. React Hook 规范

### useEffect 依赖数组

```typescript
// 错误：有 eslint-disable 压制
useEffect(() => {
  if (ciConfig.owner && ciConfig.repo) {
    void refreshCiStatus();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);  // ❌ 压制警告，配置变更不会自动刷新

// 正确：完整依赖数组
useEffect(() => {
  if (ciConfig.owner && ciConfig.repo) {
    void refreshCiStatus();
  }
}, [ciConfig.owner, ciConfig.repo, refreshCiStatus]);  // ✅
```

- **禁止**用 `eslint-disable` 压制 `react-hooks/exhaustive-deps` 警告
- 压制后配置变更不会自动刷新，导致用户界面与数据不一致

## 5. 内存保护

### 终端 Buffer 长度限制

```typescript
const MAX_BUFFER_SIZE = 10 * 1024;  // 10KB
const TRUNCATE_SIZE = 5 * 1024;     // 截断后保留 5KB

const unsubscribe = win.digitalLife.subscribePtyOutput((event) => {
  buffer += event.data;
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer = buffer.slice(-TRUNCATE_SIZE);  // 从头部截断，保留最近输出
  }
});
```

- 若 git push 匹配失败，buffer 会无限累积，导致内存泄漏
- 截断策略：从**头部**截断，保留**最近**的终端输出用于模式匹配

## 6. Rust 编码规范

### 函数末尾分号

```rust
// 错误：缺少分号
pub fn set_ci_access_token(token: &str) -> Result<(), AppError> {
    CredentialStore::new(DEFAULT_SERVICE, CI_CREDENTIAL_ACCOUNT)
        .set_password(token)?  // ❌ 缺少分号
}

// 正确
pub fn set_ci_access_token(token: &str) -> Result<(), AppError> {
    CredentialStore::new(DEFAULT_SERVICE, CI_CREDENTIAL_ACCOUNT)
        .set_password(token)?;  // ✅
    Ok(())
}
```

- Rust 函数末尾需要 `;` 结束语句，无分号会导致编译失败
- 使用 `?` 链式调用时，最后一行也需要分号

### 可选参数过滤

```rust
// 错误：workflow_id 未传递
let mut req = self.http.get(&url).query(&[
    ("branch", config.branch.as_str()),
    ("per_page", "5"),
]);

// 正确：可选参数按需添加
let mut query_params = vec![
    ("branch", config.branch.as_str()),
    ("per_page", "5"),
];
if let Some(workflow_id) = &config.workflow_id {
    query_params.push(("workflow_id", workflow_id.as_str()));
}
```

## 7. 相关文档

- [变更摘要：新增完整的 CI 状态监控功能模块](../变更摘要/新增完整的CI状态监控功能模块.md)
- [docs/superpowers/specs/2026-06-09-ci-panel-help-design.md](../superpowers/specs/2026-06-09-ci-panel-help-design.md)
