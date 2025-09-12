# Specmatic MCP Server

[![Docker Pulls](https://img.shields.io/docker/pulls/specmatic/specmatic-mcp)](https://hub.docker.com/r/specmatic/specmatic-mcp)
[![npm version](https://img.shields.io/npm/v/specmatic-mcp)](https://www.npmjs.com/package/specmatic-mcp)

A Model Context Protocol (MCP) server that exposes [Specmatic](https://specmatic.io/)'s capabilities—including API Contract Testing, API Resiliency Testing, and API mocking—to AI coding agents.

## What You Can Do

Interact with your AI coding agent using natural language to:

```
"Run contract tests against my API at https://api.example.com using this OpenAPI spec: [paste spec]"
"Start a mock server on port 9000 using this spec: [paste spec]"
"Run resiliency tests to check error handling with @products-api.yaml spec"
"Check for breaking changes in my API spec at /path/to/openapi.yaml compared to main branch"
"List all running mock servers"
"Stop the mock server on port 9000"
```

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

#### `backward_compatibility_check` *(npm package only)*
Checks for breaking changes in OpenAPI specifications using git comparison.
- **Input**: OpenAPI spec file path, git branch comparison, repository directory
- **Output**: Backward compatibility analysis with breaking change detection
- **Use case**: Validate API changes don't break existing clients before deployment
- **Prerequisite**: Requires git version control - Specmatic compares current spec with previous version to identify changes
- **Availability**: Only available when using the npm package (not available in Docker due to git repository access requirements)

## Prerequisites

- MCP-compatible coding environment (Claude Code, VSCode with MCP extension, Cursor, GitHub Copilot, etc.)

**For npm package (recommended):**
- Node.js stable (`nvm use stable`)
- Java Runtime Environment (JRE)
- Git (required for backward compatibility checking)

**For Docker:**
- Docker installed and running

## Setup

### npm Package (Recommended)

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

### Docker Alternative

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

### Tool Availability by Environment

**npm Package:**
- ✅ Contract Testing (`run_contract_test`)
- ✅ Resiliency Testing (`run_resiliency_test`)  
- ✅ Mock Server Management (`manage_mock_server`)
- ✅ Backward Compatibility Check (`backward_compatibility_check`)

**Docker:**
- ✅ Contract Testing (`run_contract_test`)
- ✅ Resiliency Testing (`run_resiliency_test`)
- ✅ Mock Server Management (`manage_mock_server`)
- ❌ Backward Compatibility Check (requires direct git repository access)

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

## Usage Examples

Simply interact with your AI coding agent using natural language. The agent will call the appropriate MCP tools based on your requests. All detailed examples and output formats are available in the project's CLAUDE.md file for reference.

## 🚀 Try the Complete Example

Explore a full-stack application built with Specmatic MCP as guard rails:

**[https://github.com/specmatic/specmatic-mcp-sample](https://github.com/specmatic/specmatic-mcp-sample)**

This sample project demonstrates how to build an entire frontend and backend application using Specmatic MCP for contract testing, API mocking, and resiliency validation.

## Support

For issues, questions, or feature requests, please [open an issue](https://github.com/specmatic/specmatic-mcp-server/issues) on GitHub.


## License

This project is licensed under the MIT License - see the [LICENSE.md](./LICENSE.md) file for details.
