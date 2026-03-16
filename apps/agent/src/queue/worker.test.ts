import { describe, it, expect, vi, beforeEach } from "vitest";

let capturedProcessor: ((job: unknown) => Promise<unknown>) | undefined;

vi.mock("bullmq", () => ({
  Worker: vi
    .fn()
    .mockImplementation(
      (_name: string, processor: (job: unknown) => Promise<unknown>) => {
        capturedProcessor = processor;
        return {
          on: vi.fn(),
          close: vi.fn().mockResolvedValue(undefined),
        };
      },
    ),
}));

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue("OK"),
  })),
}));

import { createWorker, closeWorker } from "./worker.js";

describe("Queue Worker", () => {
  const mockProcessFn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = undefined;
  });

  it("should create a worker", () => {
    const worker = createWorker(mockProcessFn);
    expect(worker).toBeDefined();
    expect(worker.on).toHaveBeenCalledWith("completed", expect.any(Function));
    expect(worker.on).toHaveBeenCalledWith("failed", expect.any(Function));
    expect(worker.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("should process valid jobs", async () => {
    createWorker(mockProcessFn);

    const mockResult = {
      success: true,
      attempts: 1,
      totalCostUsd: 0.05,
      totalLatencyMs: 5000,
    };
    mockProcessFn.mockResolvedValue(mockResult);

    const mockJob = {
      id: "test-job-1",
      data: {
        issueUrl: "https://github.com/owner/repo/issues/1",
        repoOwner: "owner",
        repoName: "repo",
        issueNumber: 1,
        triggeredBy: "webhook",
        installationId: 12345,
      },
      updateProgress: vi.fn(),
      progress: 0,
    };

    expect(capturedProcessor).toBeDefined();
    const result = await capturedProcessor!(mockJob);
    expect(result).toEqual(mockResult);
    expect(mockProcessFn).toHaveBeenCalledWith(
      "https://github.com/owner/repo/issues/1",
      12345,
    );
  });

  it("should reject invalid job data", async () => {
    createWorker(mockProcessFn);

    const mockJob = {
      id: "bad-job",
      data: { invalid: true },
      updateProgress: vi.fn(),
    };

    expect(capturedProcessor).toBeDefined();
    await expect(capturedProcessor!(mockJob)).rejects.toThrow(
      "Invalid job data",
    );
  });

  it("should close worker gracefully", async () => {
    const worker = createWorker(mockProcessFn);
    await closeWorker(worker);
    expect(worker.close).toHaveBeenCalled();
  });
});
