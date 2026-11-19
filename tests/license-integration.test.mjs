import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const spec = 'openapi: 3.0.3\ninfo: {title: Pets, version: "1"}\npaths: {}';

for (const relativeJar of [false, true]) {
  test(`licensed Core denial reaches the MCP caller without OSS fallback (${relativeJar ? 'relative' : 'absolute'} JAR)`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specmatic-license-mcp-'));
    const bin = path.join(root, 'bin');
    await mkdir(bin);
    const log = path.join(root, 'arguments');
    await writeFile(path.join(bin, 'java'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$LAUNCH_ARGS"\nif [ ! -r "$2" ]; then echo "Unable to access jarfile" >&2; exit 1; fi\necho "Your license does not include Specmatic Core" >&2\nexit 1\n', { mode: 0o755 });
    await writeFile(path.join(bin, 'npx'), '#!/bin/sh\necho "OSS fallback selected"\nexit 0\n', { mode: 0o755 });
    const jar = path.join(root, 'enterprise.jar');
    await writeFile(jar, 'fixture');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve('build/index.js')],
      env: { PATH: bin + path.delimiter + process.env.PATH, HOME: root, TMPDIR: root, TEMP: root,
        SPECMATIC_ENTERPRISE_JAR: relativeJar ? path.relative(process.cwd(), jar) : jar, LAUNCH_ARGS: log },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'license-test', version: '1' });
    try {
      await client.connect(transport);
      for (const [name, arguments_, command] of [
        ['run_contract_test', { openApiSpec: spec, apiBaseUrl: 'http://localhost:12345' }, 'test'],
        ['run_resiliency_test', { openApiSpec: spec, apiBaseUrl: 'http://localhost:12345' }, 'test'],
        ['manage_mock_server', { command: 'start', openApiSpec: spec, port: 19001 }, 'stub'],
        ['backward_compatibility_check', { repoDir: root }, 'backward-compatibility-check'],
      ]) {
        const result = await client.callTool({ name, arguments: arguments_ });
        assert.equal(result.isError, true, name);
        assert.match(JSON.stringify(result.content), /Your license does not include Specmatic Core/);
        if (name === 'backward_compatibility_check') assert.doesNotMatch(JSON.stringify(result.content), /BREAKING CHANGES DETECTED/);
        const launch = (await readFile(log, 'utf8')).trim().split('\n');
        assert.equal(launch[0], '-jar');
        assert.equal(launch[2], command);
        if (!relativeJar) assert.equal(launch[1], jar);
      }
      const cleanup = await client.callTool({ name: 'manage_mock_server', arguments: { command: 'list' } });
      assert.notEqual(cleanup.isError, true);
    } finally {
      await client.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('OSS mode stays available and cleanup does not invoke a licensed runtime', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'specmatic-oss-mcp-'));
  const bin = path.join(root, 'bin');
  await mkdir(bin);
  const log = path.join(root, 'arguments');
  await writeFile(path.join(bin, 'npx'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$LAUNCH_ARGS"\nexit 0\n', { mode: 0o755 });
  const client = new Client({ name: 'oss-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve('build/index.js')],
    env: { PATH: bin + path.delimiter + process.env.PATH, HOME: root, TMPDIR: root, TEMP: root, LAUNCH_ARGS: log }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const cleanup = await client.callTool({ name: 'manage_mock_server', arguments: { command: 'list' } });
    assert.notEqual(cleanup.isError, true);
    const result = await client.callTool({ name: 'run_contract_test', arguments: { openApiSpec: spec, apiBaseUrl: 'http://localhost:12345' } });
    assert.equal(result.isError, false);
    assert.deepEqual((await readFile(log, 'utf8')).trim().split('\n').slice(0, 2), ['specmatic@latest', 'test']);
  } finally {
    await client.close();
    await rm(root, { recursive: true, force: true });
  }
});
