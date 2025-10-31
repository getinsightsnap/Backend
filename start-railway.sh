#!/bin/bash

# Start Ollama server in background
echo "🚀 Starting Ollama server..."
ollama serve &
OLLAMA_PID=$!

# Function to cleanup on exit
cleanup() {
    echo "🛑 Shutting down services..."
    kill $OLLAMA_PID 2>/dev/null
    kill $NODE_PID 2>/dev/null
    exit
}

trap cleanup SIGTERM SIGINT

# Wait for Ollama to be ready
echo "⏳ Waiting for Ollama to be ready..."
MAX_WAIT=60
WAIT_COUNT=0

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "✅ Ollama is ready!"
        break
    fi
    WAIT_COUNT=$((WAIT_COUNT + 1))
    sleep 1
done

if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
    echo "⚠️  Warning: Ollama may not be fully ready, but continuing..."
fi

# Verify models are available
echo "🔍 Checking for AI models..."
ollama list

# Start Node.js backend
echo "🚀 Starting Node.js backend..."
node server.js &
NODE_PID=$!

# Wait for Node.js process (main process)
wait $NODE_PID

