#!/bin/bash
# Make executable: chmod +x start_vm_web.sh

# Stop everything cleanly on exit
trap "echo 'Shutting down...'; kill 0" SIGINT SIGTERM EXIT

# Resolve directories
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$BASE_DIR/backend"
FRONTEND_DIR="$BASE_DIR"  # Parent directory of backend

echo "Base directory: $BASE_DIR"
echo "Backend directory: $BACKEND_DIR"
echo "Frontend directory: $FRONTEND_DIR"
echo ""

echo "Starting services..."

# 1️⃣ Start SPICE websockify bridge
echo "[1/3] Starting websockify on port 5959 → 5900"
websockify 5959 localhost:5900 &
sleep 1

# 2️⃣ Start FastAPI backend
echo "[2/3] Starting FastAPI backend on port 8000"
cd "$BACKEND_DIR"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
sleep 1

# 3️⃣ Start frontend server serving the entire parent directory
echo "[3/3] Starting frontend server on port 3000"
cd "$FRONTEND_DIR"
python3 -m http.server 3000 &
sleep 1


echo ""
echo "All services started."
echo "Web UI:        http://localhost:3000/main_page.html"
echo "API backend:   http://localhost:8000"
echo "SPICE bridge:  ws://localhost:5959"
echo ""

# Wait for all background processes
wait
