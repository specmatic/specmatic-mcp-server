#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.join(__dirname, 'test-xquik-openapi31.yaml');
const fixture = fs.readFileSync(fixturePath, 'utf8');

const checks = [
  ['OpenAPI 3.1 version', /^openapi:\s*3\.1\.0/m],
  ['Xquik API title', /title:\s*Xquik API/m],
  ['search endpoint', /\/api\/v1\/x\/tweets\/search:/m],
  ['API key security scheme', /name:\s*x-api-key/m],
  ['search operation id', /operationId:\s*searchTweets/m],
];

const failures = checks
  .filter(([, pattern]) => !pattern.test(fixture))
  .map(([label]) => label);

if (failures.length > 0) {
  console.error(`Invalid OpenAPI 3.1 fixture: ${failures.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('OpenAPI 3.1 fixture validated');
}
