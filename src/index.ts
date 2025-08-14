#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializeRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

interface SpecmaticTestResult {
  success: boolean;
  output: string;
  errors: string;
  exitCode: number;
  summary?: {
    totalTests: number;
    passed: number;
    failed: number;
    testDetails: Array<{
      scenario: string;
      status: "PASSED" | "FAILED";
      message?: string;
    }>;
  };
}

const RunContractTestInputSchema = z.object({
  openApiSpec: z.string().describe("The OpenAPI specification content (YAML or JSON)"),
  apiBaseUrl: z.string().describe("The base URL of the API to test against"),
  specFormat: z.enum(["yaml", "json"]).optional().default("yaml").describe("Format of the OpenAPI spec"),
});

const StartMockServerInputSchema = z.object({
  openApiSpec: z.string().describe("The OpenAPI specification content (YAML or JSON)"),
  port: z.number().optional().default(9000).describe("Port number for the mock server"),
  specFormat: z.enum(["yaml", "json"]).optional().default("yaml").describe("Format of the OpenAPI spec"),
});

interface MockServerResult {
  success: boolean;
  url?: string;
  port: number;
  pid?: number;
  message: string;
  errors?: string;
}

class SpecmaticMCPServer {
  private server: Server;
  private runningMockServers: Map<number, { process: any; specFile: string; url: string }> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: "specmatic-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(InitializeRequestSchema, async () => {
      return {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "specmatic-mcp-server",
          version: "1.0.0",
        },
      };
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "run_contract_test",
            description: "Run Specmatic contract tests against an API using OpenAPI specification",
            inputSchema: {
              type: "object",
              properties: {
                openApiSpec: {
                  type: "string",
                  description: "The OpenAPI specification content (YAML or JSON)"
                },
                apiBaseUrl: {
                  type: "string",
                  description: "The base URL of the API to test against"
                },
                specFormat: {
                  type: "string",
                  enum: ["yaml", "json"],
                  default: "yaml",
                  description: "Format of the OpenAPI spec"
                }
              },
              required: ["openApiSpec", "apiBaseUrl"]
            },
          },
          {
            name: "run_resiliency_test",
            description: "Run Specmatic resiliency tests with boundary condition testing against an API using OpenAPI specification. This enables SPECMATIC_GENERATIVE_TESTS to test how the API handles contract-invalid requests",
            inputSchema: {
              type: "object",
              properties: {
                openApiSpec: {
                  type: "string",
                  description: "The OpenAPI specification content (YAML or JSON)"
                },
                apiBaseUrl: {
                  type: "string",
                  description: "The base URL of the API to test against"
                },
                specFormat: {
                  type: "string",
                  enum: ["yaml", "json"],
                  default: "yaml",
                  description: "Format of the OpenAPI spec"
                }
              },
              required: ["openApiSpec", "apiBaseUrl"]
            },
          },
          {
            name: "start_mock_server",
            description: "Start a Specmatic mock server from OpenAPI specification for frontend development. Returns a running mock server URL that can be used to develop UIs against the contract.",
            inputSchema: {
              type: "object",
              properties: {
                openApiSpec: {
                  type: "string",
                  description: "The OpenAPI specification content (YAML or JSON)"
                },
                port: {
                  type: "number",
                  default: 9000,
                  description: "Port number for the mock server (default: 9000)"
                },
                specFormat: {
                  type: "string",
                  enum: ["yaml", "json"],
                  default: "yaml",
                  description: "Format of the OpenAPI spec"
                }
              },
              required: ["openApiSpec"]
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === "run_contract_test") {
        const input = RunContractTestInputSchema.parse(args);
        const result = await this.runContractTest(input);
        
        return {
          content: [
            {
              type: "text",
              text: this.formatTestResults(result, "contract"),
            },
          ],
        };
      }

      if (name === "run_resiliency_test") {
        const input = RunContractTestInputSchema.parse(args);
        const result = await this.runResiliencyTest(input);
        
        return {
          content: [
            {
              type: "text",
              text: this.formatTestResults(result, "resiliency"),
            },
          ],
        };
      }

      if (name === "start_mock_server") {
        const input = StartMockServerInputSchema.parse(args);
        const result = await this.startMockServer(input);
        
        return {
          content: [
            {
              type: "text",
              text: this.formatMockServerResult(result),
            },
          ],
        };
      }

      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
    });
  }

  private async runContractTest(input: {
    openApiSpec: string;
    apiBaseUrl: string;
    specFormat: "yaml" | "json";
  }): Promise<SpecmaticTestResult> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specmatic-test-"));
    const specFile = path.join(tempDir, `spec.${input.specFormat}`);

    try {
      // Write the OpenAPI spec to a temporary file
      await fs.writeFile(specFile, input.openApiSpec, "utf8");

      // Run Specmatic test using Docker
      const result = await this.executeSpecmaticTest(specFile, input.apiBaseUrl);
      
      // Parse the output to extract test results
      const parsedResult = this.parseSpecmaticOutput(result);
      
      return parsedResult;
    } catch (error) {
      return {
        success: false,
        output: "",
        errors: error instanceof Error ? error.message : String(error),
        exitCode: 1,
      };
    } finally {
      // Cleanup temporary files
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error("Failed to cleanup temp directory:", cleanupError);
      }
    }
  }

  private async runResiliencyTest(input: {
    openApiSpec: string;
    apiBaseUrl: string;
    specFormat: "yaml" | "json";
  }): Promise<SpecmaticTestResult> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specmatic-resiliency-test-"));
    const specFile = path.join(tempDir, `spec.${input.specFormat}`);

    try {
      // Write the OpenAPI spec to a temporary file
      await fs.writeFile(specFile, input.openApiSpec, "utf8");

      // Run Specmatic resiliency test with SPECMATIC_GENERATIVE_TESTS=true
      const result = await this.executeSpecmaticTest(specFile, input.apiBaseUrl, {
        SPECMATIC_GENERATIVE_TESTS: "true"
      });
      
      // Parse the output to extract test results
      const parsedResult = this.parseSpecmaticOutput(result);
      
      return parsedResult;
    } catch (error) {
      return {
        success: false,
        output: "",
        errors: error instanceof Error ? error.message : String(error),
        exitCode: 1,
      };
    } finally {
      // Cleanup temporary files
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error("Failed to cleanup temp directory:", cleanupError);
      }
    }
  }

  private async executeSpecmaticTest(
    specFile: string, 
    apiBaseUrl: string, 
    env: Record<string, string> = {}
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    return new Promise((resolve, reject) => {
      const javaArgs = [
        "-jar",
        "/app/specmatic.jar",
        "test",
        specFile,
        `--testBaseURL=${apiBaseUrl}`
      ];

      const javaProcess = spawn("java", javaArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...env },
      });

      let stdout = "";
      let stderr = "";

      javaProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      javaProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      javaProcess.on("close", (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code || 0,
        });
      });

      javaProcess.on("error", (error) => {
        reject(error);
      });

      // Set a timeout for the test execution (5 minutes)
      setTimeout(() => {
        javaProcess.kill("SIGTERM");
        reject(new Error("Test execution timeout after 5 minutes"));
      }, 5 * 60 * 1000);
    });
  }

  private parseSpecmaticOutput(result: {
    stdout: string;
    stderr: string;
    exitCode: number;
  }): SpecmaticTestResult {
    const { stdout, stderr, exitCode } = result;
    const success = exitCode === 0;

    // Basic parsing - this could be enhanced based on actual Specmatic output format
    const testResults: SpecmaticTestResult = {
      success,
      output: stdout,
      errors: stderr,
      exitCode,
    };

    // Try to parse test summary from output
    try {
      const lines = stdout.split("\n");
      const testDetails: Array<{
        scenario: string;
        status: "PASSED" | "FAILED";
        message?: string;
      }> = [];

      let totalTests = 0;
      let passed = 0;
      let failed = 0;

      for (const line of lines) {
        // Look for test result patterns in Specmatic output
        if (line.includes("PASSED") || line.includes("FAILED")) {
          const status = line.includes("PASSED") ? "PASSED" : "FAILED";
          const scenario = line.trim();
          
          testDetails.push({
            scenario,
            status,
            message: status === "FAILED" ? line : undefined,
          });

          totalTests++;
          if (status === "PASSED") passed++;
          else failed++;
        }
      }

      if (totalTests > 0) {
        testResults.summary = {
          totalTests,
          passed,
          failed,
          testDetails,
        };
      }
    } catch (parseError) {
      // If parsing fails, we still return the basic result
      console.error("Failed to parse test output:", parseError);
    }

    return testResults;
  }

  private formatTestResults(result: SpecmaticTestResult, testType: "contract" | "resiliency" = "contract"): string {
    const testTypeTitle = testType === "resiliency" ? "Resiliency" : "Contract";
    let output = `# Specmatic ${testTypeTitle} Test Results\n\n`;

    if (testType === "resiliency") {
      output += "**Boundary Condition Testing Enabled** - Tests include contract-invalid requests to verify error handling\n\n";
    }

    if (result.success) {
      output += "## ✅ Test Status: PASSED\n\n";
    } else {
      output += "## ❌ Test Status: FAILED\n\n";
    }

    if (result.summary) {
      output += `## Summary\n`;
      output += `- Total Tests: ${result.summary.totalTests}\n`;
      output += `- Passed: ${result.summary.passed}\n`;
      output += `- Failed: ${result.summary.failed}\n\n`;

      // Only show failed tests to reduce output size
      const failedTests = result.summary.testDetails.filter(test => test.status === "FAILED");
      
      if (failedTests.length > 0) {
        output += "## ❌ Failed Tests\n";
        output += "*Note: Only showing failed tests for brevity. Passed tests are included in the summary above.*\n\n";
        
        for (const test of failedTests) {
          output += `❌ ${test.scenario}\n`;
          if (test.message) {
            output += `   ${test.message}\n`;
          }
        }
        output += "\n";
      } else if (result.summary.totalTests > 0) {
        output += "## ✅ All Tests Passed\n";
        output += "No failed tests to display. All tests passed successfully.\n\n";
      }
    }

    // For large outputs (especially resiliency tests), only include errors and truncate output
    if (result.output) {
      const outputLength = result.output.length;
      const MAX_OUTPUT_LENGTH = 2000; // Limit to roughly 500 tokens
      
      if (outputLength > MAX_OUTPUT_LENGTH) {
        output += "## Output Summary (Truncated)\n";
        output += "*Note: Output truncated to show most relevant information. Full logs available in container.*\n\n";
        output += "```\n";
        output += result.output.substring(0, MAX_OUTPUT_LENGTH);
        output += `\n... [Truncated ${outputLength - MAX_OUTPUT_LENGTH} characters]\n`;
        output += "```\n\n";
      } else {
        output += "## Full Output\n";
        output += "```\n";
        output += result.output;
        output += "\n```\n\n";
      }
    }

    if (result.errors) {
      output += "## Errors\n";
      output += "```\n";
      output += result.errors;
      output += "\n```\n";
    }

    return output;
  }

  private async startMockServer(input: {
    openApiSpec: string;
    port: number;
    specFormat: "yaml" | "json";
  }): Promise<MockServerResult> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specmatic-mock-"));
    const specFile = path.join(tempDir, `spec.${input.specFormat}`);

    try {
      // Check if port is already in use
      if (this.runningMockServers.has(input.port)) {
        return {
          success: false,
          port: input.port,
          message: `Port ${input.port} is already in use by another mock server`,
        };
      }

      // Write the OpenAPI spec to a temporary file
      await fs.writeFile(specFile, input.openApiSpec, "utf8");

      // Start the mock server
      const result = await this.executeMockServer(specFile, input.port);
      
      if (result.success) {
        // Store the running server info
        this.runningMockServers.set(input.port, {
          process: result.process,
          specFile,
          url: `http://localhost:${input.port}`,
        });

        return {
          success: true,
          url: `http://localhost:${input.port}`,
          port: input.port,
          pid: result.process.pid,
          message: `Mock server started successfully on port ${input.port}`,
        };
      } else {
        return {
          success: false,
          port: input.port,
          message: "Failed to start mock server",
          errors: result.error,
        };
      }
    } catch (error) {
      return {
        success: false,
        port: input.port,
        message: "Failed to start mock server",
        errors: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async executeMockServer(
    specFile: string, 
    port: number
  ): Promise<{
    success: boolean;
    process?: any;
    error?: string;
  }> {
    return new Promise((resolve) => {
      const javaArgs = [
        "-jar",
        "/app/specmatic.jar",
        "stub",
        specFile,
        `--port=${port}`
      ];

      const javaProcess = spawn("java", javaArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        detached: false,
      });

      let hasResolved = false;
      let stderr = "";

      // Give the server a moment to start up
      setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          if (javaProcess.killed) {
            resolve({
              success: false,
              error: stderr || "Process was killed during startup",
            });
          } else {
            resolve({
              success: true,
              process: javaProcess,
            });
          }
        }
      }, 2000);

      javaProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      javaProcess.on("error", (error) => {
        if (!hasResolved) {
          hasResolved = true;
          resolve({
            success: false,
            error: error.message,
          });
        }
      });

      javaProcess.on("exit", (code) => {
        if (!hasResolved) {
          hasResolved = true;
          resolve({
            success: false,
            error: `Process exited with code ${code}: ${stderr}`,
          });
        }
      });
    });
  }

  private formatMockServerResult(result: MockServerResult): string {
    let output = `# Specmatic Mock Server\n\n`;

    if (result.success) {
      output += "## ✅ Mock Server Started Successfully\n\n";
      output += `**Server URL:** ${result.url}\n`;
      output += `**Port:** ${result.port}\n`;
      if (result.pid) {
        output += `**Process ID:** ${result.pid}\n`;
      }
      output += "\n";
      output += "## Usage\n";
      output += `Your mock server is now running and ready to receive requests. You can:\n\n`;
      output += `- Make API calls to: \`${result.url}\`\n`;
      output += `- Use this URL in your frontend application configuration\n`;
      output += `- Test your UI against the mocked backend\n\n`;
      output += "The mock server will generate responses based on your OpenAPI specification, including:\n";
      output += "- Example responses if defined in the spec\n";
      output += "- Generated data matching the schema\n";
      output += "- Proper HTTP status codes as defined in the contract\n\n";
      output += "**Note:** The mock server will continue running until the MCP server is stopped or the container is terminated.\n";
    } else {
      output += "## ❌ Failed to Start Mock Server\n\n";
      output += `**Error:** ${result.message}\n`;
      if (result.errors) {
        output += "\n## Error Details\n";
        output += "```\n";
        output += result.errors;
        output += "\n```\n";
      }
    }

    return output;
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Specmatic MCP Server running on stdio");
  }
}

const server = new SpecmaticMCPServer();
server.run().catch(console.error);