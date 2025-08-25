# Use Specmatic base image with specmatic command readily available
FROM specmatic/specmatic:latest

# Install Node.js and npm
RUN apk add --no-cache nodejs npm

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies and build
RUN npm ci
COPY src/ ./src/
RUN npm run build

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