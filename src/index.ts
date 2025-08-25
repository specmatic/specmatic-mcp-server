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
import { XMLParser } from "fast-xml-parser";

interface JunitTestCase {
  name: string;
  classname: string;
  status: "PASSED" | "FAILED" | "SKIPPED";
  time?: number;
  failure?: {
    message: string;
    type?: string;
    content?: string;
  };
  error?: {
    message: string;
    type?: string;
    content?: string;
  };
}

interface JunitTestSuite {
  name: string;
  tests: number;
  failures: number;
  errors: number;
  skipped?: number;
  time?: number;
  testcases: JunitTestCase[];
}

interface SpecmaticTestResult {
  success: boolean;
  output: string;
  errors: string;
  exitCode: number;
  junitReportPath?: string;        // Container path
  hostJunitReportPath?: string;    // Host path for Claude Code access
  junitParsedData?: JunitTestSuite; // Parsed structured data
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

const ManageMockServerInputSchema = z.object({
  command: z.enum(["start", "stop", "list"]).describe("The action to perform on mock servers"),
  openApiSpec: z.string().optional().describe("The OpenAPI specification content (YAML or JSON) - required for 'start' command"),
  port: z.number().optional().default(9000).describe("Port number for the mock server - required for 'start' and 'stop' commands"),
  specFormat: z.enum(["yaml", "json"]).optional().default("yaml").describe("Format of the OpenAPI spec - used with 'start' command"),
});

interface MockServerResult {
  success: boolean;
  command: string;
  url?: string;
  port?: number;
  pid?: number;
  message: string;
  errors?: string;
  runningServers?: Array<{
    port: number;
    url: string;
    pid?: number;
  }>;
}

// Helper functions for JUnit XML file discovery and parsing
async function listXmlFiles(directory: string): Promise<string[]> {
  try {
    const files = await fs.readdir(directory);
    return files.filter(file => file.endsWith('.xml'));
  } catch (error) {
    return []; // Return empty array if directory doesn't exist or can't be read
  }
}

async function findNewJunitFiles(reportsDir: string, filesBefore: string[]): Promise<string[]> {
  const filesAfter = await listXmlFiles(reportsDir);
  return filesAfter.filter(file => !filesBefore.includes(file));
}

async function parseJunitXmlFile(filePath: string): Promise<JunitTestSuite | null> {
  try {
    const xmlContent = await fs.readFile(filePath, 'utf8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });
    
    const jsonObj = parser.parse(xmlContent);
    
    // Handle different JUnit XML structures (testsuite or testsuites)
    let testSuite = jsonObj.testsuite || jsonObj.testsuites?.testsuite;
    
    if (!testSuite) {
      console.error('No testsuite found in XML file:', filePath);
      return null;
    }
    
    // Handle case where testsuite is an array (multiple test suites)
    if (Array.isArray(testSuite)) {
      testSuite = testSuite[0]; // Take the first one for now
    }
    
    const testcases: JunitTestCase[] = [];
    const rawTestcases = testSuite.testcase || [];
    const testcaseArray = Array.isArray(rawTestcases) ? rawTestcases : [rawTestcases];
    
    for (const tc of testcaseArray) {
      const testcase: JunitTestCase = {
        name: tc['@_name'] || tc.name || 'Unknown Test',
        classname: tc['@_classname'] || tc.classname || 'Unknown Class',
        status: 'PASSED',
        time: tc['@_time'] ? parseFloat(tc['@_time']) : undefined
      };
      
      // Check for failure or error
      if (tc.failure) {
        testcase.status = 'FAILED';
        testcase.failure = {
          message: tc.failure['@_message'] || tc.failure.message || 'Test failed',
          type: tc.failure['@_type'] || tc.failure.type,
          content: typeof tc.failure === 'string' ? tc.failure : tc.failure['#text']
        };
      } else if (tc.error) {
        testcase.status = 'FAILED';
        testcase.error = {
          message: tc.error['@_message'] || tc.error.message || 'Test error',
          type: tc.error['@_type'] || tc.error.type,
          content: typeof tc.error === 'string' ? tc.error : tc.error['#text']
        };
      } else if (tc.skipped) {
        testcase.status = 'SKIPPED';
      }
      
      testcases.push(testcase);
    }
    
    return {
      name: testSuite['@_name'] || testSuite.name || 'Test Suite',
      tests: parseInt(testSuite['@_tests'] || testSuite.tests || '0'),
      failures: parseInt(testSuite['@_failures'] || testSuite.failures || '0'),
      errors: parseInt(testSuite['@_errors'] || testSuite.errors || '0'),
      skipped: parseInt(testSuite['@_skipped'] || testSuite.skipped || '0'),
      time: testSuite['@_time'] ? parseFloat(testSuite['@_time']) : undefined,
      testcases
    };
  } catch (error) {
    console.error('Failed to parse JUnit XML file:', filePath, error);
    return null;
  }
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
            name: "manage_mock_server",
            description: "Manage Specmatic mock servers - start, stop, or list running servers for frontend development. Supports complete mock server lifecycle management.",
            inputSchema: {
              type: "object",
              properties: {
                command: {
                  type: "string",
                  enum: ["start", "stop", "list"],
                  description: "The action to perform: 'start' creates a new server, 'stop' terminates a server, 'list' shows running servers"
                },
                openApiSpec: {
                  type: "string",
                  description: "The OpenAPI specification content (YAML or JSON) - required for 'start' command"
                },
                port: {
                  type: "number",
                  default: 9000,
                  description: "Port number for the mock server - required for 'start' and 'stop' commands"
                },
                specFormat: {
                  type: "string",
                  enum: ["yaml", "json"],
                  default: "yaml",
                  description: "Format of the OpenAPI spec - used with 'start' command"
                }
              },
              required: ["command"]
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

      if (name === "manage_mock_server") {
        const input = ManageMockServerInputSchema.parse(args);
        
        // Validate conditional requirements
        if (input.command === "start" && !input.openApiSpec) {
          throw new McpError(ErrorCode.InvalidParams, "openApiSpec is required for 'start' command");
        }
        if ((input.command === "start" || input.command === "stop") && !input.port) {
          throw new McpError(ErrorCode.InvalidParams, "port is required for 'start' and 'stop' commands");
        }
        
        const result = await this.manageMockServer(input);
        
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
      const parsedResult = await this.parseSpecmaticOutput(result);
      
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
      const parsedResult = await this.parseSpecmaticOutput(result);
      
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
    junitFiles?: string[];
    junitReportPath?: string;
    hostJunitReportPath?: string;
  }> {
    const reportsDir = '/app/reports';
    
    return new Promise(async (resolve, reject) => {
      try {
        // List existing XML files before test execution
        const filesBefore = await listXmlFiles(reportsDir);
        
        const specmaticArgs = [
          "test",
          specFile,
          `--testBaseURL=${apiBaseUrl}`,
          `--junitReportDir=${reportsDir}`
        ];

      const specmaticProcess = spawn("specmatic", specmaticArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...env },
      });

      let stdout = "";
      let stderr = "";

      specmaticProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      specmaticProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      specmaticProcess.on("close", async (code) => {
        try {
          // Discover new XML files after test execution
          const newFiles = await findNewJunitFiles(reportsDir, filesBefore);
          
          let junitReportPath: string | undefined;
          let hostJunitReportPath: string | undefined;
          
          if (newFiles.length > 0) {
            // Use the first (or most recent) JUnit file found
            const junitFilename = newFiles[0];
            junitReportPath = path.join(reportsDir, junitFilename);
            hostJunitReportPath = `./reports/${junitFilename}`;
          }
          
          resolve({
            stdout,
            stderr,
            exitCode: code || 0,
            junitFiles: newFiles,
            junitReportPath,
            hostJunitReportPath
          });
        } catch (error) {
          // If file discovery fails, still return the basic result
          resolve({
            stdout,
            stderr,
            exitCode: code || 0,
          });
        }
      });

      specmaticProcess.on("error", (error) => {
        reject(error);
      });

      // Set a timeout for the test execution (5 minutes)
      setTimeout(() => {
        specmaticProcess.kill("SIGTERM");
        reject(new Error("Test execution timeout after 5 minutes"));
      }, 5 * 60 * 1000);
      } catch (error) {
        reject(error);
      }
    });
  }

  private async parseSpecmaticOutput(result: {
    stdout: string;
    stderr: string;
    exitCode: number;
    junitFiles?: string[];
    junitReportPath?: string;
    hostJunitReportPath?: string;
  }): Promise<SpecmaticTestResult> {
    const { stdout, stderr, exitCode, junitFiles, junitReportPath, hostJunitReportPath } = result;
    const success = exitCode === 0;

    // Initialize test results with JUnit paths
    const testResults: SpecmaticTestResult = {
      success,
      output: stdout,
      errors: stderr,
      exitCode,
      junitReportPath,
      hostJunitReportPath,
    };

    // Try to parse JUnit XML if available
    if (junitReportPath) {
      try {
        const junitData = await parseJunitXmlFile(junitReportPath);
        if (junitData) {
          testResults.junitParsedData = junitData;
          
          // Update summary from JUnit data (more accurate than console parsing)
          testResults.summary = {
            totalTests: junitData.tests,
            passed: junitData.tests - junitData.failures - junitData.errors,
            failed: junitData.failures + junitData.errors,
            testDetails: junitData.testcases.map(tc => ({
              scenario: `${tc.classname}.${tc.name}`,
              status: tc.status === 'FAILED' ? 'FAILED' : 'PASSED',
              message: tc.failure?.message || tc.error?.message
            }))
          };
        }
      } catch (error) {
        console.error('Failed to parse JUnit XML:', error);
      }
    }

    // Fallback: Try to parse test summary from console output if JUnit parsing failed
    if (!testResults.summary) {
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

      // Add JUnit report reference if available
      if (result.hostJunitReportPath) {
        output += `📄 **Detailed JUnit Report:** \`${result.hostJunitReportPath}\`\n\n`;
        output += `For complete failure analysis, use the Read tool to analyze the JUnit XML report above.\n`;
        output += `The report contains detailed test results, timing information, and stack traces.\n\n`;
      }

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

    // For large outputs, prioritize JUnit reports over console output
    if (result.output && !result.hostJunitReportPath) {
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
        output += "## Console Output\n";
        output += "```\n";
        output += result.output;
        output += "\n```\n\n";
      }
    } else if (result.hostJunitReportPath) {
      output += "*Console output omitted - detailed results available in JUnit report above.*\n\n";
    }

    if (result.errors) {
      output += "## Errors\n";
      output += "```\n";
      output += result.errors;
      output += "\n```\n";
    }

    return output;
  }

  private async manageMockServer(input: {
    command: "start" | "stop" | "list";
    openApiSpec?: string;
    port?: number;
    specFormat?: "yaml" | "json";
  }): Promise<MockServerResult> {
    switch (input.command) {
      case "start":
        return await this.startMockServer(input as {
          openApiSpec: string;
          port: number;
          specFormat: "yaml" | "json";
        });
      case "stop":
        return await this.stopMockServer(input.port!);
      case "list":
        return await this.listMockServers();
      default:
        return {
          success: false,
          command: input.command,
          message: `Unknown command: ${input.command}`,
        };
    }
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
          command: "start",
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
          command: "start",
          url: `http://localhost:${input.port}`,
          port: input.port,
          pid: result.process.pid,
          message: `Mock server started successfully on port ${input.port}`,
        };
      } else {
        return {
          success: false,
          command: "start",
          port: input.port,
          message: "Failed to start mock server",
          errors: result.error,
        };
      }
    } catch (error) {
      return {
        success: false,
        command: "start",
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
      const specmaticArgs = [
        "stub",
        specFile,
        `--port=${port}`
      ];

      const specmaticProcess = spawn("specmatic", specmaticArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        detached: false,
      });

      let hasResolved = false;
      let stderr = "";

      // Give the server a moment to start up
      setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          if (specmaticProcess.killed) {
            resolve({
              success: false,
              error: stderr || "Process was killed during startup",
            });
          } else {
            resolve({
              success: true,
              process: specmaticProcess,
            });
          }
        }
      }, 2000);

      specmaticProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      specmaticProcess.on("error", (error) => {
        if (!hasResolved) {
          hasResolved = true;
          resolve({
            success: false,
            error: error.message,
          });
        }
      });

      specmaticProcess.on("exit", (code) => {
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

  private async stopMockServer(port: number): Promise<MockServerResult> {
    try {
      const serverInfo = this.runningMockServers.get(port);
      
      if (!serverInfo) {
        return {
          success: false,
          command: "stop",
          port: port,
          message: `No mock server running on port ${port}`,
        };
      }

      // Kill the process
      serverInfo.process.kill("SIGTERM");
      
      // Remove from tracking
      this.runningMockServers.delete(port);

      return {
        success: true,
        command: "stop",
        port: port,
        message: `Mock server on port ${port} stopped successfully`,
      };
    } catch (error) {
      return {
        success: false,
        command: "stop",
        port: port,
        message: "Failed to stop mock server",
        errors: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async listMockServers(): Promise<MockServerResult> {
    const runningServers = Array.from(this.runningMockServers.entries()).map(([port, info]) => ({
      port: port,
      url: info.url,
      pid: info.process.pid,
    }));

    return {
      success: true,
      command: "list",
      message: `Found ${runningServers.length} running mock server${runningServers.length === 1 ? '' : 's'}`,
      runningServers,
    };
  }

  private formatMockServerResult(result: MockServerResult): string {
    let output = `# Specmatic Mock Server Management\n\n`;

    switch (result.command) {
      case "start":
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
          output += "**Note:** Use the 'stop' command to terminate this server when done.\n";
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
        break;

      case "stop":
        if (result.success) {
          output += "## ✅ Mock Server Stopped Successfully\n\n";
          output += `**Port:** ${result.port}\n`;
          output += `**Status:** ${result.message}\n\n`;
          output += "The mock server has been terminated and the port is now available for reuse.\n";
        } else {
          output += "## ❌ Failed to Stop Mock Server\n\n";
          output += `**Error:** ${result.message}\n`;
          if (result.errors) {
            output += "\n## Error Details\n";
            output += "```\n";
            output += result.errors;
            output += "\n```\n";
          }
        }
        break;

      case "list":
        if (result.success) {
          output += `## 📋 Running Mock Servers\n\n`;
          output += `**Status:** ${result.message}\n\n`;
          
          if (result.runningServers && result.runningServers.length > 0) {
            output += "| Port | URL | Process ID |\n";
            output += "|------|-----|------------|\n";
            for (const server of result.runningServers) {
              output += `| ${server.port} | ${server.url} | ${server.pid || 'N/A'} |\n`;
            }
            output += "\n**Usage:**\n";
            output += "- Use any of the URLs above in your frontend applications\n";
            output += "- Stop specific servers using the 'stop' command with the port number\n";
          } else {
            output += "No mock servers are currently running.\n\n";
            output += "Use the 'start' command to create a new mock server from an OpenAPI specification.\n";
          }
        } else {
          output += "## ❌ Failed to List Mock Servers\n\n";
          output += `**Error:** ${result.message}\n`;
        }
        break;

      default:
        output += "## ❌ Unknown Command\n\n";
        output += `**Error:** ${result.message}\n`;
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