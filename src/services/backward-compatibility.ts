import { spawn } from "child_process";
import * as fs from "fs/promises";
import { BackwardCompatibilityResult, TestExecutionResult } from "../types/index.js";
import { BackwardCompatibilityInput } from "../schemas/index.js";

export async function runBackwardCompatibilityCheck(input: BackwardCompatibilityInput): Promise<BackwardCompatibilityResult> {
  try {
    // Build specmatic backward-compatibility-check command arguments
    const specmaticArgs = ["backward-compatibility-check"];
    
    // Add optional parameters - let Specmatic handle all validation
    if (input.targetPath) {
      specmaticArgs.push("--target-path", input.targetPath);
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
    const parsedResult = parseBackwardCompatibilityOutput(result, input.targetPath);
    
    return parsedResult;
  } catch (error) {
    return {
      success: false,
      output: "",
      errors: error instanceof Error ? error.message : String(error),
      exitCode: 1,
      targetPath: input.targetPath,
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

function parseBackwardCompatibilityOutput(result: TestExecutionResult, targetPath?: string): BackwardCompatibilityResult {
  const { stdout, stderr, exitCode } = result;
  
  // Use exit code as the definitive indicator of compatibility
  // exitCode === 0 means backward compatible
  // exitCode !== 0 means breaking changes detected
  const success = exitCode === 0;
  const compatible = exitCode === 0;

  const compatibilityResult: BackwardCompatibilityResult = {
    success,
    output: stdout,
    errors: stderr,
    exitCode,
    targetPath,
    // Provide basic summary based on exit code
    summary: {
      totalChecks: 1, // We performed one backward compatibility check
      breakingChanges: compatible ? 0 : 1, // 0 if compatible, 1 if breaking changes
      warnings: 0, // Not parsing detailed warnings from text
      compatible: compatible,
    },
  };

  return compatibilityResult;
}