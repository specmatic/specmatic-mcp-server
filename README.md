# Specmatic MCP Server

A Model Context Protocol (MCP) server that wraps Specmatic's contract testing capabilities, enabling AI coding agents like Claude Code to validate API implementations against OpenAPI specifications.

## Overview

This MCP server provides a `run_contract_test` tool that:
- Accepts OpenAPI specification files (YAML or JSON)
- Takes an API base URL to test against
- Runs Specmatic contract tests using Java JAR
- Returns formatted test results with pass/fail status

## Features

- **OpenAPI Contract Testing**: Validate API implementations against OpenAPI specs
- **JAR Integration**: Uses the Specmatic JAR file directly with Java
- **Structured Results**: Returns detailed test results in a readable format
- **MCP Compatible**: Works with any MCP-compatible AI coding assistant

## Prerequisites

- Java Runtime Environment (JRE) 17 or higher
- The Specmatic JAR file is included in the Docker image

## Building

```bash
# Build the TypeScript code
npm run build

# Build the Docker image
docker build -t specmatic-mcp-server .
```

## Usage

### With Claude Code

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
        "specmatic-mcp-server"
      ],
      "env": {}
    }
  }
}
```

### Direct Usage

```bash
# Run the MCP server locally
npm start

# Or run via Docker
docker run --rm -i specmatic-mcp-server
```

## Tool: run_contract_test

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

**Example Usage in Claude Code:**
```
Please test my API implementation at https://api.example.com against this OpenAPI spec:
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