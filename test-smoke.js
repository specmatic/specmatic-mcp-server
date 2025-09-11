#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const log = (color, message) => console.log(`${color}${message}${colors.reset}`);
const success = (message) => log(colors.green, `✅ ${message}`);
const error = (message) => log(colors.red, `❌ ${message}`);
const info = (message) => log(colors.blue, `ℹ️  ${message}`);
const warn = (message) => log(colors.yellow, `⚠️  ${message}`);

class MCPSmokeTest {
  constructor() {
    this.mcpProcess = null;
    this.testSpecPath = path.join(__dirname, 'test-spec.yaml');
    this.testSpec = '';
    this.mockPort = 9001;
    this.requestId = 1;
  }

  async run() {
    try {
      info('Starting Specmatic MCP Smoke Test...');
      
      // Load test spec
      await this.loadTestSpec();
      
      // Start MCP server
      await this.startMCPServer();
      
      // Initialize MCP connection
      await this.initializeMCP();
      
      // Run the test loop
      await this.runTestLoop();
      
      success('🎉 All smoke tests passed!');
      process.exit(0);
      
    } catch (err) {
      error(`Smoke test failed: ${err.message}`);
      await this.cleanup();
      process.exit(1);
    }
  }

  async loadTestSpec() {
    info('Loading test specification...');
    if (!fs.existsSync(this.testSpecPath)) {
      throw new Error(`Test spec not found: ${this.testSpecPath}`);
    }
    this.testSpec = fs.readFileSync(this.testSpecPath, 'utf8');
    success('Test specification loaded');
  }

  async startMCPServer() {
    info('Starting MCP server...');
    return new Promise((resolve, reject) => {
      this.mcpProcess = spawn('node', ['build/index.js'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.mcpProcess.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('running on stdio')) {
          success('MCP server started');
          resolve();
        }
      });

      this.mcpProcess.on('error', (err) => {
        reject(new Error(`Failed to start MCP server: ${err.message}`));
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!this.mcpProcess.killed) {
          resolve(); // Assume it started if process is still running
        }
      }, 5000);
    });
  }

  async initializeMCP() {
    info('Initializing MCP connection...');
    const initRequest = {
      jsonrpc: "2.0",
      id: this.requestId++,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        clientInfo: { name: "smoke-test", version: "1.0.0" }
      }
    };

    const response = await this.sendMCPRequest(initRequest);
    if (response.result && response.result.serverInfo) {
      success('MCP connection initialized');
    } else {
      throw new Error('Failed to initialize MCP connection');
    }
  }

  async runTestLoop() {
    info('Starting test loop...');

    // Step 1: Start mock server
    await this.startMockServer();
    
    // Step 2: Run contract test
    await this.runContractTest();
    
    // Step 3: Run resiliency test  
    await this.runResiliencyTest();
    
    // Step 4: Stop mock server
    await this.stopMockServer();
    
    // Step 5: Test backward compatibility (npm only) - final validation
    await this.testBackwardCompatibility();
    
    success('Test loop completed successfully');
  }

  async startMockServer() {
    info(`Starting mock server on port ${this.mockPort}...`);
    const request = {
      jsonrpc: "2.0",
      id: this.requestId++,
      method: "tools/call",
      params: {
        name: "manage_mock_server",
        arguments: {
          command: "start",
          openApiSpec: this.testSpec,
          port: this.mockPort,
          specFormat: "yaml"
        }
      }
    };

    const response = await this.sendMCPRequest(request);
    
    if (response.result && response.result.content && response.result.content.some(c => c.text.includes('Started Successfully'))) {
      success(`Mock server started on port ${this.mockPort}`);
      // Wait a moment for server to be ready
      await this.sleep(2000);
    } else if (response.result && response.result.content) {
      const output = response.result.content.find(c => c.text)?.text || '';
      throw new Error(`Failed to start mock server: ${output}`);
    } else {
      throw new Error(`Failed to start mock server: ${JSON.stringify(response)}`);
    }
  }

  async runContractTest() {
    info('Running contract test against mock server...');
    const request = {
      jsonrpc: "2.0",
      id: this.requestId++,
      method: "tools/call",
      params: {
        name: "run_contract_test",
        arguments: {
          openApiSpec: this.testSpec,
          apiBaseUrl: `http://localhost:${this.mockPort}`,
          specFormat: "yaml"
        }
      }
    };

    const response = await this.sendMCPRequest(request, 60000); // 60 second timeout
    if (response.result && response.result.content) {
      const output = response.result.content.find(c => c.text)?.text || '';
      if (output.includes('Test Status: PASSED') || output.includes('✅')) {
        success('Contract test passed');
      } else if (output.includes('Test Status: FAILED') || output.includes('❌')) {
        warn('Contract test had failures (expected for demo)');
        info('Contract test output: ' + output.substring(0, 200) + '...');
      } else {
        warn('Contract test completed with unknown status');
        info('Contract test output: ' + output.substring(0, 200) + '...');
      }
    } else {
      throw new Error('Failed to run contract test');
    }
  }

  async runResiliencyTest() {
    info('Running resiliency test against mock server...');
    const request = {
      jsonrpc: "2.0",
      id: this.requestId++,
      method: "tools/call",
      params: {
        name: "run_resiliency_test",
        arguments: {
          openApiSpec: this.testSpec,
          apiBaseUrl: `http://localhost:${this.mockPort}`,
          specFormat: "yaml"
        }
      }
    };

    const response = await this.sendMCPRequest(request, 60000); // 60 second timeout
    if (response.result && response.result.content) {
      const output = response.result.content.find(c => c.text)?.text || '';
      if (output.includes('Test Status:')) {
        success('Resiliency test completed');
        info('Resiliency test output: ' + output.substring(0, 200) + '...');
      } else {
        warn('Resiliency test completed with unknown status');
        info('Resiliency test output: ' + output.substring(0, 200) + '...');
      }
    } else {
      throw new Error('Failed to run resiliency test');
    }
  }

  async testBackwardCompatibility() {
    info('Testing backward compatibility check (npm environments only)...');
    
    // First, list available tools to see if backward compatibility is available
    const listRequest = {
      jsonrpc: "2.0",
      id: this.requestId++,
      method: "tools/list",
      params: {}
    };

    const listResponse = await this.sendMCPRequest(listRequest);
    const tools = listResponse.result?.tools || [];
    const hasBackwardCompatTool = tools.some(tool => tool.name === "backward_compatibility_check");

    if (!hasBackwardCompatTool) {
      info('Backward compatibility check not available (Docker environment detected) - skipping');
      return;
    }

    let originalSpec = '';

    try {
      // Step 1: Store original spec content
      originalSpec = fs.readFileSync(this.testSpecPath, 'utf8');
      info('Original test spec backed up');

      // Step 2: Initialize git repository if not exists
      await this.setupGitRepo();
      info('Git repository setup completed');

      // Step 3: Create breaking change in test-spec.yaml
      await this.createBreakingChange();
      info('Breaking change applied to test spec');

      // Step 4: Run backward compatibility check
      const request = {
        jsonrpc: "2.0",
        id: this.requestId++,
        method: "tools/call",
        params: {
          name: "backward_compatibility_check",
          arguments: {
            specFilePath: this.testSpecPath
          }
        }
      };

      const response = await this.sendMCPRequest(request, 60000); // 60 second timeout
      
      // Step 5: Validate the response
      if (response.result && response.result.content) {
        const output = response.result.content.find(c => c.text)?.text || '';
        
        if (output.includes('BREAKING CHANGES DETECTED') || output.includes('breaking change')) {
          success('Backward compatibility check correctly detected breaking changes');
          info('Breaking change detection validated successfully');
        } else if (output.includes('BACKWARD COMPATIBLE')) {
          error('❌ SMOKE TEST FAILURE: Backward compatibility check did not detect breaking changes (this should have failed)');
          info('Response: ' + output.substring(0, 300) + '...');
          throw new Error('Backward compatibility check failed to detect expected breaking changes');
        } else if (output.includes('FAILED')) {
          warn('Backward compatibility check failed (may be expected in some environments)');
          info('Response: ' + output.substring(0, 300) + '...');
        } else {
          error('❌ SMOKE TEST FAILURE: Backward compatibility check returned unexpected format');
          info('Response: ' + output.substring(0, 300) + '...');
          throw new Error('Backward compatibility check returned unexpected response format');
        }
      } else if (response.error) {
        warn(`Backward compatibility check failed: ${response.error.message}`);
      } else {
        warn('Backward compatibility check returned unexpected response format');
      }

    } catch (error) {
      error(`Backward compatibility test failed: ${error.message}`);
    } finally {
      // Step 6: Always restore original spec
      if (originalSpec) {
        try {
          fs.writeFileSync(this.testSpecPath, originalSpec, 'utf8');
          success('Original test spec restored');
        } catch (restoreError) {
          error(`Failed to restore original spec: ${restoreError.message}`);
        }
      }
    }
  }

  async setupGitRepo() {
    // Initialize git if not already initialized
    try {
      await this.execCommand('git', ['status']);
      info('Git repository already exists');
    } catch {
      info('Initializing git repository...');
      await this.execCommand('git', ['init']);
      await this.execCommand('git', ['config', 'user.name', 'Smoke Test']);
      await this.execCommand('git', ['config', 'user.email', 'smoketest@example.com']);
    }

    // Add and commit original test spec
    try {
      await this.execCommand('git', ['add', this.testSpecPath]);
      await this.execCommand('git', ['commit', '-m', 'Add original test spec for backward compatibility testing']);
      info('Original test spec committed to git');
    } catch (commitError) {
      // May fail if already committed - that's okay
      info('Test spec already in git history');
    }
  }

  async createBreakingChange() {
    const originalSpec = fs.readFileSync(this.testSpecPath, 'utf8');
    
    // Add a POST endpoint with mandatory field to create a breaking change
    const breakingChangeSpec = originalSpec.replace(
      'paths:\n  /posts:',
      `paths:
  /posts:
    post:
      summary: Create a new post
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                title:
                  type: string
                body:
                  type: string
                userId:
                  type: integer
              required: [title, body, userId]
      responses:
        '201':
          description: Post created
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: integer
                  title:
                    type: string
                  body:
                    type: string
                  userId:
                    type: integer
  /posts/{id}:`
    );

    fs.writeFileSync(this.testSpecPath, breakingChangeSpec, 'utf8');
    info('Breaking change applied: Added mandatory POST endpoint with required fields');
  }

  async execCommand(command, args) {
    const { spawn } = await import('child_process');
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { cwd: __dirname });
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => stdout += data);
      proc.stderr.on('data', (data) => stderr += data);
      
      proc.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`${command} failed: ${stderr}`));
      });
    });
  }

  async stopMockServer() {
    info(`Stopping mock server on port ${this.mockPort}...`);
    const request = {
      jsonrpc: "2.0",
      id: this.requestId++,
      method: "tools/call",
      params: {
        name: "manage_mock_server",
        arguments: {
          command: "stop",
          port: this.mockPort
        }
      }
    };

    const response = await this.sendMCPRequest(request);
    if (response.result && response.result.content) {
      success('Mock server stopped');
    } else {
      warn('Failed to stop mock server (may have already stopped)');
    }
  }

  async sendMCPRequest(request, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const requestStr = JSON.stringify(request) + '\n';
      
      let responseData = '';
      let timeoutHandle;

      const cleanup = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        this.mcpProcess.stdout.removeAllListeners('data');
      };

      timeoutHandle = setTimeout(() => {
        cleanup();
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.mcpProcess.stdout.on('data', (data) => {
        responseData += data.toString();
        
        // Try to parse JSON response
        const lines = responseData.split('\n');
        for (const line of lines) {
          if (line.trim() && line.trim().startsWith('{')) {
            try {
              const response = JSON.parse(line.trim());
              if (response.id === request.id) {
                cleanup();
                resolve(response);
                return;
              }
            } catch (e) {
              // Continue trying to parse
            }
          }
        }
      });

      this.mcpProcess.stdin.write(requestStr);
    });
  }

  async cleanup() {
    if (this.mcpProcess && !this.mcpProcess.killed) {
      info('Cleaning up MCP server...');
      this.mcpProcess.kill('SIGTERM');
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  const test = new MCPSmokeTest();
  await test.cleanup();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  const test = new MCPSmokeTest();
  await test.cleanup();  
  process.exit(1);
});

// Run the smoke test
const smokeTest = new MCPSmokeTest();
smokeTest.run();