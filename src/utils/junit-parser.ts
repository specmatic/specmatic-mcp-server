import * as fs from "fs/promises";
import { XMLParser } from "fast-xml-parser";
import { JunitTestCase, JunitTestSuite } from "../types/index.js";

export async function listXmlFiles(directory: string): Promise<string[]> {
  try {
    const files = await fs.readdir(directory);
    return files.filter(file => file.endsWith('.xml'));
  } catch (error) {
    return []; // Return empty array if directory doesn't exist or can't be read
  }
}

export async function findNewJunitFiles(reportsDir: string, filesBefore: string[]): Promise<string[]> {
  const filesAfter = await listXmlFiles(reportsDir);
  return filesAfter.filter(file => !filesBefore.includes(file));
}

export async function parseJunitXmlFile(filePath: string): Promise<JunitTestSuite | null> {
  try {
    const xmlContent = await fs.readFile(filePath, 'utf8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });
    
    const jsonObj = parser.parse(xmlContent);
    
    // Handle different JUnit XML structures (testsuite or testsuites)
    let testSuite = jsonObj.testsuite || jsonObj.testsuites?.testsuite;
    
    if (!testSuite) {
      console.error('No testsuite found in XML file:', filePath);
      return null;
    }
    
    // Handle case where testsuite is an array (multiple test suites)
    if (Array.isArray(testSuite)) {
      testSuite = testSuite[0]; // Take the first one for now
    }
    
    const testcases: JunitTestCase[] = [];
    const rawTestcases = testSuite.testcase || [];
    const testcaseArray = Array.isArray(rawTestcases) ? rawTestcases : [rawTestcases];
    
    for (const tc of testcaseArray) {
      const testcase: JunitTestCase = {
        name: tc['@_name'] || tc.name || 'Unknown Test',
        classname: tc['@_classname'] || tc.classname || 'Unknown Class',
        status: 'PASSED',
        time: tc['@_time'] ? parseFloat(tc['@_time']) : undefined
      };
      
      // Check for failure or error
      if (tc.failure) {
        testcase.status = 'FAILED';
        testcase.failure = {
          message: tc.failure['@_message'] || tc.failure.message || 'Test failed',
          type: tc.failure['@_type'] || tc.failure.type,
          content: typeof tc.failure === 'string' ? tc.failure : tc.failure['#text']
        };
      } else if (tc.error) {
        testcase.status = 'FAILED';
        testcase.error = {
          message: tc.error['@_message'] || tc.error.message || 'Test error',
          type: tc.error['@_type'] || tc.error.type,
          content: typeof tc.error === 'string' ? tc.error : tc.error['#text']
        };
      } else if (tc.skipped) {
        testcase.status = 'SKIPPED';
      }
      
      testcases.push(testcase);
    }
    
    return {
      name: testSuite['@_name'] || testSuite.name || 'Test Suite',
      tests: parseInt(testSuite['@_tests'] || testSuite.tests || '0'),
      failures: parseInt(testSuite['@_failures'] || testSuite.failures || '0'),
      errors: parseInt(testSuite['@_errors'] || testSuite.errors || '0'),
      skipped: parseInt(testSuite['@_skipped'] || testSuite.skipped || '0'),
      time: testSuite['@_time'] ? parseFloat(testSuite['@_time']) : undefined,
      testcases
    };
  } catch (error) {
    console.error('Failed to parse JUnit XML file:', filePath, error);
    return null;
  }
}