# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that exposes Specmatic Contract Test capability, allowing coding agents to use it as a reference while implementing OpenAPI specification.

## Current State

This is a fully implemented MCP (Model Context Protocol) server built with TypeScript/Node.js that exposes Specmatic contract testing capabilities. The implementation includes:

- **MCP Server**: Complete implementation with 3 main tools
- **Docker Integration**: Uses `specmatic/specmatic:latest` as base image
- **Contract Testing**: Supports both standard and resiliency testing
- **Mock Server**: Can start mock servers from OpenAPI specs
- **Build System**: TypeScript compilation with npm scripts

## Development Setup

The project is built with TypeScript and uses Node.js. Always use nvm to use the node stable version.

### Prerequisites
- Node.js (use `nvm use stable`)
- Docker (for running the MCP server)

### Available Commands
```bash
# Build the TypeScript code
npm run build

# Start the MCP server locally
npm start

# Development mode with watch
npm run dev

# Docker commands
npm run docker:build    # Build Docker image
npm run docker:run      # Run in container
npm run start:host-network  # Run with host networking for localhost API testing

# Setup host for development
npm run setup          # Runs setup-host.sh script
```

### Dependencies
- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `zod`: Input validation and parsing
- TypeScript for type safety

## Reference Literature

Refer to https://docs.specmatic.io/getting_started.html for how to use Specmatic to run Contract Tests against an API

## Architecture Notes

This MCP server exposes Specmatic's contract testing functionality to AI coding agents following the Model Context Protocol specification.

### MCP Tools Implemented
1. **`run_contract_test`**: Validates API implementations against OpenAPI specifications
2. **`run_resiliency_test`**: Tests API resilience with boundary condition testing (enables `SPECMATIC_GENERATIVE_TESTS`)
3. **`manage_mock_server`**: Complete mock server lifecycle management - start, stop, and list running servers from OpenAPI specs for frontend development

### Docker Implementation
- **Base Image**: Uses `specmatic/specmatic:latest` (never start with generic image and download JAR)
- **Command Access**: `specmatic` command is readily available in the base image
- **Volume Mapping**: OpenAPI specs are written to temporary files and passed to specmatic command
- **No Docker-in-Docker**: Runs specmatic directly within the container

### Technical Approach
- **Temporary Files**: OpenAPI specs are written to temp directories for each operation
- **Process Management**: Uses Node.js `spawn()` to execute specmatic commands
- **Error Handling**: Comprehensive parsing of specmatic output with timeout protection
- **Result Formatting**: Structured output with test summaries and failure details

### Constraints
- Always use nvm to use node stable version
- Never use Docker in Docker
- Leverage the pre-configured specmatic environment

## Implementation Details

### MCP Server Structure
The server implements the Model Context Protocol using `@modelcontextprotocol/sdk` and provides three main tools:

#### Tool: `run_contract_test`
- **Purpose**: Validates API implementations against OpenAPI specifications
- **Input**: OpenAPI spec content, API base URL, spec format (yaml/json)
- **Process**: Writes spec to temp file, runs `specmatic test --testBaseURL=<url>`
- **Output**: Test results with pass/fail status, detailed failure information

#### Tool: `run_resiliency_test`
- **Purpose**: Tests API resilience with contract-invalid requests
- **Environment**: Sets `SPECMATIC_GENERATIVE_TESTS=true` for boundary testing
- **Process**: Same as contract test but with generative test mode enabled
- **Output**: Enhanced testing results including edge case validation

#### Tool: `manage_mock_server`
- **Purpose**: Complete mock server lifecycle management for frontend development
- **Subcommands**:
  - **`start`**: Runs `specmatic stub --port=<port>` with OpenAPI spec, tracks running servers
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

```bash
claude mcp add-json specmatic '{"command":"docker","args":["run","--rm","-i","--network=host","-v","$(pwd)/reports:/app/reports","specmatic-mcp"],"env":{}}'
```

This volume mapping allows:
- JUnit XML reports to be written to `./reports/` on your host system
- Claude Code to read detailed test reports for analysis
- Persistent reports that survive container restarts

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