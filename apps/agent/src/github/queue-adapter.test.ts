import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEnqueueResolveIssue = vi.fn();

vi.mock("../queue/index.js", () => ({
  enqueueResolveIssue: (...args: unknown[]) =>
    mockEnqueueResolveIssue(...args),
}));

vi.mock("../utils/logger.js", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { WebhookQueueAdapter } from "./queue-adapter.js";
import type { WebhookJob } from "./app.js";

describe("WebhookQueueAdapter", () => {
  let adapter: WebhookQueueAdapter;

  const webhookJob: WebhookJob = {
    owner: "testorg",
    repo: "my-app",
    issueNumber: 42,
    trigger: "issue_labeled",
    installationId: 12345,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new WebhookQueueAdapter();
    mockEnqueueResolveIssue.mockResolvedValue({
      success: true,
      jobId: "issue-testorg-my-app-42",
    });
  });

  it("should transform WebhookJob to ResolveIssueJob correctly", async () => {
    await adapter.add("process-issue", webhookJob);

    expect(mockEnqueueResolveIssue).toHaveBeenCalledWith({
      issueUrl: "https://github.com/testorg/my-app/issues/42",
      repoOwner: "testorg",
      repoName: "my-app",
      issueNumber: 42,
      triggeredBy: "webhook",
      installationId: 12345,
    });
  });

  it("should pass installationId through to the queue", async () => {
    const jobWithDifferentInstallation: WebhookJob = {
      ...webhookJob,
      installationId: 99999,
    };

    await adapter.add("process-issue", jobWithDifferentInstallation);

    expect(mockEnqueueResolveIssue).toHaveBeenCalledWith(
      expect.objectContaining({ installationId: 99999 }),
    );
  });

  it("should construct correct issueUrl from owner, repo, and issueNumber", async () => {
    const customJob: WebhookJob = {
      owner: "acme-corp",
      repo: "backend-api",
      issueNumber: 123,
      trigger: "issue_comment",
      installationId: 55555,
    };

    await adapter.add("process-issue", customJob);

    expect(mockEnqueueResolveIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        issueUrl: "https://github.com/acme-corp/backend-api/issues/123",
      }),
    );
  });

  it("should always set triggeredBy to webhook", async () => {
    for (const trigger of [
      "issue_labeled",
      "issue_opened",
      "issue_comment",
    ] as const) {
      mockEnqueueResolveIssue.mockResolvedValue({
        success: true,
        jobId: "test",
      });

      await adapter.add("process-issue", { ...webhookJob, trigger });

      expect(mockEnqueueResolveIssue).toHaveBeenCalledWith(
        expect.objectContaining({ triggeredBy: "webhook" }),
      );
    }
  });

  it("should throw when enqueueResolveIssue fails", async () => {
    mockEnqueueResolveIssue.mockResolvedValue({
      success: false,
      error: "Validation failed",
    });

    await expect(adapter.add("process-issue", webhookJob)).rejects.toThrow(
      "Failed to enqueue job: Validation failed",
    );
  });

  it("should map all WebhookJob fields to ResolveIssueJob fields", async () => {
    await adapter.add("process-issue", webhookJob);

    const calledWith = mockEnqueueResolveIssue.mock.calls[0][0];
    expect(calledWith).toHaveProperty("issueUrl");
    expect(calledWith).toHaveProperty("repoOwner", "testorg");
    expect(calledWith).toHaveProperty("repoName", "my-app");
    expect(calledWith).toHaveProperty("issueNumber", 42);
    expect(calledWith).toHaveProperty("triggeredBy", "webhook");
    expect(calledWith).toHaveProperty("installationId", 12345);
  });
});
