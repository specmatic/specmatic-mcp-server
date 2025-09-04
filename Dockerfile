# Use Node.js latest stable for security and reduced vulnerabilities
FROM node:latest

# Install Java (required by Specmatic)
RUN apt-get update && apt-get install -y \
    default-jre \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (includes specmatic via npm)
RUN npm ci
COPY src/ ./src/
RUN npm run build

# Install only production dependencies and clean cache
RUN npm ci --only=production && npm cache clean --force

# Create a non-root user
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home specmatic

# Create reports directory for JUnit XML files (volume-mounted from host)
RUN mkdir -p /app/reports

# Change ownership of the app directory including reports
RUN chown -R specmatic:nodejs /app

# Switch to non-root user
USER specmatic

# Set environment variables
ENV NODE_ENV=production


# Make the script executable  
RUN chmod +x build/index.js

# Override the base image entrypoint and set our MCP server as the default command
ENTRYPOINT []
CMD ["node", "build/index.js"]