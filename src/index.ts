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
import { RunContractTestInputSchema, ManageMockServerInputSchema, BackwardCompatibilityInputSchema } from "./schemas/index.js";
import { runContractTest, runResiliencyTest, isRunningInDocker } from "./services/contract-testing.js";
import { runBackwardCompatibilityCheck } from "./services/backward-compatibility.js";
import { MockServerManager } from "./services/mock-server.js";
import { formatTestResults, formatMockServerResult, formatBackwardCompatibilityResult } from "./formatters/index.js";



class SpecmaticMCPServer {
  private server: Server;
  private mockServerManager: MockServerManager;

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
    
    this.mockServerManager = new MockServerManager();
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
      const tools = [
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
      ];

      // Only add backward compatibility tool in non-Docker environments
      if (!isRunningInDocker()) {
        tools.push({
          name: "backward_compatibility_check",
          description: "Check for breaking changes in OpenAPI specifications using Specmatic's git-based analysis. Works with relative paths and automatically detects git repository context. Example: targetPath='products_api.yaml'",
          inputSchema: {
            type: "object",
            properties: {
              targetPath: {
                type: "string",
                description: "File or folder path to analyze for backward compatibility (e.g., 'products_api.yaml' or 'specs/'). If not provided, Specmatic will analyze all tracked specification files"
              },
              baseBranch: {
                type: "string", 
                description: "Git branch to compare against (optional, defaults to current branch head)"
              },
              repoDir: {
                type: "string",
                description: "Repository directory (optional, defaults to current directory)"
              }
            },
            required: []
          } as any,
        });
      }

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === "run_contract_test") {
        const input = RunContractTestInputSchema.parse(args);
        const result = await runContractTest(input);
        
        return {
          content: [
            {
              type: "text",
              text: formatTestResults(result, "contract"),
            },
          ],
        };
      }

      if (name === "run_resiliency_test") {
        const input = RunContractTestInputSchema.parse(args);
        const result = await runResiliencyTest(input);
        
        return {
          content: [
            {
              type: "text",
              text: formatTestResults(result, "resiliency"),
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
        
        const result = await this.mockServerManager.manageMockServer(input);
        
        return {
          content: [
            {
              type: "text",
              text: formatMockServerResult(result),
            },
          ],
        };
      }

      if (name === "backward_compatibility_check") {
        const input = BackwardCompatibilityInputSchema.parse(args);
        const result = await runBackwardCompatibilityCheck(input);
        
        return {
          content: [
            {
              type: "text",
              text: formatBackwardCompatibilityResult(result),
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






  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Specmatic MCP Server running on stdio");
  }
}

const server = new SpecmaticMCPServer();
server.run().catch(console.error);