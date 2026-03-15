import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectRuntime } from './detector.js';
import { existsSync } from 'node:fs';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);

describe('detectRuntime', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
  });

  it('should detect Node.js when package.json exists', () => {
    mockExistsSync.mockImplementation((path) =>
      String(path).endsWith('package.json'),
    );

    const result = detectRuntime('/repo');

    expect(result.language).toBe('node');
    expect(result.dockerfile).toBe('Dockerfile.node');
    expect(result.installCmd).toBe('npm install');
    expect(result.testCmd).toBe('npm test');
  });

  it('should detect Python when requirements.txt exists', () => {
    mockExistsSync.mockImplementation((path) =>
      String(path).endsWith('requirements.txt'),
    );

    const result = detectRuntime('/repo');

    expect(result.language).toBe('python');
    expect(result.dockerfile).toBe('Dockerfile.python');
    expect(result.installCmd).toContain('pip install');
    expect(result.testCmd).toContain('pytest');
  });

  it('should detect Go when go.mod exists', () => {
    mockExistsSync.mockImplementation((path) =>
      String(path).endsWith('go.mod'),
    );

    const result = detectRuntime('/repo');

    expect(result.language).toBe('go');
    expect(result.installCmd).toBe('go mod download');
    expect(result.testCmd).toBe('go test ./...');
  });

  it('should detect Rust when Cargo.toml exists', () => {
    mockExistsSync.mockImplementation((path) =>
      String(path).endsWith('Cargo.toml'),
    );

    const result = detectRuntime('/repo');

    expect(result.language).toBe('rust');
    expect(result.installCmd).toBe('cargo fetch');
    expect(result.testCmd).toBe('cargo test');
  });

  it('should return generic config when no markers found', () => {
    mockExistsSync.mockReturnValue(false);

    const result = detectRuntime('/unknown-repo');

    expect(result.language).toBe('generic');
    expect(result.dockerfile).toBe('Dockerfile.generic');
  });

  it('should prioritize package.json over other markers', () => {
    mockExistsSync.mockReturnValue(true);

    const result = detectRuntime('/repo');

    expect(result.language).toBe('node');
  });
});
