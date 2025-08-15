# Specmatic MCP Server

A Model Context Protocol (MCP) server that wraps Specmatic's contract testing capabilities, enabling AI coding agents like Claude Code to validate API implementations against OpenAPI specifications.

## Prerequisites

- Docker
- Node.js and npm

## Building

```bash
# Install dependencies
npm install

# Build the TypeScript code
npm run build

# Build the Docker image
npm run docker:build
```

## Adding to Claude Code

Add this MCP server to Claude Code using:

```bash
claude mcp add-json specmatic '{"command":"docker","args":["run","--rm","-i","--network=host","specmatic-mcp-server"],"env":{}}'
```

After running this command, the MCP server will be automatically configured in your Claude Code settings and you can use it to run contract tests, resiliency tests, and start mock servers from OpenAPI specifications.