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

class SpecmaticMCPServer {
  private server: Server;

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

      if (result.summary.testDetails.length > 0) {
        output += "## Test Details\n";
        for (const test of result.summary.testDetails) {
          const status = test.status === "PASSED" ? "✅" : "❌";
          output += `${status} ${test.scenario}\n`;
          if (test.message) {
            output += `   ${test.message}\n`;
          }
        }
        output += "\n";
      }
    }

    if (result.output) {
      output += "## Full Output\n";
      output += "```\n";
      output += result.output;
      output += "\n```\n\n";
    }

    if (result.errors) {
      output += "## Errors\n";
      output += "```\n";
      output += result.errors;
      output += "\n```\n";
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