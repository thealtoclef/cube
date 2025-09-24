#!/bin/bash

set -e

# Function to cleanup on exit
cleanup() {
    echo "Shutting down watcher..."
    if [ ! -z "$WATCHER_PID" ]; then
        kill -TERM $WATCHER_PID 2>/dev/null
    fi
}

# Set trap to cleanup on exit
trap cleanup SIGTERM SIGINT

# Start cube.py watcher as sidecar process if the file exists
if [ -f "cube.py" ]; then
    echo "Starting cube.py content watcher as sidecar..."
    python3 cube-py-watcher.py &
    WATCHER_PID=$!
fi

# Execute the original command (cubejs server) as the main process
echo "Starting Cube.js server as main process..."
exec "$@"
