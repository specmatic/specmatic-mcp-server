export interface JunitTestCase {
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

export interface JunitTestSuite {
  name: string;
  tests: number;
  failures: number;
  errors: number;
  skipped?: number;
  time?: number;
  testcases: JunitTestCase[];
}

export interface SpecmaticTestResult {
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

export interface MockServerResult {
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

export interface TestExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  junitFiles?: string[];
  junitReportPath?: string;
  hostJunitReportPath?: string;
}

export interface MockServerExecutionResult {
  success: boolean;
  process?: any;
  error?: string;
}

export interface BackwardCompatibilityResult {
  success: boolean;
  output: string;
  errors: string;
  exitCode: number;
  specFilePath: string;
  breakingChanges?: Array<{
    type: string;
    description: string;
    severity: "breaking" | "warning" | "info";
  }>;
  summary?: {
    totalChecks: number;
    breakingChanges: number;
    warnings: number;
    compatible: boolean;
  };
}