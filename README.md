# Specmatic MCP Server

A Model Context Protocol (MCP) server that wraps Specmatic's contract testing capabilities, enabling AI coding agents like Claude Code to validate API implementations against OpenAPI specifications.

## Overview

This MCP server provides three tools:

### `run_contract_test`
- Accepts OpenAPI specification files (YAML or JSON)
- Takes an API base URL to test against
- Runs standard Specmatic contract tests using Java JAR
- Returns formatted test results with pass/fail status

### `run_resiliency_test`
- Accepts OpenAPI specification files (YAML or JSON)
- Takes an API base URL to test against
- Runs Specmatic resiliency tests with boundary condition testing
- Enables `SPECMATIC_GENERATIVE_TESTS` to test contract-invalid requests
- Returns formatted test results with pass/fail status

### `start_mock_server`
- Accepts OpenAPI specification files (YAML or JSON)
- Starts a Specmatic mock server for frontend development
- Returns a running server URL that generates responses based on the contract
- Enables UI development without backend dependencies

## Features

- **OpenAPI Contract Testing**: Validate API implementations against OpenAPI specs
- **Resiliency Testing**: Test boundary conditions and error handling with generative tests
- **Mock Server**: Start intelligent mock servers from OpenAPI specs for frontend development
- **JAR Integration**: Uses the Specmatic JAR file directly with Java
- **Structured Results**: Returns detailed test results in a readable format
- **MCP Compatible**: Works with any MCP-compatible AI coding assistant

## Prerequisites

- Docker (for container-based usage)
- Java Runtime Environment (JRE) 17 or higher (for direct usage)
- The Specmatic JAR file is included in the Docker image

## Building

First, make sure you have the Docker image built:

```bash
# Build the TypeScript code
npm run build

# Build the Docker image
npm run docker:build
```

## Quick Setup with Claude Code

You can easily add this MCP server to Claude Code using the `claude mcp add` command:

### For localhost APIs (Host Network Mode):
```bash
claude mcp add docker run --rm -i --network=host specmatic-mcp
```

### For remote APIs (Standard Mode):
```bash
claude mcp add docker run --rm -i specmatic-mcp
```

### For Mock Server Usage (Port Mapping Required):
```bash
claude mcp add docker run --rm -i -p 9000-9010:9000-9010 specmatic-mcp
```

After running any of these commands, the MCP server will be automatically configured in your Claude Code settings.

## Manual Setup

### Host Network Mode (Recommended for localhost APIs)

When you need to test APIs running on `localhost`, use host network mode:

```bash
# Setup and build
npm run setup

# Run with host network access
npm run start:host-network
```

#### With Claude Code (Host Network Mode)

Add this configuration to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "specmatic": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "--network=host",
        "specmatic-mcp"
      ],
      "env": {}
    }
  }
}
```

### Standard Docker Mode (For remote APIs)

For testing remote APIs or when using `host.docker.internal`:

```bash
# Run standard Docker mode
npm run docker:run
```

#### With Claude Code (Standard Mode)

```json
{
  "mcpServers": {
    "specmatic": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "specmatic-mcp"
      ],
      "env": {}
    }
  }
}
```

### Mock Server Mode (For Frontend Development)

For starting mock servers that need to be accessible from your host machine:

```bash
# Run with port mapping for mock servers (ports 9000-9010)
docker run --rm -i -p 9000-9010:9000-9010 specmatic-mcp
```

#### With Claude Code (Mock Server Mode)

```json
{
  "mcpServers": {
    "specmatic": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-p",
        "9000-9010:9000-9010",
        "specmatic-mcp"
      ],
      "env": {}
    }
  }
}
```

### Direct Usage (Without Docker)

```bash
# Run the MCP server locally (requires Java 17+ installed)
npm start
```

## Tools

### Tool: run_contract_test

Runs standard Specmatic contract tests to validate API implementations against OpenAPI specifications.

**Parameters:**
- `openApiSpec` (string, required): The OpenAPI specification content in YAML or JSON format
- `apiBaseUrl` (string, required): The base URL of the API to test against
- `specFormat` (string, optional): Format of the spec ("yaml" or "json", defaults to "yaml")

**Returns:**
Formatted test results including:
- Overall pass/fail status
- Test summary with counts
- Individual test details
- Full Specmatic output
- Any error messages

### Tool: run_resiliency_test

Runs Specmatic resiliency tests with boundary condition testing to validate how APIs handle contract-invalid requests.

**Parameters:**
- `openApiSpec` (string, required): The OpenAPI specification content in YAML or JSON format
- `apiBaseUrl` (string, required): The base URL of the API to test against
- `specFormat` (string, optional): Format of the spec ("yaml" or "json", defaults to "yaml")

**Returns:**
Formatted test results including:
- Overall pass/fail status
- Test summary with counts
- Individual test details
- Full Specmatic output with boundary condition test results
- Any error messages

### Tool: start_mock_server

Starts a Specmatic mock server from OpenAPI specification for frontend development and UI testing.

**Parameters:**
- `openApiSpec` (string, required): The OpenAPI specification content in YAML or JSON format
- `port` (number, optional): Port number for the mock server (default: 9000)
- `specFormat` (string, optional): Format of the spec ("yaml" or "json", defaults to "yaml")

**Returns:**
Mock server information including:
- Server URL for making requests
- Port number
- Process ID
- Status and success indicators
- Usage instructions
- Any error messages

**Example Usage in Claude Code:**

For contract testing:
```
Please test my API implementation at http://localhost:8080 against this OpenAPI spec:
[paste your OpenAPI spec here]
```

For starting a mock server:
```
Please start a mock server on port 9001 using this OpenAPI spec for my frontend development:
[paste your OpenAPI spec here]
```

For resiliency testing:
```
Please run resiliency tests against my API at https://api.example.com using this OpenAPI spec:
[paste your OpenAPI spec here]
```

## Architecture

- **Base Image**: Alpine Linux with Java JRE and Node.js
- **MCP Server**: Node.js/TypeScript implementation using @modelcontextprotocol/sdk
- **Specmatic Integration**: Downloads Specmatic JAR file from https://github.com/specmatic/specmatic/releases/download/2.18.2/specmatic.jar and executes it with Java
- **Result Parsing**: Extracts and formats test results for clear presentation

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev
```

## How It Works

1. Receives OpenAPI spec and API URL through MCP tool call
2. Writes spec to temporary file
3. Executes Specmatic JAR using Java with the spec file
4. Runs contract tests against provided API URL
5. Parses Specmatic output for test results
6. Returns formatted results to the AI coding assistant
7. Cleans up temporary files

This enables AI assistants to automatically validate API implementations during development, ensuring they conform to their OpenAPI specifications.