# 手写 JSON 键名必须与 TS 类型逐键对齐（2026-09-26）

## 问题

`/dsh/test-source` 测试连接恒显示"已连接（-ms）"：Rust handler 用
`serde_json::json!({"latencyMs": …})` 手写响应键名，前端 `DshTestResult`
读的是 `latency_ms` → `undefined` → `?? '-'`。连带自动检测的延迟比较恒取首项
（官方源），且全程无报错、无测试失败，静默错位。

## 根因

- `json!` 手写键绕过了 serde 的字段名检查：结构体字段本就是 `latency_ms`，
  只有手写 JSON 处写错，编译器与既有测试都看不见。
- `httpBridge.call` 做透传解码，不做键名转换/校验，错位在前端只表现为
  `undefined` 回退值。

## 修复

1. **Rust**：键名改 `latency_ms`，与 `DshTestResult` 对齐。
2. **测试**：新增 `test_source_response_keys_match_frontend_type`，断言
   `latency_ms` 键存在、`latencyMs` 键不存在（拒连本地端口，快失败、无外部依赖）。
3. 同函数输入校验一并收紧（`source_mode`/`npm_registry`/proxy 本体非法类型 →
   `InvalidInput`，5 种非法输入 + 原子性测试）。

## 教训

- 手写 `json!` 响应必须配**键名存在性断言测试**（正向值断言不够：`None` 序列化为
  `null` 时键仍在，值断言测不出错位）。
- 前后端字段一处手写、两处类型时，把"键名一致"写进测试而非靠肉眼；`??` 回退值
  会吞掉错位信号，显示层出现 `-`/`Unknown` 类占位时先查键名契约。
