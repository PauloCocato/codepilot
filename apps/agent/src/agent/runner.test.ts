import { describe, it, expect, vi } from 'vitest';
import { runInSandbox } from './runner.js';
import type { SandboxManager, Sandbox, ApplyTestResult } from '../sandbox/index.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock('../sandbox/index.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../sandbox/index.js')>();
  return {
    ...original,
    applyAndTest: vi.fn(),
  };
});

import { applyAndTest } from '../sandbox/index.js';

const mockApplyAndTest = vi.mocked(applyAndTest);

function createMockSandbox(): Sandbox {
  return {
    id: 'sandbox-1',
    containerId: 'container-1',
    status: 'running',
    createdAt: new Date(),
    repoPath: '/tmp/repo',
    runtimeConfig: {
      language: 'node',
      dockerfile: 'Dockerfile.node',
      installCmd: 'npm install',
      testCmd: 'npm test',
      buildCmd: 'npm run build',
    },
  };
}

function createMockSandboxManager(sandbox?: Sandbox): SandboxManager {
  const sb = sandbox ?? createMockSandbox();
  return {
    createSandbox: vi.fn(async () => sb),
    destroySandbox: vi.fn(async () => undefined),
    listActiveSandboxes: vi.fn(() => []),
    cleanupStale: vi.fn(async () => 0),
  } as unknown as SandboxManager;
}

describe('runner', () => {
  describe('runInSandbox', () => {
    it('should return success when patch applies and tests pass', async () => {
      const manager = createMockSandboxManager();
      const applyResult: ApplyTestResult = {
        patchApplied: true,
        installResult: { exitCode: 0, stdout: '', stderr: '', durationMs: 100, timedOut: false },
        testResult: {
          exitCode: 0, stdout: '10 passing', stderr: '', durationMs: 500,
          timedOut: false, passed: 10, failed: 0, skipped: 0, testOutput: '10 passing',
        },
      };
      mockApplyAndTest.mockResolvedValueOnce(applyResult);

      const result = await runInSandbox('/tmp/repo', 'some patch', manager);

      expect(result.patchApplied).toBe(true);
      expect(result.testsRan).toBe(true);
      expect(result.testsPassed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return failure when patch does not apply', async () => {
      const manager = createMockSandboxManager();
      const applyResult: ApplyTestResult = {
        patchApplied: false,
        installResult: { exitCode: -1, stdout: '', stderr: 'Patch not applied', durationMs: 0, timedOut: false },
        testResult: {
          exitCode: -1, stdout: '', stderr: 'Patch not applied', durationMs: 0,
          timedOut: false, passed: 0, failed: 0, skipped: 0, testOutput: '',
        },
      };
      mockApplyAndTest.mockResolvedValueOnce(applyResult);

      const result = await runInSandbox('/tmp/repo', 'bad patch', manager);

      expect(result.patchApplied).toBe(false);
      expect(result.testsPassed).toBe(false);
      expect(result.error).toContain('Patch could not be applied');
    });

    it('should return failure when tests fail', async () => {
      const manager = createMockSandboxManager();
      const applyResult: ApplyTestResult = {
        patchApplied: true,
        installResult: { exitCode: 0, stdout: '', stderr: '', durationMs: 100, timedOut: false },
        testResult: {
          exitCode: 1, stdout: '8 passing, 2 failing', stderr: 'assertion error', durationMs: 500,
          timedOut: false, passed: 8, failed: 2, skipped: 0, testOutput: '8 passing, 2 failing',
        },
      };
      mockApplyAndTest.mockResolvedValueOnce(applyResult);

      const result = await runInSandbox('/tmp/repo', 'some patch', manager);

      expect(result.patchApplied).toBe(true);
      expect(result.testsPassed).toBe(false);
      expect(result.error).toContain('Tests failed');
    });

    it('should handle sandbox creation failure gracefully', async () => {
      const manager = {
        createSandbox: vi.fn(async () => { throw new Error('Docker not available'); }),
        destroySandbox: vi.fn(async () => undefined),
        listActiveSandboxes: vi.fn(() => []),
        cleanupStale: vi.fn(async () => 0),
      } as unknown as SandboxManager;

      const result = await runInSandbox('/tmp/repo', 'patch', manager);

      expect(result.patchApplied).toBe(false);
      expect(result.error).toContain('Docker not available');
    });

    it('should always cleanup sandbox even on error', async () => {
      const sandbox = createMockSandbox();
      const manager = createMockSandboxManager(sandbox);
      mockApplyAndTest.mockRejectedValueOnce(new Error('unexpected'));

      await runInSandbox('/tmp/repo', 'patch', manager);

      expect(manager.destroySandbox).toHaveBeenCalledWith(sandbox);
    });
  });
});
