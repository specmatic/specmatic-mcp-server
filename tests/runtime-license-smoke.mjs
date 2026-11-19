import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Supply a signed legacy Enterprise fixture: it includes Core, Studio, Skeptic,
// and Insights, but must not acquire Genie or Scribe through trial fallback.
const [product, jarArgument, licenseArgument] = process.argv.slice(2);
assert.ok(['genie', 'scribe'].includes(product), 'Usage: node tests/runtime-license-smoke.mjs genie|scribe JAR LEGACY_LICENSE');
assert.ok(jarArgument && licenseArgument);
const root = await mkdtemp(path.join(tmpdir(), 'specmatic-runtime-license-'));
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java') : 'java';
const runtimeArguments = product === 'genie'
  ? ['mcp', 'server', '--client-product', 'genie']
  : ['--transport', 'stdio', '--require-product', 'scribe'];
const transport = new StdioClientTransport({
  command: java,
  args: [
    `-Duser.home=${root}`, `-Dspecmatic.license.file=${path.resolve(licenseArgument)}`,
    `-Dspecmatic.db.file=${path.join(root, 'license.json')}`,
    '-Dspecmatic.license.v3.disabled=true', '-Dspecmatic.license.utilization.shipDisabled=true',
    '-jar', path.resolve(jarArgument), ...runtimeArguments,
  ],
  env: { PATH: process.env.PATH, HOME: root, TMPDIR: root, TEMP: root },
  stderr: 'pipe',
});
const client = new Client({ name: 'packaged-license-smoke', version: '1' });
let diagnostics = '';
try {
  const connecting = client.connect(transport);
  transport.stderr?.on('data', data => { diagnostics += data.toString(); });
  await connecting;
  const name = product === 'genie' ? 'generate_openapi_examples' : 'start_scribe_project';
  const result = await client.callTool({ name, arguments: {} });
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), new RegExp(`Your license does not include Specmatic ${product === 'genie' ? 'Genie' : 'Scribe'}`));
  const diagnostic = await client.callTool({
    name: product === 'genie' ? 'get_runtime_info' : 'list_scribe_tools',
    arguments: product === 'genie' ? {} : { project_id: root },
  });
  assert.notEqual(diagnostic.isError, true);
  console.log(`Packaged ${product}: signed legacy denial and diagnostics passed.`);
} catch (error) {
  console.error(diagnostics.slice(-3000));
  throw error;
} finally {
  await client.close();
  await rm(root, { recursive: true, force: true });
}
