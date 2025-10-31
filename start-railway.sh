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

# Check if models are already installed
echo "🔍 Checking for existing AI models..."
ollama list

# Pull models if they don't exist
if ! ollama list | grep -q "tinyllama:1.1b"; then
    echo "📥 Downloading TinyLlama model (this may take a few minutes)..."
    ollama pull tinyllama:1.1b || {
        echo "❌ Failed to pull tinyllama:1.1b"
        echo "⚠️  Continuing anyway - models may need to be pulled manually"
    }
else
    echo "✅ TinyLlama model already exists"
fi

if ! ollama list | grep -q "gpt2"; then
    echo "📥 Downloading GPT-2 model (this may take a few minutes)..."
    ollama pull gpt2 || {
        echo "❌ Failed to pull gpt2"
        echo "⚠️  Continuing anyway - models may need to be pulled manually"
    }
else
    echo "✅ GPT-2 model already exists"
fi

# Verify models are available
echo "🔍 Final model check:"
ollama list

# Start Node.js backend
echo "🚀 Starting Node.js backend..."
node server.js &
NODE_PID=$!

# Give Node.js a moment to start
sleep 2

# Check if Node.js process is still running
if ! kill -0 $NODE_PID 2>/dev/null; then
    echo "❌ Node.js process failed to start!"
    echo "⚠️  Checking for errors..."
    exit 1
fi

echo "✅ Node.js backend started (PID: $NODE_PID)"

# Wait for Node.js process (main process)
# If it exits, the container will stop
wait $NODE_PID
NODE_EXIT_CODE=$?

if [ $NODE_EXIT_CODE -ne 0 ]; then
    echo "❌ Node.js process exited with code $NODE_EXIT_CODE"
    cleanup
    exit $NODE_EXIT_CODE
fi

