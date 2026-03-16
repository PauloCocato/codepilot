import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface RuntimeConfig {
  readonly language: 'node' | 'python' | 'go' | 'rust' | 'generic';
  readonly dockerfile: string;
  readonly installCmd: string;
  readonly testCmd: string;
  readonly buildCmd?: string;
}

const RUNTIME_CONFIGS: ReadonlyMap<string, RuntimeConfig> = new Map([
  [
    'package.json',
    {
      language: 'node',
      dockerfile: 'Dockerfile.node',
      installCmd: 'npm install',
      testCmd: 'npm test',
      buildCmd: 'npm run build',
    },
  ],
  [
    'requirements.txt',
    {
      language: 'python',
      dockerfile: 'Dockerfile.python',
      installCmd: 'pip install --user -r requirements.txt',
      testCmd: 'python -m pytest',
    },
  ],
  [
    'go.mod',
    {
      language: 'go',
      dockerfile: 'Dockerfile.generic',
      installCmd: 'go mod download',
      testCmd: 'go test ./...',
      buildCmd: 'go build ./...',
    },
  ],
  [
    'Cargo.toml',
    {
      language: 'rust',
      dockerfile: 'Dockerfile.generic',
      installCmd: 'cargo fetch',
      testCmd: 'cargo test',
      buildCmd: 'cargo build',
    },
  ],
]);

const GENERIC_CONFIG: RuntimeConfig = {
  language: 'generic',
  dockerfile: 'Dockerfile.generic',
  installCmd: 'echo "no dependencies to install"',
  testCmd: 'echo "no tests configured"',
};

export function detectRuntime(repoPath: string): RuntimeConfig {
  for (const [marker, config] of RUNTIME_CONFIGS) {
    if (existsSync(join(repoPath, marker))) {
      return config;
    }
  }

  return GENERIC_CONFIG;
}
