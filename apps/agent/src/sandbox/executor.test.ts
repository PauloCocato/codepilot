import { describe, it, expect, vi } from "vitest";
import {
  execute,
  installDependencies,
  runTests,
  applyAndTest,
} from "./executor.js";
import type { Sandbox } from "./docker.js";

vi.mock("../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

function createMockSandbox(overrides?: Partial<Sandbox>): Sandbox {
  return {
    id: "sandbox-123",
    containerId: "container-abc",
    status: "running",
    createdAt: new Date(),
    repoPath: "/tmp/test-repo",
    runtimeConfig: {
      language: "node",
      dockerfile: "Dockerfile.node",
      installCmd: "npm install",
      testCmd: "npm test",
      buildCmd: "npm run build",
    },
    ...overrides,
  };
}

interface MockStreamOptions {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number;
  readonly hang?: boolean;
}

function createMockDocker(options: MockStreamOptions = {}) {
  const { stdout = "", stderr = "", exitCode = 0, hang = false } = options;

  const mockStream = {
    on: vi.fn((event: string, callback: () => void) => {
      if (event === "end" && !hang) {
        setTimeout(callback, 5);
      }
    }),
    destroy: vi.fn(),
  };

  const mockExec = {
    start: vi.fn().mockResolvedValue(mockStream),
    inspect: vi.fn().mockResolvedValue({ ExitCode: exitCode }),
  };

  const mockContainer = {
    exec: vi.fn().mockResolvedValue(mockExec),
  };

  const mockDocker = {
    getContainer: vi.fn().mockReturnValue(mockContainer),
    modem: {
      demuxStream: vi.fn(
        (
          _stream: unknown,
          stdoutWriter: { write: (chunk: Buffer) => void },
          stderrWriter: { write: (chunk: Buffer) => void },
        ) => {
          if (stdout) stdoutWriter.write(Buffer.from(stdout));
          if (stderr) stderrWriter.write(Buffer.from(stderr));
        },
      ),
    },
  };

  return { mockDocker, mockContainer, mockExec, mockStream };
}

describe("execute", () => {
  it("should execute a command and return the result", async () => {
    const sandbox = createMockSandbox();
    const { mockDocker } = createMockDocker({
      stdout: "hello world",
      exitCode: 0,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await execute(
      sandbox,
      "echo hello",
      undefined,
      mockDocker as any,
    );

    expect(result.stdout).toBe("hello world");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should return non-zero exit code on failure", async () => {
    const sandbox = createMockSandbox();
    const { mockDocker } = createMockDocker({
      stderr: "command not found",
      exitCode: 127,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await execute(
      sandbox,
      "nonexistent",
      undefined,
      mockDocker as any,
    );

    expect(result.exitCode).toBe(127);
    expect(result.stderr).toBe("command not found");
  });

  it("should set timedOut and exit code 124 on timeout", async () => {
    const sandbox = createMockSandbox();
    const { mockDocker, mockStream } = createMockDocker({
      hang: true,
      exitCode: 0,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await execute(
      sandbox,
      "sleep 1000",
      { timeoutMs: 10 },
      mockDocker as any,
    );

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(124);
    expect(mockStream.destroy).toHaveBeenCalled();
  });

  it("should use custom workDir when provided", async () => {
    const sandbox = createMockSandbox();
    const { mockDocker, mockContainer } = createMockDocker();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await execute(sandbox, "ls", { workDir: "/custom" }, mockDocker as any);

    expect(mockContainer.exec).toHaveBeenCalledWith(
      expect.objectContaining({ WorkingDir: "/custom" }),
    );
  });

  it("should pass environment variables to exec", async () => {
    const sandbox = createMockSandbox();
    const { mockDocker, mockContainer } = createMockDocker();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await execute(sandbox, "env", { env: ["FOO=bar"] }, mockDocker as any);

    expect(mockContainer.exec).toHaveBeenCalledWith(
      expect.objectContaining({ Env: ["FOO=bar"] }),
    );
  });
});

describe("installDependencies", () => {
  it("should run the install command from runtime config", async () => {
    const sandbox = createMockSandbox();
    const { mockDocker, mockContainer } = createMockDocker({ exitCode: 0 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await installDependencies(sandbox, mockDocker as any);

    expect(mockContainer.exec).toHaveBeenCalledWith(
      expect.objectContaining({
        Cmd: ["sh", "-c", "npm install"],
      }),
    );
  });
});

describe("runTests", () => {
  it("should parse Node test output correctly", async () => {
    const sandbox = createMockSandbox();
    const { mockDocker } = createMockDocker({
      stdout: "5 passing\n2 failing\n1 skipped",
      exitCode: 1,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await runTests(sandbox, mockDocker as any);

    expect(result.passed).toBe(5);
    expect(result.failed).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.testOutput).toContain("5 passing");
  });

  it("should parse Python test output correctly", async () => {
    const sandbox = createMockSandbox({
      runtimeConfig: {
        language: "python",
        dockerfile: "Dockerfile.python",
        installCmd: "pip install -r requirements.txt",
        testCmd: "python -m pytest",
      },
    });
    const { mockDocker } = createMockDocker({
      stdout: "10 passed, 3 failed, 2 skipped",
      exitCode: 1,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await runTests(sandbox, mockDocker as any);

    expect(result.passed).toBe(10);
    expect(result.failed).toBe(3);
    expect(result.skipped).toBe(2);
  });

  it("should return zero counts when output has no test info", async () => {
    const sandbox = createMockSandbox();
    const { mockDocker } = createMockDocker({
      stdout: "some random output",
      exitCode: 0,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await runTests(sandbox, mockDocker as any);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
  });
});

describe("applyAndTest", () => {
  it("should return patchApplied false when patch fails", async () => {
    const sandbox = createMockSandbox();
    const { mockDocker } = createMockDocker({
      stderr: "error: patch failed",
      exitCode: 1,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await applyAndTest(sandbox, "bad patch", mockDocker as any);

    expect(result.patchApplied).toBe(false);
    expect(result.testResult.exitCode).toBe(-1);
  });

  it("should install deps and run tests when patch succeeds", async () => {
    const sandbox = createMockSandbox();
    const { mockDocker, mockContainer } = createMockDocker({ exitCode: 0 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await applyAndTest(
      sandbox,
      "valid patch",
      mockDocker as any,
    );

    expect(result.patchApplied).toBe(true);
    // Should have been called 3 times: apply, install, test
    expect(mockContainer.exec).toHaveBeenCalledTimes(3);
  });
});
