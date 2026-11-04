---
description: Rust inline #[cfg(test)] unit test organization — all unit tests inlined at end of source files, not in separate tests/ directories
globs: adlo/crates/**/*.rs,adlo/src-tauri/**/*.rs
alwaysApply: false
---

## Rust 内联 #[cfg(test)] 单元测试组织

### 规则描述

所有 Rust 单元测试必须放置在源文件内的 `#[cfg(test)] mod tests { use super::*; ... }` 块中，不创建独立的 `tests/` 目录用于单元测试。集成测试（需要外部依赖或跨模块测试）可放在 crate 级别的 `tests/` 目录中。

### 正确示例

```rust
// ✅ 正确：内联测试模块在源文件末尾
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn my_function_works() {
        let result = my_function(42);
        assert_eq!(result, 84);
    }
}
```

### 错误示例

```rust
// ❌ 错误：将单元测试放在 crate/tests/ 目录
// crates/my-crate/tests/unit_tests.rs — 应内联到源文件

// ❌ 错误：缺少 use super::*，需要手动导入每个被测函数
#[cfg(test)]
mod tests {
    use crate::my_function; // 应使用 use super::*

    #[test]
    fn my_function_works() { ... }
}
```

### 适用场景

所有 `crates/` 和 `src-tauri/src/` 目录下的 Rust 源文件。新增 Rust 代码时，对应的单元测试直接写在同文件末尾。