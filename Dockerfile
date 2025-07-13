# Dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    && ln -sf python3 /usr/bin/python

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Create non-root user
RUN addgroup -g 1001 -S neets && \
    adduser -S neets -u 1001 -G neets

# Copy application code
COPY --chown=neets:neets . .

# Create necessary directories
RUN mkdir -p /app/logs /app/config && \
    chown -R neets:neets /app

# Copy health check script
COPY healthcheck.js ./

# Switch to non-root user
USER neets

# Expose ports
EXPOSE 8080 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node healthcheck.js

# Start the application
CMD ["node", "server.js"]
