import { z } from "zod";

export const RunContractTestInputSchema = z.object({
  openApiSpec: z.string().describe("The OpenAPI specification content (YAML or JSON)"),
  apiBaseUrl: z.string().describe("The base URL of the API to test against"),
  specFormat: z.enum(["yaml", "json"]).optional().default("yaml").describe("Format of the OpenAPI spec"),
});

export const ManageMockServerInputSchema = z.object({
  command: z.enum(["start", "stop", "list"]).describe("The action to perform on mock servers"),
  openApiSpec: z.string().optional().describe("The OpenAPI specification content (YAML or JSON) - required for 'start' command"),
  port: z.number().optional().default(9000).describe("Port number for the mock server - required for 'start' and 'stop' commands"),
  specFormat: z.enum(["yaml", "json"]).optional().default("yaml").describe("Format of the OpenAPI spec - used with 'start' command"),
});

export const BackwardCompatibilityInputSchema = z.object({
  targetPath: z.string().optional().describe("File or folder path to analyze for backward compatibility (e.g., 'products_api.yaml' or 'specs/'). If not provided, Specmatic will analyze all tracked specification files"),
  baseBranch: z.string().optional().describe("Git branch to compare against (defaults to current branch head)"),
  repoDir: z.string().optional().describe("Repository directory (defaults to current directory)"),
});

export type RunContractTestInput = z.infer<typeof RunContractTestInputSchema>;
export type ManageMockServerInput = z.infer<typeof ManageMockServerInputSchema>;
export type BackwardCompatibilityInput = z.infer<typeof BackwardCompatibilityInputSchema>;