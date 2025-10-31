# Use Node.js 20 base image (18 is deprecated)
FROM node:20-slim

# Install system dependencies for Ollama
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Ollama
RUN curl -fsSL https://ollama.ai/install.sh | sh

# Set Ollama context length for TinyLlama compatibility (default 2048, max for TinyLlama)
ENV OLLAMA_CONTEXT_LENGTH=2048

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy backend code
COPY . .

# Copy and make startup script executable
COPY start-railway.sh /start-railway.sh
RUN chmod +x /start-railway.sh

# Note: Models are pulled at runtime (after Ollama server starts) in start-railway.sh
# This is because Ollama server must be running for 'ollama pull' to work

# Expose ports
# Port 3001 for backend API, Port 11434 for Ollama (internal only)
EXPOSE 3001

# Use the startup script
CMD ["/start-railway.sh"]

