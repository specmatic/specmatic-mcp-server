import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { SpecmaticTestResult, TestExecutionResult, BackwardCompatibilityResult } from "../types/index.js";
import { RunContractTestInput, BackwardCompatibilityInput } from "../schemas/index.js";
import { listXmlFiles, findNewJunitFiles, parseJunitXmlFile } from "../utils/junit-parser.js";

/**
 * Detects if the application is running inside a Docker container
 */
export function isRunningInDocker(): boolean {
  try {
    // Check for Docker-specific indicators
    // 1. Check if /.dockerenv file exists
    try {
      require('fs').accessSync('/.dockerenv');
      return true;
    } catch {}
    
    // 2. Check if we're running as root with specific working directory
    if (process.getuid && process.getuid() === 0 && process.cwd() === '/app') {
      return true;
    }
    
    // 3. Check if container-specific environment variables exist
    if (process.env.HOSTNAME && process.env.HOSTNAME.length === 12) {
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Gets the appropriate reports directory based on environment
 */
function getReportsDirectory(): string {
  if (isRunningInDocker()) {
    return '/app/reports';
  } else {
    return path.resolve('./build/reports/specmatic');
  }
}

async function runSpecmaticTest(input: RunContractTestInput, resiliency: boolean = false): Promise<SpecmaticTestResult> {
  const tempDirPrefix = resiliency ? "specmatic-resiliency-test-" : "specmatic-test-";
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), tempDirPrefix));
  const specFile = path.join(tempDir, `spec.${input.specFormat}`);

  try {
    // Write the OpenAPI spec to a temporary file
    await fs.writeFile(specFile, input.openApiSpec, "utf8");

    // Set environment variables based on test type
    const env: Record<string, string> = resiliency ? { SPECMATIC_GENERATIVE_TESTS: "true" } : {};
    
    // Run Specmatic test
    const result = await executeSpecmaticTest(specFile, input.apiBaseUrl, env);
    
    // Parse the output to extract test results
    const parsedResult = await parseSpecmaticOutput(result);
    
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

export async function runContractTest(input: RunContractTestInput): Promise<SpecmaticTestResult> {
  return runSpecmaticTest(input, false);
}

export async function runResiliencyTest(input: RunContractTestInput): Promise<SpecmaticTestResult> {
  return runSpecmaticTest(input, true);
}

async function executeSpecmaticTest(
  specFile: string, 
  apiBaseUrl: string, 
  env: Record<string, string> = {}
): Promise<TestExecutionResult> {
  const reportsDir = getReportsDirectory();
  
  return new Promise(async (resolve, reject) => {
    try {
      // Ensure reports directory exists
      await fs.mkdir(reportsDir, { recursive: true });
      
      // List existing XML files before test execution
      const filesBefore = await listXmlFiles(reportsDir);
      
      const specmaticArgs = [
        "test",
        specFile,
        `--testBaseURL=${apiBaseUrl}`,
        `--junitReportDir=${reportsDir}`
      ];

    const specmaticProcess = spawn("npx", ["specmatic@latest", ...specmaticArgs], {
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
          
          // Set host path based on environment
          if (isRunningInDocker()) {
            // In Docker, assume volume mount to ./build/reports/specmatic/ on host
            hostJunitReportPath = `./build/reports/specmatic/${junitFilename}`;
          } else {
            // In npm/local environment, use relative path from current directory
            hostJunitReportPath = path.join('./build/reports/specmatic', junitFilename);
          }
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

async function parseSpecmaticOutput(result: TestExecutionResult): Promise<SpecmaticTestResult> {
  const { stdout, stderr, exitCode, junitReportPath, hostJunitReportPath } = result;
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

export async function runBackwardCompatibilityCheck(input: BackwardCompatibilityInput): Promise<BackwardCompatibilityResult> {
  try {
    // Validate that the spec file exists
    await fs.access(input.specFilePath, fs.constants.F_OK | fs.constants.R_OK);
    
    // Build specmatic backward-compatibility-check command arguments
    const specmaticArgs = ["backward-compatibility-check"];
    
    // Add optional parameters
    if (input.targetPath) {
      specmaticArgs.push("--target-path", input.targetPath);
    } else {
      specmaticArgs.push("--target-path", input.specFilePath);
    }
    
    if (input.baseBranch) {
      specmaticArgs.push("--base-branch", input.baseBranch);
    }
    
    if (input.repoDir) {
      specmaticArgs.push("--repo-dir", input.repoDir);
    }
    
    // Execute the backward compatibility check
    const result = await executeBackwardCompatibilityCheck(specmaticArgs, input.repoDir);
    
    // Parse the output to extract compatibility results
    const parsedResult = parseBackwardCompatibilityOutput(result, input.specFilePath);
    
    return parsedResult;
  } catch (error) {
    return {
      success: false,
      output: "",
      errors: error instanceof Error ? error.message : String(error),
      exitCode: 1,
      specFilePath: input.specFilePath,
    };
  }
}

async function executeBackwardCompatibilityCheck(
  specmaticArgs: string[], 
  repoDir?: string
): Promise<TestExecutionResult> {
  return new Promise((resolve, reject) => {
    const workingDir = repoDir || process.cwd();
    
    const specmaticProcess = spawn("npx", ["specmatic@latest", ...specmaticArgs], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: workingDir,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    specmaticProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    specmaticProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    specmaticProcess.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });

    specmaticProcess.on("error", (error) => {
      reject(error);
    });

    // Set a timeout for the compatibility check (5 minutes)
    setTimeout(() => {
      specmaticProcess.kill("SIGTERM");
      reject(new Error("Backward compatibility check timeout after 5 minutes"));
    }, 5 * 60 * 1000);
  });
}

function parseBackwardCompatibilityOutput(result: TestExecutionResult, specFilePath: string): BackwardCompatibilityResult {
  const { stdout, stderr, exitCode } = result;
  const success = exitCode === 0;

  const compatibilityResult: BackwardCompatibilityResult = {
    success,
    output: stdout,
    errors: stderr,
    exitCode,
    specFilePath,
  };

  // Try to parse the output for breaking changes and compatibility info
  try {
    const lines = stdout.split("\n");
    const breakingChanges: Array<{
      type: string;
      description: string;
      severity: "breaking" | "warning" | "info";
    }> = [];

    let totalChecks = 0;
    let breakingChangeCount = 0;
    let warningCount = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Look for breaking change indicators
      if (trimmedLine.includes("BREAKING") || trimmedLine.includes("breaking change")) {
        breakingChanges.push({
          type: "breaking_change",
          description: trimmedLine,
          severity: "breaking",
        });
        breakingChangeCount++;
      } else if (trimmedLine.includes("WARNING") || trimmedLine.includes("warning")) {
        breakingChanges.push({
          type: "warning",
          description: trimmedLine,
          severity: "warning",
        });
        warningCount++;
      } else if (trimmedLine.includes("INFO") || trimmedLine.includes("info")) {
        breakingChanges.push({
          type: "info",
          description: trimmedLine,
          severity: "info",
        });
      }
      
      // Count total checks
      if (trimmedLine.includes("check") || trimmedLine.includes("compare") || trimmedLine.includes("validate")) {
        totalChecks++;
      }
    }

    if (breakingChanges.length > 0 || success) {
      compatibilityResult.breakingChanges = breakingChanges;
      compatibilityResult.summary = {
        totalChecks: Math.max(totalChecks, breakingChanges.length),
        breakingChanges: breakingChangeCount,
        warnings: warningCount,
        compatible: success && breakingChangeCount === 0,
      };
    }
  } catch (parseError) {
    console.error("Failed to parse backward compatibility output:", parseError);
  }

  return compatibilityResult;
}