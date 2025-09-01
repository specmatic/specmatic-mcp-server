import { SpecmaticTestResult, MockServerResult } from "../types/index.js";

export function formatTestResults(result: SpecmaticTestResult, testType: "contract" | "resiliency" = "contract"): string {
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

export function formatMockServerResult(result: MockServerResult): string {
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