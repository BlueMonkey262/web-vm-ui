#!/bin/bash
# Make executable: chmod +x start_vm_web.sh

# Ensure the script quits all child processes on exit
trap "kill 0" SIGINT SIGTERM EXIT

# Start all services in the background
websockify 5959 localhost:5900 &
uvicorn backend:app --host 0.0.0.0 --port 8000 --reload &
cd /home/eli/VS\ Code\ Projects/vm-web-ui/web-vm-ui
python3 -m http.server 3000 &

# Wait for all background jobs to finish
wait
