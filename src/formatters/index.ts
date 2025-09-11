import { SpecmaticTestResult, MockServerResult, BackwardCompatibilityResult } from "../types/index.js";

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

export function formatBackwardCompatibilityResult(result: BackwardCompatibilityResult): string {
  let output = `# Specmatic Backward Compatibility Check\n\n`;

  // Show the file being analyzed if provided
  if (result.targetPath) {
    output += `**File:** \`${result.targetPath}\`\n\n`;
  }

  // Show compatibility status based on exit code
  // success = (exitCode === 0) means backward compatible
  // !success = (exitCode !== 0) means breaking changes detected
  if (result.success) {
    output += "## ✅ Compatibility Status: BACKWARD COMPATIBLE\n\n";
    output += "No breaking changes detected. The API specification changes are backward compatible.\n\n";
  } else if (result.exitCode !== 0) {
    output += "## ⚠️ Compatibility Status: BREAKING CHANGES DETECTED\n\n";
    output += "The specification contains changes that may break existing clients.\n\n";
  } else {
    output += "## ❌ Compatibility Check: FAILED\n\n";
    output += "The backward compatibility check could not complete successfully.\n\n";
  }

  // Show summary if available
  if (result.summary) {
    output += `## Summary\n`;
    output += `- Total Checks: ${result.summary.totalChecks}\n`;
    output += `- Breaking Changes: ${result.summary.breakingChanges}\n`;
    output += `- Warnings: ${result.summary.warnings}\n`;
    output += `- Backward Compatible: ${result.summary.compatible ? 'Yes' : 'No'}\n\n`;

    // Show breaking changes and warnings
    if (result.breakingChanges && result.breakingChanges.length > 0) {
      const breakingItems = result.breakingChanges.filter(change => change.severity === "breaking");
      const warningItems = result.breakingChanges.filter(change => change.severity === "warning");
      const infoItems = result.breakingChanges.filter(change => change.severity === "info");

      if (breakingItems.length > 0) {
        output += "## 🚨 Breaking Changes\n";
        output += "*These changes will break existing clients and require careful consideration:*\n\n";
        for (const change of breakingItems) {
          output += `❌ **${change.type}**: ${change.description}\n`;
        }
        output += "\n";
      }

      if (warningItems.length > 0) {
        output += "## ⚠️ Warnings\n";
        output += "*These changes may affect clients but are not necessarily breaking:*\n\n";
        for (const change of warningItems) {
          output += `⚠️ **${change.type}**: ${change.description}\n`;
        }
        output += "\n";
      }

      if (infoItems.length > 0) {
        output += "## ℹ️ Information\n";
        output += "*Additional details about the changes:*\n\n";
        for (const change of infoItems) {
          output += `ℹ️ **${change.type}**: ${change.description}\n`;
        }
        output += "\n";
      }
    } else if (result.summary.compatible) {
      output += "## ✅ All Changes Compatible\n";
      output += "All detected changes maintain backward compatibility.\n\n";
    }
  }

  // Show recommendations based on results
  if (result.summary?.breakingChanges && result.summary.breakingChanges > 0) {
    output += "## 🔧 Recommendations\n\n";
    output += "**Breaking changes detected!** Consider these approaches:\n\n";
    output += "1. **Version Increment**: Update the API version (e.g., v1 → v2) to indicate breaking changes\n";
    output += "2. **Gradual Migration**: Maintain both old and new endpoints during a transition period\n";
    output += "3. **Redesign Changes**: Modify the changes to maintain backward compatibility\n";
    output += "4. **Client Communication**: Notify API consumers about the breaking changes and migration path\n\n";
  } else if (result.summary?.warnings && result.summary.warnings > 0) {
    output += "## 💡 Recommendations\n\n";
    output += "**Warnings detected.** Consider:\n\n";
    output += "1. **Review Impact**: Assess if warnings affect your specific client implementations\n";
    output += "2. **Documentation**: Update API documentation to reflect any behavioral changes\n";
    output += "3. **Testing**: Thoroughly test existing client integrations\n\n";
  } else if (result.summary?.compatible) {
    output += "## ✨ Next Steps\n\n";
    output += "Your changes are backward compatible! You can proceed with confidence:\n\n";
    output += "1. **Deploy**: The changes can be safely deployed\n";
    output += "2. **Document**: Update API documentation as needed\n";
    output += "3. **Test**: Run your existing test suite to ensure everything works as expected\n\n";
  }

  // Always show console output for backward compatibility check
  // This contains the detailed Specmatic analysis including specific breaking changes
  if (result.output) {
    output += "## Detailed Analysis\n";
    output += "```\n";
    output += result.output;
    output += "\n```\n\n";
  }

  // Show errors if any
  if (result.errors) {
    output += "## Errors\n";
    output += "```\n";
    output += result.errors;
    output += "\n```\n";
  }

  return output;
}