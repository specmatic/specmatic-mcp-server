#!/bin/bash

# Specmatic MCP Server Docker Host Network Setup Script
# This script builds the Docker image for host network mode

set -e

echo "🚀 Setting up Specmatic MCP Server for Docker Host Network Mode..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

echo "✅ Docker version: $(docker --version)"

# Build the Docker image
echo "🔨 Building Docker image..."
docker build -t specmatic-mcp-server .

echo ""
echo "🎉 Docker image built successfully!"
echo ""
echo "To run the MCP server with host network access:"
echo "   docker run --rm -i --network=host specmatic-mcp-server"
echo ""
echo "Or use the npm script:"
echo "   npm run start:host-network"
echo ""
echo "The server will now be able to test APIs at localhost URLs when running in Docker."