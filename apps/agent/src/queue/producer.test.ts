import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAdd = vi.fn();
const mockGetJob = vi.fn();

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockAdd,
    getJob: mockGetJob,
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue("OK"),
  })),
}));

import { enqueueResolveIssue } from "./producer.js";
import type { ResolveIssueJob } from "./jobs.js";

describe("Queue Producer", () => {
  const validJob: ResolveIssueJob = {
    issueUrl: "https://github.com/owner/repo/issues/1",
    repoOwner: "owner",
    repoName: "repo",
    issueNumber: 1,
    triggeredBy: "webhook",
    installationId: 12345,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetJob.mockResolvedValue(null);
    mockAdd.mockResolvedValue({ id: "issue-owner-repo-1" });
  });

  it("should enqueue a valid job", async () => {
    const result = await enqueueResolveIssue(validJob);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.jobId).toBe("issue-owner-repo-1");
    }
  });

  it("should reject invalid job data", async () => {
    const result = await enqueueResolveIssue({
      ...validJob,
      issueUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("should deduplicate active jobs", async () => {
    mockGetJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue("active"),
    });

    const result = await enqueueResolveIssue(validJob);
    expect(result.success).toBe(true);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("should deduplicate waiting jobs", async () => {
    mockGetJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue("waiting"),
    });

    const result = await enqueueResolveIssue(validJob);
    expect(result.success).toBe(true);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("should re-enqueue completed jobs", async () => {
    mockGetJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue("completed"),
    });

    const result = await enqueueResolveIssue(validJob);
    expect(result.success).toBe(true);
    expect(mockAdd).toHaveBeenCalled();
  });
});
