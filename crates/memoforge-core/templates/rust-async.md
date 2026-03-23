---
id: rust-async
title: Rust 异步编程
tags: [rust, async, programming]
summary: Rust 异步编程基础概念和最佳实践
created: 2026-03-23T00:00:00Z
updated: 2026-03-23T00:00:00Z
---

# Rust 异步编程

## async/await 基础

Rust 的异步编程基于 Future trait 和 async/await 语法。

```rust
async fn fetch_data() -> Result<String, Error> {
    let response = reqwest::get("https://api.example.com")
        .await?;
    response.text().await
}
```

## Tokio 运行时

Tokio 是最流行的异步运行时：

```rust
#[tokio::main]
async fn main() {
    let result = fetch_data().await;
}
```

## 最佳实践

- 避免在 async 函数中阻塞
- 使用 tokio::spawn 并发执行任务
- 合理使用 timeout 和 cancellation
