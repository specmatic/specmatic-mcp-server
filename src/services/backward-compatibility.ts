import { spawnSpecmatic } from "./specmatic-runtime.js";
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
    
    const specmaticProcess = spawnSpecmatic(specmaticArgs, {
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
  
  // A failed process may have been denied before any comparison ran.
  const completed = stdout.match(/Files checked:\s*(\d+)\s*\(Passed:\s*(\d+),\s*Failed:\s*(\d+)\)/);
  const success = exitCode === 0;
  const compatible = exitCode === 0;

  const compatibilityResult: BackwardCompatibilityResult = {
    success,
    output: stdout,
    errors: stderr,
    exitCode,
    targetPath,
    summary: completed || success ? {
      totalChecks: completed ? Number(completed[1]) : 1,
      breakingChanges: completed ? Number(completed[3]) : 0,
      warnings: 0,
      compatible,
    } : undefined,
  };

  return compatibilityResult;
}