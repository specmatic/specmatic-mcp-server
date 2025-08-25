# Specmatic MCP Server

A Model Context Protocol (MCP) server that exposes Specmatic's contract testing capabilities to AI coding agents like Claude Code. This server enables comprehensive API contract validation and mock server management for development workflows.

## Features

### MCP Tools Available

1. **`run_contract_test`** - Validate API implementations against OpenAPI specifications
   - **JUnit XML Reports**: Generates structured test reports for detailed analysis
   - **Structured Results**: Claude Code can read and analyze individual test failures
   - **Timing Data**: Includes test execution timing and performance metrics

2. **`run_resiliency_test`** - Test API resilience with boundary condition testing
   - **Enhanced Reporting**: Detailed boundary condition test results in JUnit format
   - **Error Analysis**: Structured failure information for debugging invalid request handling

3. **`manage_mock_server`** - Complete mock server lifecycle management
   - **start** - Create mock servers from OpenAPI specs
   - **stop** - Terminate running mock servers
   - **list** - Show all running mock servers

### Key Capabilities
- **JUnit XML Integration**: All test results are saved as structured XML reports
- **Dynamic File Discovery**: Automatically handles varying JUnit filename patterns
- **Volume Mapping**: Reports persist on host system for detailed analysis
- **Fallback Parsing**: Graceful degradation to console output if XML generation fails

## Prerequisites

- Docker
- Node.js and npm (for development)
- Claude Code (for using the MCP server)

### Volume Mapping Setup
The MCP server requires volume mapping to save JUnit XML reports to your host system. This enables Claude Code to read detailed test results for analysis. Reports are saved to `./reports/` in your project directory.

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

Add this MCP server to Claude Code with volume mapping for JUnit reports. **Use the absolute path of your current directory**:

### Steps:
1. **Navigate to the project directory:**
   ```bash
   cd /path/to/specmatic-mcp
   ```

2. **Get the absolute path of current directory:**
   ```bash
   pwd
   # This will output something like: /Users/username/projects/specmatic-mcp
   ```

3. **Add to Claude Code using the absolute path from step 2:**
   ```bash
   # Replace the path below with the output from your `pwd` command
   claude mcp add-json specmatic '{"command":"docker","args":["run","--rm","-i","--network=host","-v","/your/absolute/path/reports:/app/reports","specmatic-mcp"],"env":{}'
   ```

### Complete Example
```bash
# If your `pwd` shows: /Users/JohnDoe/projects/api-project
claude mcp add-json specmatic '{"command":"docker","args":["run","--rm","-i","--network=host","-v","/Users/JohnDoe/projects/api-project/reports:/app/reports","specmatic-mcp"],"env":{}}'
```

### Alternative: Shell Script Approach
If you prefer dynamic path resolution, create a wrapper script:

1. **Create `start-specmatic-mcp.sh`:**
```bash
#!/bin/bash
docker run --rm -i --network=host -v "$(pwd)/reports:/app/reports" specmatic-mcp
```

2. **Make it executable:**
```bash
chmod +x start-specmatic-mcp.sh
```

3. **Add to Claude Code:**
```bash
claude mcp add-json specmatic '{"command":"./start-specmatic-mcp.sh","args":[],"env":{}}'
```

**Important**: The volume mapping is required for JUnit XML report generation. Without this, Claude Code won't be able to access detailed test results.

**Note**: Shell variables like `$(pwd)` don't expand in JSON strings, so you must use absolute paths or the shell script approach.

After running this command, the MCP server will be automatically configured in your Claude Code settings.

## Usage Examples

### Contract Testing
Ask Claude Code to validate your API:
```
"Run contract tests against my API at https://api.example.com using this OpenAPI spec: [paste your spec]"
```

**Response includes structured JUnit reports:**
```
✅ Test Status: PASSED
Summary:
- Total Tests: 12
- Passed: 12
- Failed: 0

📄 Detailed JUnit Report: ./reports/TEST-ContractTests-20250825T142301.xml

For complete failure analysis, use the Read tool to analyze the JUnit XML report above.
```

### Resiliency Testing
Test how your API handles edge cases:
```
"Run resiliency tests to check how my API handles invalid requests using this spec: [paste your spec]"
```

**Enhanced boundary condition testing with detailed reporting:**
```
❌ Test Status: FAILED
**Boundary Condition Testing Enabled** - Tests include contract-invalid requests

Summary:
- Total Tests: 25
- Passed: 18
- Failed: 7

📄 Detailed JUnit Report: ./reports/TEST-ResiliencyTests-20250825T143405.xml

*Console output omitted - detailed results available in JUnit report above.*
```

### Mock Server Management
Create mock servers for frontend development:

```
"Start a mock server on port 9000 using this OpenAPI spec: [paste your spec]"
"List all running mock servers"
"Stop the mock server on port 9000"
```

## JUnit XML Reports

### Directory Structure
```
./reports/
├── TEST-ContractTests-20250825T142301.xml
├── TEST-ResiliencyTests-20250825T143405.xml
└── TEST-MockServerTests-20250825T144512.xml
```

### Report Contents
Each JUnit XML report contains:
- **Test Results**: Individual test case results with pass/fail status
- **Timing Information**: Execution time for each test and overall suite
- **Failure Details**: Stack traces, error messages, and assertion failures
- **Test Hierarchy**: Organized by test classes and test methods
- **Metadata**: Test suite information, timestamps, and environment details

### Usage with Claude Code
After tests complete, Claude Code can analyze reports using:
```
"Read the JUnit report ./reports/TEST-ContractTests-20250825T142301.xml and explain the test failures"
"Analyze the timing data in ./reports/TEST-ResiliencyTests-20250825T143405.xml"
"Compare the results between these two test reports"
```

### Dynamic File Discovery
- Report filenames vary based on test execution time
- Server automatically discovers new XML files after test completion
- Multiple concurrent tests generate separate report files
- Old reports persist until manually cleaned up

## Development Workflow

1. **Start Mock Server**: Claude Code creates a mock server from your OpenAPI spec
2. **Develop UI**: Use the mock server URL in your frontend application
3. **Multiple APIs**: Run multiple mock servers on different ports simultaneously
4. **Clean Up**: Stop specific servers when done to free up resources

## Architecture

### Core Components
- **Base Image**: Uses `specmatic/specmatic:latest` with pre-configured Specmatic environment
- **Process Management**: Tracks running mock servers and enables proper cleanup
- **Temporary Files**: Handles OpenAPI specs securely with automatic cleanup
- **Error Handling**: Comprehensive error reporting and timeout protection

### JUnit XML Integration
- **XML Parser**: Uses `fast-xml-parser` for robust JUnit XML processing
- **Dynamic File Discovery**: Automatically detects generated XML files regardless of filename
- **Volume Mapping**: Persistent storage via Docker volume mounting (`./reports:/app/reports`)
- **Structured Data Extraction**: Parses test results, timing, failures, and metadata
- **Fallback Handling**: Graceful degradation to console parsing if XML generation fails

### Data Flow
1. **Test Execution**: Specmatic runs with `--junitReportDir=/app/reports`
2. **File Discovery**: Server compares directory contents before/after test execution
3. **XML Parsing**: Structured data extraction from discovered JUnit files
4. **Response Generation**: Concise summaries with file references for detailed analysis
5. **Host Access**: Claude Code reads persistent reports via volume mapping

## Development

### Dependencies
This project includes:
- **Core MCP SDK**: `@modelcontextprotocol/sdk` for MCP protocol implementation
- **XML Processing**: `fast-xml-parser` for JUnit XML parsing and analysis
- **Validation**: `zod` for input validation and type safety
- **TypeScript**: Full TypeScript implementation with type definitions

### Local Development
For local development and testing:

```bash
# Install all dependencies (including fast-xml-parser)
npm install

# Start in development mode
npm run dev

# Run locally (without Docker)
npm start

# Use host networking for localhost API testing
npm run start:host-network
```

### Report Directory
The `./reports/` directory is automatically created and:
- Stores JUnit XML files generated during testing
- Persists between container runs via volume mapping
- Is excluded from git via `.gitignore`
- Can be cleaned up manually when needed

## Response Format Changes

### Before (Console Output Only)
```
# Specmatic Contract Test Results

## ❌ Test Status: FAILED

## Summary
- Total Tests: 15
- Passed: 12
- Failed: 3

## ❌ Failed Tests
❌ GET /users should return 200 - Connection refused
❌ POST /users should create user - Invalid response format
❌ DELETE /users/{id} should return 404 - Unexpected status code

## Full Output
[2000+ characters of console output...]
```

### After (JUnit XML Integration)
```
❌ Test Status: FAILED
Summary:
- Total Tests: 15
- Passed: 12
- Failed: 3

📄 Detailed JUnit Report: ./reports/TEST-ContractTests-20250825T142301.xml

For complete failure analysis, use the Read tool to analyze the JUnit XML report above.
*Console output omitted - detailed results available in JUnit report above.*
```

**Benefits:**
- **Reduced Token Usage**: Concise summaries instead of verbose console output
- **Structured Analysis**: Claude Code can parse XML for precise failure details
- **Persistent Reports**: Files remain available for follow-up analysis
- **Better Debugging**: Stack traces, timing data, and test hierarchy in XML format

See [CLAUDE.md](CLAUDE.md) for detailed implementation documentation and architecture notes.