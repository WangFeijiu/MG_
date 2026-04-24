#!/bin/bash
# MasterGo DSL Editor - 启动所有服务
# Usage: ./start.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

echo "========================================"
echo "  MasterGo DSL Editor 启动脚本"
echo "========================================"
echo ""

# 检查 node_modules
if [ ! -d "node_modules" ]; then
  echo "📦 安装依赖..."
  npm install
fi

# 启动 server（后台）
echo "🚀 启动 Server (端口 3456)..."
npm run server &
SERVER_PID=$!

# 等待 server 启动
sleep 2

# 启动 react-app dev（后台）
echo "⚛️  启动 React App (端口 5173)..."
cd react-app && npm run dev &
REACT_PID=$!

echo ""
echo "========================================"
echo "  所有服务已启动!"
echo "========================================"
echo ""
echo "  Server:  http://localhost:3456"
echo "  React:   http://localhost:5173"
echo "  Preview: http://localhost:5173/preview.html"
echo ""
echo "  按 Ctrl+C 停止所有服务"
echo "========================================"

# 捕获 Ctrl+C
cleanup() {
  echo ""
  echo "🛑 停止所有服务..."
  kill $SERVER_PID 2>/dev/null || true
  kill $REACT_PID 2>/dev/null || true
  echo "✅ 已停止"
  exit 0
}
trap cleanup SIGINT SIGTERM

# 等待后台进程
wait
