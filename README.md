# Specmatic MCP Server

A Model Context Protocol (MCP) server that exposes Specmatic's contract testing capabilities to AI coding agents like Claude Code.

## Adding to Claude Code

**Build the Docker image first:**
```bash
npm run docker:build
```

**Add to Claude Code using absolute path:**
```bash
# Get your current directory path
pwd

# Add to Claude Code (replace with your actual path)
claude mcp add-json specmatic '{"command":"docker","args":["run","--rm","-i","--network=host","-v","/your/absolute/path/reports:/app/reports","specmatic-mcp"],"env":{}}'
```

**Example:**
```bash
# If pwd shows: /Users/JohnDoe/projects/api-project
claude mcp add-json specmatic '{"command":"docker","args":["run","--rm","-i","--network=host","-v","/Users/JohnDoe/projects/api-project/reports:/app/reports","specmatic-mcp"],"env":{}}'
```

## Features

### Available Tools
- **`run_contract_test`** - Validate API implementations against OpenAPI specifications
- **`run_resiliency_test`** - Test API resilience with boundary condition testing
- **`manage_mock_server`** - Mock server lifecycle management (start/stop/list)

### Key Capabilities
- JUnit XML reports for detailed test analysis
- Volume mapping for persistent reports in `./reports/`
- Docker-based execution with network access

## Prerequisites

- Docker
- Claude Code

## Usage

After adding to Claude Code, you can:

```
"Run contract tests against my API at https://api.example.com using this OpenAPI spec: [paste spec]"
"Start a mock server on port 9000 using this spec: [paste spec]"
"Run resiliency tests to check error handling with this spec: [paste spec]"
```

Test reports are saved to `./reports/` and can be analyzed by Claude Code for detailed failure information.