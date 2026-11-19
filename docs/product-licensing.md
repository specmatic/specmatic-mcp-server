# Product licensing

By default the wrapper continues to use the OSS npm runtime. Set `SPECMATIC_ENTERPRISE_JAR` to select the licensed Enterprise runtime; `JAVA_HOME` optionally selects Java. When selected, runtime failures are returned as MCP errors and never fall back to OSS. The runtime owns Core entitlement and usage policy. Empty JAR configuration fails explicitly. Relative JAR paths are resolved from the wrapper startup directory before commands change working directories.

License denials are operational failures rather than breaking API changes. Cleanup and server listing remain available.

Validation: `npm run test:license` uses public MCP calls with fixture runtimes, and `npm run test:smoke` exercises the existing OSS workflow. Use the stable Node version as required by AGENTS.md.
