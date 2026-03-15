import Dockerode from 'dockerode';
import { logger } from '../utils/logger.js';
import type { Sandbox } from './docker.js';

export interface ExecutionResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
}

export interface ExecutionOptions {
  readonly timeoutMs?: number;
  readonly workDir?: string;
  readonly env?: readonly string[];
}

export interface TestResult extends ExecutionResult {
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly testOutput: string;
}

export interface ApplyTestResult {
  readonly patchApplied: boolean;
  readonly installResult: ExecutionResult;
  readonly testResult: TestResult;
}

const DEFAULT_EXEC_TIMEOUT_MS = 60_000;

export class ExecutionError extends Error {
  constructor(
    message: string,
    public readonly code: 'exec_failed' | 'timeout' | 'container_not_running',
  ) {
    super(message);
    this.name = 'ExecutionError';
  }
}

/**
 * Execute a command inside a Docker sandbox container.
 *
 * SECURITY NOTE: Commands run in an isolated Docker container with:
 * - Network disabled by default
 * - All capabilities dropped
 * - no-new-privileges security option
 * - Memory limits enforced
 * - Non-root user
 * - PID limits
 *
 * Shell execution (`sh -c`) is intentional — the sandbox IS the security boundary.
 */
export async function execute(
  sandbox: Sandbox,
  command: string,
  options?: ExecutionOptions,
  docker?: Dockerode,
): Promise<ExecutionResult> {
  const dockerInstance = docker ?? new Dockerode();
  const container = dockerInstance.getContainer(sandbox.containerId);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;

  logger.debug(
    { sandboxId: sandbox.id, command, timeoutMs },
    'Executing command in sandbox',
  );

  const startTime = Date.now();

  const exec = await container.exec({
    Cmd: ['sh', '-c', command],
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: options?.workDir ?? '/workspace',
    Env: options?.env ? [...options.env] : undefined,
  });

  const stream = await exec.start({ hijack: true, stdin: false });

  let stdout = '';
  let stderr = '';
  let timedOut = false;

  const outputPromise = new Promise<void>((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    dockerInstance.modem.demuxStream(
      stream,
      {
        write(chunk: Buffer) {
          stdoutChunks.push(chunk);
        },
      },
      {
        write(chunk: Buffer) {
          stderrChunks.push(chunk);
        },
      },
    );

    stream.on('end', () => {
      stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      stderr = Buffer.concat(stderrChunks).toString('utf-8');
      resolve();
    });
  });

  const timeoutPromise = new Promise<'timeout'>((resolve) =>
    setTimeout(() => resolve('timeout'), timeoutMs),
  );

  const result = await Promise.race([outputPromise, timeoutPromise]);

  if (result === 'timeout') {
    timedOut = true;
    stream.destroy();

    logger.warn(
      { sandboxId: sandbox.id, command, timeoutMs },
      'Command execution timed out',
    );
  }

  const inspectResult = await exec.inspect();
  const durationMs = Date.now() - startTime;

  const executionResult: ExecutionResult = {
    exitCode: timedOut ? 124 : (inspectResult.ExitCode ?? 1),
    stdout,
    stderr,
    durationMs,
    timedOut,
  };

  logger.debug(
    { sandboxId: sandbox.id, exitCode: executionResult.exitCode, durationMs },
    'Command execution completed',
  );

  return executionResult;
}

export async function installDependencies(
  sandbox: Sandbox,
  docker?: Dockerode,
): Promise<ExecutionResult> {
  const installCmd = sandbox.runtimeConfig.installCmd;

  logger.info(
    { sandboxId: sandbox.id, installCmd, language: sandbox.runtimeConfig.language },
    'Installing dependencies in sandbox',
  );

  return execute(sandbox, installCmd, { timeoutMs: 120_000 }, docker);
}

export async function runTests(
  sandbox: Sandbox,
  docker?: Dockerode,
): Promise<TestResult> {
  const testCmd = sandbox.runtimeConfig.testCmd;

  logger.info(
    { sandboxId: sandbox.id, testCmd, language: sandbox.runtimeConfig.language },
    'Running tests in sandbox',
  );

  const result = await execute(sandbox, testCmd, { timeoutMs: 120_000 }, docker);

  const testOutput = `${result.stdout}\n${result.stderr}`;
  const { passed, failed, skipped } = parseTestOutput(testOutput, sandbox.runtimeConfig.language);

  return {
    ...result,
    passed,
    failed,
    skipped,
    testOutput,
  };
}

function parseTestOutput(
  output: string,
  language: string,
): { passed: number; failed: number; skipped: number } {
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  if (language === 'node') {
    const passMatch = output.match(/(\d+)\s+pass(?:ed|ing)?/i);
    const failMatch = output.match(/(\d+)\s+fail(?:ed|ing|ure)?/i);
    const skipMatch = output.match(/(\d+)\s+skip(?:ped)?/i);

    passed = passMatch ? parseInt(passMatch[1], 10) : 0;
    failed = failMatch ? parseInt(failMatch[1], 10) : 0;
    skipped = skipMatch ? parseInt(skipMatch[1], 10) : 0;
  } else if (language === 'python') {
    const pytestMatch = output.match(/(\d+)\s+passed/);
    const pytestFailMatch = output.match(/(\d+)\s+failed/);
    const pytestSkipMatch = output.match(/(\d+)\s+skipped/);

    passed = pytestMatch ? parseInt(pytestMatch[1], 10) : 0;
    failed = pytestFailMatch ? parseInt(pytestFailMatch[1], 10) : 0;
    skipped = pytestSkipMatch ? parseInt(pytestSkipMatch[1], 10) : 0;
  } else {
    const genericPassMatch = output.match(/(\d+)\s+pass/i);
    const genericFailMatch = output.match(/(\d+)\s+fail/i);

    passed = genericPassMatch ? parseInt(genericPassMatch[1], 10) : 0;
    failed = genericFailMatch ? parseInt(genericFailMatch[1], 10) : 0;
  }

  return { passed, failed, skipped };
}

export async function applyAndTest(
  sandbox: Sandbox,
  patch: string,
  docker?: Dockerode,
): Promise<ApplyTestResult> {
  logger.info({ sandboxId: sandbox.id }, 'Applying patch and running tests');

  // Write patch to a temp file inside the container, then apply it.
  // This avoids shell injection from patch content by using a heredoc with a unique delimiter.
  const delimiter = `CODEPILOT_PATCH_EOF_${Date.now()}`;
  const applyCmd = [
    `cat > /tmp/patch.diff << '${delimiter}'`,
    patch,
    delimiter,
    'git apply --check /tmp/patch.diff && git apply /tmp/patch.diff',
  ].join('\n');

  const applyResult = await execute(sandbox, applyCmd, undefined, docker);

  if (applyResult.exitCode !== 0) {
    logger.warn(
      { sandboxId: sandbox.id, stderr: applyResult.stderr },
      'Failed to apply patch',
    );

    return {
      patchApplied: false,
      installResult: {
        exitCode: -1,
        stdout: '',
        stderr: 'Patch not applied, skipping install',
        durationMs: 0,
        timedOut: false,
      },
      testResult: {
        exitCode: -1,
        stdout: '',
        stderr: 'Patch not applied, skipping tests',
        durationMs: 0,
        timedOut: false,
        passed: 0,
        failed: 0,
        skipped: 0,
        testOutput: '',
      },
    };
  }

  const installResult = await installDependencies(sandbox, docker);
  const testResult = await runTests(sandbox, docker);

  return {
    patchApplied: true,
    installResult,
    testResult,
  };
}
