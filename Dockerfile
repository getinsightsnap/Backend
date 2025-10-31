# Use Node.js base image
FROM node:18-slim

# Install system dependencies for Ollama
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Ollama
RUN curl -fsSL https://ollama.ai/install.sh | sh

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy backend code
COPY . .

# Pull Ollama models (this happens during build, models persist in image)
# Note: This will make the build take longer but ensures models are ready
RUN ollama pull tinyllama:1.1b || true
RUN ollama pull gpt2 || true

# Copy and make startup script executable
COPY start-railway.sh /start-railway.sh
RUN chmod +x /start-railway.sh

# Expose ports
# Port 3001 for backend API, Port 11434 for Ollama (internal only)
EXPOSE 3001

# Use the startup script
CMD ["/start-railway.sh"]

