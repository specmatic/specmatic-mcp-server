# Use Node.js as base image for building our MCP server
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build the TypeScript code
RUN npm run build

# Final stage - use Alpine Linux with Java and Node.js
FROM alpine:latest

# Install necessary packages
RUN apk add --no-cache \
    openjdk17-jre \
    nodejs \
    npm \
    curl \
    && rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /app

# Download Specmatic JAR
RUN curl -L -o specmatic.jar https://github.com/specmatic/specmatic/releases/download/2.18.2/specmatic.jar

# Copy built application from builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S specmatic -u 1001

# Change ownership of the app directory
RUN chown -R specmatic:nodejs /app

# Switch to non-root user
USER specmatic

# Set environment variables
ENV NODE_ENV=production

# Expose port (if needed for HTTP transport in future)
EXPOSE 3000

# Expose port range for mock servers (9000-9010)
EXPOSE 9000-9010

# Make the script executable
RUN chmod +x build/index.js

# Default command to run the MCP server
CMD ["node", "build/index.js"]