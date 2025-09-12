# Multi-stage build for minimal production image
FROM node:22-slim AS builder

# Set working directory
WORKDIR /app

# Copy package files for better layer caching
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --frozen-lockfile

# Copy source code
COPY src/ ./src/

# Build the TypeScript code
RUN npm run build

# Production stage - use slim with minimal footprint
FROM node:22-slim

# Install minimal Java runtime for Specmatic
RUN apt-get update && apt-get install -y \
    openjdk-17-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies with clean cache
RUN npm ci --only=production --frozen-lockfile && \
    npm cache clean --force && \
    rm -rf ~/.npm

# Copy built application from builder stage
COPY --from=builder /app/build ./build

# Create a non-root user (Debian syntax)
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs specmatic

# Create reports directory for JUnit XML files
RUN mkdir -p /app/reports && \
    chown -R specmatic:nodejs /app

# Switch to non-root user
USER specmatic

# Set environment variables
ENV NODE_ENV=production

# Make the script executable
RUN chmod +x build/index.js

# Override the base image entrypoint and set our MCP server as the default command
ENTRYPOINT []
CMD ["node", "build/index.js"]