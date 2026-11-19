import { spawn, SpawnOptionsWithoutStdio } from 'node:child_process';
import path from 'node:path';

/** The selected runtime owns license discovery, entitlements, and usage accounting. */
export function spawnSpecmatic(args: string[], options: SpawnOptionsWithoutStdio = {}) {
  const environment = options.env ?? process.env;
  const enterpriseJar = environment.SPECMATIC_ENTERPRISE_JAR;
  if (enterpriseJar !== undefined) {
    if (!enterpriseJar.trim()) throw new Error('SPECMATIC_ENTERPRISE_JAR must identify an Enterprise JAR.');
    const java = environment.JAVA_HOME ? path.join(environment.JAVA_HOME, 'bin', 'java') : 'java';
    return spawn(java, ['-jar', path.resolve(enterpriseJar), ...args], { ...options, stdio: ['pipe', 'pipe', 'pipe'] });
  }
  return spawn('npx', ['specmatic@latest', ...args], { ...options, stdio: ['pipe', 'pipe', 'pipe'] });
}
