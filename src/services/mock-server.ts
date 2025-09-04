import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { MockServerResult, MockServerExecutionResult } from "../types/index.js";
import { ManageMockServerInput } from "../schemas/index.js";

export class MockServerManager {
  private runningMockServers: Map<number, { process: any; specFile: string; url: string }> = new Map();

  async manageMockServer(input: ManageMockServerInput): Promise<MockServerResult> {
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
  ): Promise<MockServerExecutionResult> {
    return new Promise((resolve) => {
      const specmaticArgs = [
        "stub",
        specFile,
        `--port=${port}`
      ];

      const specmaticProcess = spawn("npx", ["specmatic@latest", ...specmaticArgs], {
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
      }, 3000);

      specmaticProcess.stderr.on("data", (data) => {
        const output = data.toString();
        // Filter out Node.js deprecation warnings that aren't actual errors
        if (!output.includes("DeprecationWarning") && !output.includes("Use `node --trace-deprecation")) {
          stderr += output;
        }
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
            error: `Process exited with code ${code}: ${stderr.trim() || "No error details"}`,
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
}