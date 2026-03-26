#!/bin/bash

# MemoForge Tauri 启动脚本
# 同时启动前端开发服务器和 Tauri 应用

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
TAURI_DIR="$PROJECT_ROOT/crates/memoforge-tauri"

echo "🚀 MemoForge 启动中..."
echo ""

# 检查依赖是否安装
check_dependencies() {
    echo "📋 检查依赖..."

    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        echo "❌ 未安装 Node.js，请先安装"
        exit 1
    fi

    # 检查 Rust
    if ! command -v cargo &> /dev/null; then
        echo "❌ 未安装 Rust/Cargo，请先安装"
        exit 1
    fi

    # 检查 npm 依赖
    if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
        echo "📦 安装前端依赖..."
        cd "$FRONTEND_DIR"
        npm install
    fi

    echo "✅ 依赖检查完成"
    echo ""
}

# 方式1: 使用 Tauri CLI (推荐)
start_with_tauri_cli() {
    echo "🔧 启动方式: Tauri CLI"
    echo ""

    # 检查是否安装了 tauri-cli
    if ! cargo tauri --version &> /dev/null; then
        echo "📦 安装 tauri-cli..."
        cargo install tauri-cli --version "^2.0"
    fi

    cd "$PROJECT_ROOT"
    echo "🎯 启动 Tauri 开发模式..."
    cargo tauri dev
}

# 方式2: 直接运行 Tauri crate (需要先启动前端)
start_with_cargo() {
    echo "🔧 启动方式: Cargo 直接运行"
    echo ""

    # 先启动前端开发服务器 (后台运行)
    echo "🌐 启动前端开发服务器..."
    cd "$FRONTEND_DIR"
    npm run dev &
    FRONTEND_PID=$!

    # 等待前端服务器启动
    echo "⏳ 等待前端服务器启动..."
    sleep 3

    # 启动 Tauri
    echo "🖥️  启动 Tauri 应用..."
    cd "$TAURI_DIR"
    cargo run

    # 清理
    kill $FRONTEND_PID 2>/dev/null || true
}

# 主逻辑
main() {
    check_dependencies

    # 选择启动方式
    if cargo tauri --version &> /dev/null; then
        start_with_tauri_cli
    else
        echo "⚠️  未检测到 tauri-cli，将使用 cargo 直接运行"
        echo "   建议运行: cargo install tauri-cli --version \"^2.0\""
        echo ""
        start_with_cargo
    fi
}

# 捕获退出信号
trap 'echo ""; echo "👋 已退出"; exit 0' INT TERM

main
