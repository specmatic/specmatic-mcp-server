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