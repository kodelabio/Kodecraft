# Use Ubuntu base image with Node.js pre-installed
FROM node:22.18.0-bookworm


# Install system dependencies including X11/Xvfb
RUN apt-get update && apt-get install -y \
    xvfb \
    x11-apps \
    wget \
    curl \
    netcat-openbsd \
    ca-certificates \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Copy application code
COPY . .

RUN cd mindcraft && npm install && cd ..

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json if they exist
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production || npm install

# Apply patches and fixes to node_modules
RUN sed -i "s/'physicTick'/'physicsTick'/g" /app/node_modules/mineflayer-pvp/lib/PVP.js && \
    sed -i 's/throw new Error(`Unknown entity/return; \/\/throw new Error(`Unknown entity/g' /app/node_modules/prismarine-viewer/viewer/lib/entity/Entity.js

RUN chmod +x scripts/apply-patches.sh
RUN ./scripts/apply-patches.sh


# Create a directory for logs
RUN mkdir -p /app/logs

# Copy .env file (you should provide this)
# If using .env, uncomment the line below or mount it
# COPY .env .env


# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose ports (adjust based on your needs)
# Port 4001 for leader bot, 4002+ for worker bots
EXPOSE 4001 4002 4003 4004 4005

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:4001/api/agent/status || exit 1

# Run the entrypoint script
ENTRYPOINT ["/entrypoint.sh"]
