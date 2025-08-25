# Specmatic MCP Server

A Model Context Protocol (MCP) server that exposes Specmatic's contract testing capabilities to AI coding agents like Claude Code. This server enables comprehensive API contract validation and mock server management for development workflows.

## Features

### MCP Tools Available

1. **`run_contract_test`** - Validate API implementations against OpenAPI specifications
2. **`run_resiliency_test`** - Test API resilience with boundary condition testing
3. **`manage_mock_server`** - Complete mock server lifecycle management
   - **start** - Create mock servers from OpenAPI specs
   - **stop** - Terminate running mock servers
   - **list** - Show all running mock servers

## Prerequisites

- Docker
- Node.js and npm (for development)
- Claude Code (for using the MCP server)

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

After running this command, the MCP server will be automatically configured in your Claude Code settings.

## Usage Examples

### Contract Testing
Ask Claude Code to validate your API:
```
"Run contract tests against my API at https://api.example.com using this OpenAPI spec: [paste your spec]"
```

### Resiliency Testing
Test how your API handles edge cases:
```
"Run resiliency tests to check how my API handles invalid requests using this spec: [paste your spec]"
```

### Mock Server Management
Create mock servers for frontend development:

```
"Start a mock server on port 9000 using this OpenAPI spec: [paste your spec]"
"List all running mock servers"
"Stop the mock server on port 9000"
```

## Development Workflow

1. **Start Mock Server**: Claude Code creates a mock server from your OpenAPI spec
2. **Develop UI**: Use the mock server URL in your frontend application
3. **Multiple APIs**: Run multiple mock servers on different ports simultaneously
4. **Clean Up**: Stop specific servers when done to free up resources

## Architecture

- **Base Image**: Uses `specmatic/specmatic:latest` with pre-configured Specmatic environment
- **Process Management**: Tracks running mock servers and enables proper cleanup
- **Temporary Files**: Handles OpenAPI specs securely with automatic cleanup
- **Error Handling**: Comprehensive error reporting and timeout protection

## Development

For local development and testing:

```bash
# Start in development mode
npm run dev

# Run locally (without Docker)
npm start

# Use host networking for localhost API testing
npm run start:host-network
```

See [CLAUDE.md](CLAUDE.md) for detailed implementation documentation and architecture notes.