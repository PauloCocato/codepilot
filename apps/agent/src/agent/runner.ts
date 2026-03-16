import type { SandboxManager, Sandbox } from '../sandbox/index.js';
import { applyAndTest } from '../sandbox/index.js';
import type { RunResult } from './types.js';
import { logger } from '../utils/logger.js';

/** Run a patch through sandbox: apply, install deps, run tests */
export async function runInSandbox(
  repoPath: string,
  patch: string,
  sandboxManager: SandboxManager,
): Promise<RunResult> {
  const log = logger.child({ module: 'runner', repoPath });

  let sandbox: Sandbox | undefined;

  try {
    log.info('Creating sandbox for test run');

    sandbox = await sandboxManager.createSandbox({ repoPath });
    log.info({ sandboxId: sandbox.id }, 'Sandbox created');

    const result = await applyAndTest(sandbox, patch);

    if (!result.patchApplied) {
      log.warn('Patch failed to apply in sandbox');
      return {
        patchApplied: false,
        testsRan: false,
        testsPassed: false,
        output: result.testResult.stderr || 'Patch failed to apply',
        error: 'Patch could not be applied to the codebase',
      };
    }

    const testsRan = result.testResult.exitCode !== -1;
    const testsPassed = result.testResult.exitCode === 0 && result.testResult.failed === 0;
    const output = result.testResult.testOutput || result.testResult.stdout;

    log.info(
      {
        testsRan,
        testsPassed,
        passed: result.testResult.passed,
        failed: result.testResult.failed,
        skipped: result.testResult.skipped,
      },
      'Sandbox test run completed',
    );

    return {
      patchApplied: true,
      testsRan,
      testsPassed,
      output,
      error: testsPassed ? undefined : `Tests failed: ${result.testResult.failed} failures. ${result.testResult.stderr}`.trim(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({ error: message }, 'Sandbox execution failed');

    return {
      patchApplied: false,
      testsRan: false,
      testsPassed: false,
      output: '',
      error: `Sandbox error: ${message}`,
    };
  } finally {
    if (sandbox) {
      try {
        await sandboxManager.destroySandbox(sandbox);
        log.info({ sandboxId: sandbox.id }, 'Sandbox cleaned up');
      } catch (cleanupError) {
        log.warn({ error: cleanupError }, 'Failed to cleanup sandbox');
      }
    }
  }
}
