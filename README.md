# Specmatic MCP Server

[![Docker Pulls](https://img.shields.io/docker/pulls/specmatic/specmatic-mcp)](https://hub.docker.com/r/specmatic/specmatic-mcp)
[![npm version](https://img.shields.io/npm/v/specmatic-mcp)](https://www.npmjs.com/package/specmatic-mcp)

A Model Context Protocol (MCP) server that exposes [Specmatic](https://specmatic.io/)'s capabilities—including API Contract Testing, API Resiliency Testing, and API mocking—to AI coding agents.

## Prerequisites

- MCP-compatible coding environment (Claude Code, VSCode with MCP extension, Cursor, GitHub Copilot, etc.)

**For npm package (recommended):**
- Node.js stable (`nvm use stable`)
- Java Runtime Environment (JRE)

**For Docker:**
- Docker installed and running

## Setup

### Method 1: npm Package (Recommended)

#### Claude Code
```bash
claude mcp add specmatic npx specmatic-mcp
```

#### VSCode
1. **Install the package globally** (optional, for easier access):
   ```bash
   npm install -g specmatic-mcp
   ```
2. **Open your project** in VS Code as a workspace
3. **Open Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`) → **`MCP: Add server`**
4. **Choose transport protocol**: `stdio`
5. **Enter command**:
   ```bash
   npx specmatic-mcp
   ```
6. **Set server ID**: `specmatic`
7. **Choose scope**: Global or Workspace

#### Other MCP Clients
Add to your `mcp.json` configuration:
```json
{
  "servers": {
    "specmatic": {
      "command": "npx",
      "args": ["specmatic-mcp"],
      "env": {}
    }
  }
}
```

---

### Method 2: Docker

#### Claude Code
```bash
claude mcp add-json specmatic '{"command":"docker","args":["run","--rm","-i","--network=host","-v","'$(pwd)/reports':/app/reports","specmatic/specmatic-mcp:latest"],"env":{}}'
```

**Note**: If you encounter path resolution issues with `$(pwd)`, replace it with your absolute project path:
```bash
claude mcp add-json specmatic '{"command":"docker","args":["run","--rm","-i","--network=host","-v","/path/to/your/project/reports:/app/reports","specmatic/specmatic-mcp:latest"],"env":{}}'
```

#### VSCode

1. **Make sure Docker Desktop is running**  
2. **Open your project** in VS Code as a **workspace** (single-folder or multi-root as needed).  
3. **Open the Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for **`MCP: Add server`**, then press **Enter**
4. **Choose transport protocol** as **`stdio`**  
5. **⚠️ CRITICAL: Enter the command** to run the MCP server - **YOU MUST REPLACE `<REPLACE_WITH_YOUR_PROJECT_PATH>`** with your actual project path:
   
   **Template:**
   ```bash
   docker run --rm -i --network=host -v <REPLACE_WITH_YOUR_PROJECT_PATH>/reports:/app/reports specmatic/specmatic-mcp:latest
   ```
   
   **Examples:**
   ```bash
   # macOS/Linux example:
   docker run --rm -i --network=host -v /Users/yourname/projects/my-api-project/reports:/app/reports specmatic/specmatic-mcp:latest
   
   # Windows example:
   docker run --rm -i --network=host -v C:\Users\yourname\projects\my-api-project\reports:/app/reports specmatic/specmatic-mcp:latest
   ```

6. **Set the server ID** to `specmatic-mcp`.  
7. **Choose installation scope**: `Global` (available everywhere) or `Workspace` (just this project).  
8. **Verify the server**: Make sure that Specmatic MCP is listed without errors in the **MCP servers** panel and then request your Copilot Agent to run contract tests, resiliency tests, or start a mock server in natural language.

#### Other MCP Clients (Docker)

For Cursor, GitHub Copilot, or other MCP clients, add to your `mcp.json` configuration:

⚠️ **IMPORTANT**: Replace `<REPLACE_WITH_YOUR_PROJECT_PATH>` with your actual project path.

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

**Path Examples:**
- **macOS/Linux**: `/Users/yourname/projects/my-api-project/reports:/app/reports`
- **Windows**: `C:\Users\yourname\projects\my-api-project\reports:/app/reports`

#### Important: Host Network Mode

The `--network=host` flag is required for:
- **Testing localhost APIs**: Allows the container to access APIs running on your host machine (e.g., `http://localhost:3000`)
- **Mock server access**: Enables mock servers to be accessible from your host system for frontend development
- **Port binding**: Ensures mock servers on specific ports are reachable from outside the container

**Security Note**: Host networking gives the container access to your host's network interfaces. Only use this with trusted images.

---

### Choosing the Right Method

**Use npm package (recommended)** for easier setup and faster performance.

**Use Docker** if you prefer not to install Node.js and Java locally on your system.

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

**npm Package:**
- JUnit XML reports generated in `./reports/` directory (relative to where you run the command)
- Direct filesystem access for easy report analysis
- Reports persist after command completion

**Docker:**
- JUnit XML reports generated in volume-mounted `./reports/` directory on host
- Requires volume mounting: `-v "$(pwd)/reports:/app/reports"`
- Reports accessible on host filesystem

**Both methods provide:**
- Console output with immediate feedback and summaries
- Detailed test results and timing information in JUnit XML format
- Structured error reporting and stack traces

## Troubleshooting

### npm Package Issues

**Node.js version incompatibility**:
- Ensure Node.js 18+ is installed: `node --version`
- Use `nvm use stable` to switch to latest stable version
- Run `npm install -g npm@latest` to update npm

**Permission errors on global install**:
- Use `npx specmatic-mcp` instead of global install
- Or configure npm to use a different directory: `npm config set prefix ~/.local`
- On macOS/Linux: Use `sudo` only if absolutely necessary

**Command not found**:
- If using global install: ensure npm global bin directory is in PATH
- Alternative: Use `npx specmatic-mcp` which works without global install
- Check installation: `npm list -g specmatic-mcp`

**Reports directory not created**:
- Ensure you have write permissions in current directory
- The reports directory is created automatically on first test run
- Manually create: `mkdir -p ./reports`

### Docker Issues

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

### General Issues

**Java not found (npm package)**:
- Install Java Runtime Environment (JRE) 8 or higher
- On macOS: `brew install openjdk`
- On Ubuntu/Debian: `sudo apt-get install default-jre`
- On Windows: Download from Oracle or use Chocolatey

**API connection failures**:
- Verify the API is running and accessible
- Check firewall settings for localhost connections
- Ensure correct URL format (include `http://` or `https://`)

**Mock server not accessible**:
- Verify the port is available: `lsof -i :9000`
- Check if process is actually running: `ps aux | grep specmatic`
- For Docker: ensure `--network=host` flag is used

## Sample project

Build an entire FE and BE application with Specmatic MCP as guard rails:

[https://github.com/specmatic/specmatic-mcp-sample](https://github.com/specmatic/specmatic-mcp-sample)

## Support

For issues, questions, or feature requests, please [open an issue](https://github.com/specmatic/specmatic-mcp-server/issues) on GitHub.


## License

This project is licensed under the MIT License - see the [LICENSE.md](./LICENSE.md) file for details.
