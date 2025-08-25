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

# Create reports directory for JUnit XML files (volume-mounted from host)
RUN mkdir -p /app/reports

# Ensure specmatic binary is accessible and executable
RUN chmod +x /usr/local/bin/specmatic 2>/dev/null || \
    chmod +x /app/specmatic 2>/dev/null || \
    find /usr -name "specmatic" -type f -exec chmod +x {} \; 2>/dev/null || \
    find / -name "specmatic" -type f -exec chmod +x {} \; 2>/dev/null

# Change ownership of the app directory including reports
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

# Override the base image entrypoint and set our MCP server as the default command
ENTRYPOINT []
CMD ["node", "build/index.js"]