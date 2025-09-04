# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that exposes Specmatic Contract Test capability, allowing coding agents to use it as a reference while implementing OpenAPI specification.

## Current State

This is a fully implemented MCP (Model Context Protocol) server built with TypeScript/Node.js that exposes Specmatic contract testing capabilities. The implementation includes:

- **MCP Server**: Complete implementation with 3 main tools
- **npm Package**: Standalone package using `specmatic` npm dependency
- **Secure Docker**: Uses `node:latest` base image for reduced vulnerabilities
- **Contract Testing**: Supports both standard and resiliency testing
- **Mock Server**: Can start mock servers from OpenAPI specs
- **Build System**: TypeScript compilation with npm scripts
- **Automated Testing**: MCP Inspector integration for testing npm package functionality

## Development Setup

The project is built with TypeScript and uses Node.js. Always use nvm to use the node stable version.

### Prerequisites
- Node.js (use `nvm use stable`)
- Docker (optional - for running the MCP server in container)
- npm package can be run standalone without Docker

### Available Commands
```bash
# Build the TypeScript code
npm run build

# Start the MCP server locally
npm start

# Development mode with watch
npm run dev

# Testing commands
npm run test:smoke      # Run smoke test loop (recommended)
npm run test:mcp        # Run MCP Inspector tests for npm package
npm run inspect         # Interactive MCP Inspector

# Docker commands (optional)
npm run docker:build    # Build Docker image
npm run docker:run      # Run in container
npm run start:host-network  # Run with host networking for localhost API testing

# Setup host for development
npm run setup          # Runs setup-host.sh script
```

### Dependencies
- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `specmatic`: Contract testing framework (npm package)
- `zod`: Input validation and parsing
- TypeScript for type safety

### Development Dependencies
- `@modelcontextprotocol/inspector`: Automated testing for MCP servers

## Reference Literature

Refer to https://docs.specmatic.io/getting_started.html for how to use Specmatic to run Contract Tests against an API

## Architecture Notes

This MCP server exposes Specmatic's contract testing functionality to AI coding agents following the Model Context Protocol specification.

**Architecture Philosophy**: 
- **npm-first approach**: Standalone npm package that can be published and run independently
- **Security-focused**: Uses `node:latest` Docker base instead of potentially vulnerable Specmatic base image
- **Testable**: MCP Inspector integration enables automated testing without Docker complications
- **Backward compatible**: Docker usage remains unchanged for existing users

### MCP Tools Implemented
1. **`run_contract_test`**: Validates API implementations against OpenAPI specifications
2. **`run_resiliency_test`**: Tests API resilience with boundary condition testing (enables `SPECMATIC_GENERATIVE_TESTS`)
3. **`manage_mock_server`**: Complete mock server lifecycle management - start, stop, and list running servers from OpenAPI specs for frontend development

### npm Package Implementation
- **Primary Mode**: Standalone npm package using `specmatic` npm dependency
- **Command Access**: Uses `npx specmatic@latest` for all Specmatic operations
- **Local Development**: Can be run and tested locally without Docker
- **Security**: No dependency on potentially vulnerable Docker base images

### Docker Implementation (Optional)
- **Base Image**: Uses `node:latest` for security and reduced vulnerabilities
- **npm Installation**: Installs `specmatic` via npm during Docker build
- **Volume Mapping**: OpenAPI specs are written to temporary files and passed to specmatic command
- **No Docker-in-Docker**: Runs specmatic via npm within the container
- **Backward Compatibility**: Maintains same API and usage patterns for existing Docker users

### Technical Approach
- **Temporary Files**: OpenAPI specs are written to temp directories for each operation
- **Process Management**: Uses Node.js `spawn()` to execute `npx specmatic@latest` commands
- **Error Handling**: Comprehensive parsing of specmatic output with timeout protection
- **Result Formatting**: Structured output with test summaries and failure details
- **Testing**: MCP Inspector validates all three tools automatically
- **Cross-platform**: Works on any system with Node.js, no Docker required for development

### Constraints
- Always use nvm to use node stable version
- Never use Docker in Docker
- Use npm-installed specmatic instead of pre-compiled binaries
- Prefer local npm development over Docker for testing and development

## Implementation Details

### MCP Server Structure
The server implements the Model Context Protocol using `@modelcontextprotocol/sdk` and provides three main tools:

#### Tool: `run_contract_test`
- **Purpose**: Validates API implementations against OpenAPI specifications
- **Input**: OpenAPI spec content, API base URL, spec format (yaml/json)
- **Process**: Writes spec to temp file, runs `npx specmatic@latest test --testBaseURL=<url>`
- **Output**: Test results with pass/fail status, detailed failure information

#### Tool: `run_resiliency_test`
- **Purpose**: Tests API resilience with contract-invalid requests
- **Environment**: Sets `SPECMATIC_GENERATIVE_TESTS=true` for boundary testing
- **Process**: Same as contract test but with `SPECMATIC_GENERATIVE_TESTS=true` and generative test mode enabled
- **Output**: Enhanced testing results including edge case validation

#### Tool: `manage_mock_server`
- **Purpose**: Complete mock server lifecycle management for frontend development
- **Subcommands**:
  - **`start`**: Runs `npx specmatic@latest stub --port=<port>` with OpenAPI spec, tracks running servers
  - **`stop`**: Terminates a running mock server by port number, removes from tracking
  - **`list`**: Shows all currently running mock servers with ports, URLs, and process IDs
- **Management**: Prevents port conflicts, enables resource cleanup, supports multiple concurrent servers
- **Output**: Command-specific formatted results with server details and usage instructions

### Result Processing
- **Output Parsing**: Extracts test counts, pass/fail status from specmatic output
- **Error Handling**: Captures both stdout and stderr with proper error formatting  
- **Timeout Protection**: 5-minute timeout for test execution
- **Cleanup**: Automatic temporary file cleanup after operations

### File Management
- **Temporary Files**: Creates unique temp directories for each operation
- **Spec Writing**: Supports both YAML and JSON OpenAPI specifications
- **Cleanup Strategy**: Ensures temp files are removed even on errors

## MCP Configuration for Claude Code

**IMPORTANT:** To enable JUnit XML report generation and analysis, you must configure Claude Code with volume mapping. Update your MCP configuration as follows:

### For npm package usage (recommended):
```bash
claude mcp add specmatic-mcp
```

### For Docker usage (optional):
```bash
claude mcp add-json specmatic '{"command":"docker","args":["run","--rm","-i","--network=host","-v","$(pwd)/reports:/app/reports","specmatic-mcp"],"env":{}}'
```

**npm package benefits:**
- Faster startup (no Docker overhead)
- Direct access to local file system for reports
- Easier development and debugging
- Automatic dependency management

**Docker usage benefits:**
- Volume mapping allows JUnit XML reports to be written to `./reports/` on your host system
- Claude Code to read detailed test reports for analysis
- Persistent reports that survive container restarts
- Isolated environment

## Usage Examples

### Contract Testing
```javascript
// MCP Tool Call
{
  name: "run_contract_test",
  arguments: {
    openApiSpec: "openapi: 3.0.0\ninfo:\n  title: API\n  version: 1.0.0\npaths:\n  /users:\n    get:\n      responses:\n        200:\n          description: Users list",
    apiBaseUrl: "https://api.example.com",
    specFormat: "yaml"
  }
}

// Expected Output Format (with JUnit Report)
✅ Test Status: PASSED
Summary:
- Total Tests: 5
- Passed: 5
- Failed: 0

📄 Detailed JUnit Report: `./reports/TEST-ContractTests-20250825T142301.xml`

For complete failure analysis, use the Read tool to analyze the JUnit XML report above.
The report contains detailed test results, timing information, and stack traces.
```

### Resiliency Testing
```javascript
// MCP Tool Call  
{
  name: "run_resiliency_test",
  arguments: {
    openApiSpec: "<OpenAPI spec content>",
    apiBaseUrl: "https://api.example.com",
    specFormat: "yaml"
  }
}

// Expected Output Format (with JUnit Report)
❌ Test Status: FAILED
**Boundary Condition Testing Enabled** - Tests include contract-invalid requests to verify error handling

Summary:
- Total Tests: 25
- Passed: 18
- Failed: 7

📄 Detailed JUnit Report: `./reports/TEST-ResiliencyTests-20250825T143405.xml`

For complete failure analysis, use the Read tool to analyze the JUnit XML report above.
*Console output omitted - detailed results available in JUnit report above.*
```

### Mock Server Management

#### Start Mock Server
```javascript
// MCP Tool Call
{
  name: "manage_mock_server", 
  arguments: {
    command: "start",
    openApiSpec: "<OpenAPI spec content>",
    port: 9000,
    specFormat: "yaml"
  }
}

// Expected Output
✅ Mock Server Started Successfully
Server URL: http://localhost:9000
Port: 9000
Process ID: 1234

Usage:
- Make API calls to: http://localhost:9000
- Use this URL in your frontend application configuration
```

#### Stop Mock Server
```javascript
// MCP Tool Call
{
  name: "manage_mock_server",
  arguments: {
    command: "stop",
    port: 9000
  }
}

// Expected Output
✅ Mock Server Stopped Successfully
Port: 9000
Status: Mock server on port 9000 stopped successfully

The mock server has been terminated and the port is now available for reuse.
```

#### List Running Mock Servers
```javascript
// MCP Tool Call
{
  name: "manage_mock_server",
  arguments: {
    command: "list"
  }
}

// Expected Output
📋 Running Mock Servers
Status: Found 2 running mock servers

| Port | URL | Process ID |
|------|-----|------------|
| 9000 | http://localhost:9000 | 1234 |
| 9001 | http://localhost:9001 | 5678 |

Usage:
- Use any of the URLs above in your frontend applications
- Stop specific servers using the 'stop' command with the port number
```

### Input Requirements

#### For Contract and Resiliency Testing
- **openApiSpec**: Valid OpenAPI 3.x specification as string (YAML or JSON)
- **apiBaseUrl**: Complete URL including protocol (e.g., https://api.example.com)
- **specFormat**: Either "yaml" or "json" (defaults to "yaml")

#### For Mock Server Management
- **command**: Required - one of "start", "stop", "list"
- **openApiSpec**: Valid OpenAPI 3.x specification as string (YAML or JSON) - **required for "start" command**
- **port**: Number between 1024-65535 - **required for "start" and "stop" commands** (defaults to 9000 for "start")
- **specFormat**: Either "yaml" or "json" (defaults to "yaml") - **used with "start" command**

#### Conditional Requirements
- **start**: Requires `openApiSpec` and `port` parameters
- **stop**: Requires `port` parameter only  
- **list**: No additional parameters required

## Testing and Development

### Smoke Test (Recommended)
The package includes a comprehensive smoke test that validates all functionality:

```bash
# Run the complete smoke test loop
npm run test:smoke
```

**Smoke Test Flow:**
1. **Start Mock Server**: Uses `test-spec.yaml` to start a Specmatic mock server on port 9000
2. **Run Contract Test**: Tests the mock server against the same OpenAPI specification  
3. **Run Resiliency Test**: Tests API resilience with boundary conditions against the mock
4. **Stop Mock Server**: Cleans up the mock server
5. **Report Results**: Shows pass/fail status for each step

This is a complete self-contained test that validates all three MCP tools without external dependencies.

### MCP Inspector Testing
The package also includes MCP Inspector integration:

```bash
# Interactive MCP Inspector  
npm run inspect

# CLI-based testing
npm run test:mcp
```

### Development Workflow
1. **Local development**: Use `npm run dev` for TypeScript compilation with watch mode
2. **Smoke testing**: Use `npm run test:smoke` to validate all MCP functionality
3. **Building**: Use `npm run build` to compile TypeScript  
4. **Interactive testing**: Use `npm run inspect` for manual MCP tool testing
5. **Docker testing** (optional): Use `npm run docker:build && npm run docker:run`

### Publishing as npm Package
This MCP server is designed to be published as a standalone npm package:

```bash
# Build the package
npm run build

# Publish to npm registry
npm publish

# Install globally
npm install -g specmatic-mcp

# Run directly
specmatic-mcp
```