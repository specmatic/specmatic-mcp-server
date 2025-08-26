# Specmatic MCP Server

A Model Context Protocol (MCP) server that exposes [Specmatic](https://specmatic.io/)'s capabilities such as API Contract Testing, API Resiliency Testing, API mocking, etc. to AI coding agents.

## Prerequisites

- Docker installed and running
- MCP-compatible coding environment (Claude Code, VSCode with MCP extension, Cursor, GitHub Copilot, or other MCP clients)

## Setup

### Claude Code
```bash
claude mcp add-json specmatic '{"command":"docker","args":["run","--rm","-i","--network=host","-v","'$(pwd)/reports':/app/reports","specmatic/specmatic-mcp:latest"],"env":{}}'
```

**Note**: If you encounter path resolution issues with `$(pwd)`, replace it with your absolute project path:
```bash
claude mcp add-json specmatic '{"command":"docker","args":["run","--rm","-i","--network=host","-v","/path/to/your/project/reports:/app/reports","specmatic/specmatic-mcp:latest"],"env":{}}'
```

### VSCode, Cursor, or other MCP clients

Add to your `mcp.json` configuration:

```json
{
  "servers": {
    "specmatic": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "--network=host",
        "-v",
        "<REPLACE_WITH_YOUR_PROJECT_PATH>/reports:/app/reports",
        "specmatic/specmatic-mcp:latest"
      ],
      "env": {}
    }
  }
}
```

### Important: Host Network Mode

The `--network=host` flag is required for:
- **Testing localhost APIs**: Allows the container to access APIs running on your host machine (e.g., `http://localhost:3000`)
- **Mock server access**: Enables mock servers to be accessible from your host system for frontend development
- **Port binding**: Ensures mock servers on specific ports are reachable from outside the container

**Security Note**: Host networking gives the container access to your host's network interfaces. Only use this with trusted images.

## Features

### Available Tools

#### `run_contract_test`
Validates API implementations against OpenAPI specifications by running contract tests.
- **Input**: OpenAPI spec, API base URL, spec format (yaml/json)
- **Output**: Test results with pass/fail status and detailed failure information
- **Use case**: Ensure your API implementation matches the contract specification

#### `run_resiliency_test`
Tests API resilience by sending boundary condition and invalid requests.
- **Input**: OpenAPI spec, API base URL, spec format (yaml/json)
- **Output**: Enhanced testing results including edge case validation
- **Use case**: Verify proper error handling and API robustness

#### `manage_mock_server`
Complete mock server lifecycle management for frontend development.
- **Subcommands**: `start`, `stop`, `list`
- **Features**: Port management, multiple concurrent servers, automatic cleanup
- **Use case**: Generate mock APIs from OpenAPI specs for frontend development

## Usage

After setup, interact with your AI coding agent using natural language:

```
"Run contract tests against my API at https://api.example.com using this OpenAPI spec: [paste spec]"
"Start a mock server on port 9000 using this spec: [paste spec]"
"Run resiliency tests to check error handling with @products-api.yaml spec"
"List all running mock servers"
"Stop the mock server on port 9000"
```

### Reports and Output
- JUnit XML reports are generated in the volume-mounted `reports/` directory
- Console output provides immediate feedback and summaries
- Detailed test results and timing information available in reports

## Troubleshooting

### Common Issues

**Docker permission errors**:
- Ensure Docker is running and your user has Docker permissions
- On Linux, you may need to add your user to the `docker` group

**Port conflicts**:
- Mock servers require available ports (default range: 9000-9010)
- Use `manage_mock_server list` to see currently used ports

**Volume mounting issues**:
- Ensure the reports directory exists: `mkdir -p reports`
- Use absolute paths if relative paths don't work
- Check Docker volume mounting permissions

## Documentation

For detailed Specmatic documentation, visit:
- [Specmatic Getting Started](https://docs.specmatic.io/getting_started.html)
- [Contract Testing Guide](https://specmatic.io/documentation/)

## Support

For issues, questions, or feature requests, please [open an issue](https://github.com/specmatic/specmatic-mcp-server/issues) on GitHub.


## License

This project is licensed under the MIT License - see the [License.md](./License.md) file for details.
