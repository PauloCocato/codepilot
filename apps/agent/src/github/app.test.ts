import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createWebhookHandler,
  resetActiveJobs,
  incrementActiveJobs,
  getActiveJobs,
} from "./app.js";
import type { JobQueue, WebhookJob } from "./app.js";
import labeledPayload from "../../tests/fixtures/github-webhook-labeled.json" with { type: "json" };
import commentPayload from "../../tests/fixtures/github-webhook-comment.json" with { type: "json" };

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

function createMockQueue(): JobQueue & { jobs: WebhookJob[] } {
  const jobs: WebhookJob[] = [];
  return {
    jobs,
    add: vi.fn(async (_name: string, data: WebhookJob) => {
      jobs.push(data);
    }),
  };
}

describe("app (webhook handler)", () => {
  beforeEach(() => {
    resetActiveJobs();
  });

  describe("issues.labeled event", () => {
    it("should queue a job when codepilot label is added", async () => {
      const queue = createMockQueue();
      const webhooks = createWebhookHandler({
        webhookSecret: "test-secret",
        queue,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (webhooks as any).receive({
        id: "test-1",
        name: "issues",
        payload: labeledPayload,
      });

      expect(queue.add).toHaveBeenCalledWith("process-issue", {
        owner: "testorg",
        repo: "my-app",
        issueNumber: 42,
        trigger: "issue_labeled",
        installationId: 12345,
      });
    });

    it("should not queue when a different label is added", async () => {
      const queue = createMockQueue();
      const webhooks = createWebhookHandler({
        webhookSecret: "test-secret",
        queue,
      });

      const otherLabelPayload = {
        ...labeledPayload,
        label: { id: 99, name: "priority: low" },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (webhooks as any).receive({
        id: "test-2",
        name: "issues",
        payload: otherLabelPayload,
      });

      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe("issue_comment.created event", () => {
    it("should queue a job when comment contains /codepilot", async () => {
      const queue = createMockQueue();
      const webhooks = createWebhookHandler({
        webhookSecret: "test-secret",
        queue,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (webhooks as any).receive({
        id: "test-3",
        name: "issue_comment",
        payload: commentPayload,
      });

      expect(queue.add).toHaveBeenCalledWith("process-issue", {
        owner: "testorg",
        repo: "my-app",
        issueNumber: 42,
        trigger: "issue_comment",
        installationId: 12345,
      });
    });

    it("should not queue when comment does not contain trigger", async () => {
      const queue = createMockQueue();
      const webhooks = createWebhookHandler({
        webhookSecret: "test-secret",
        queue,
      });

      const normalComment = {
        ...commentPayload,
        comment: {
          ...commentPayload.comment,
          body: "Just a regular comment",
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (webhooks as any).receive({
        id: "test-4",
        name: "issue_comment",
        payload: normalComment,
      });

      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe("rate limiting", () => {
    it("should not queue when max concurrent jobs reached", async () => {
      const queue = createMockQueue();
      const webhooks = createWebhookHandler({
        webhookSecret: "test-secret",
        queue,
        maxConcurrentPerRepo: 2,
      });

      incrementActiveJobs("testorg/my-app");
      incrementActiveJobs("testorg/my-app");

      expect(getActiveJobs("testorg/my-app")).toBe(2);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (webhooks as any).receive({
        id: "test-5",
        name: "issues",
        payload: labeledPayload,
      });

      expect(queue.add).not.toHaveBeenCalled();
    });

    it("should allow jobs for different repos", async () => {
      const queue = createMockQueue();
      const webhooks = createWebhookHandler({
        webhookSecret: "test-secret",
        queue,
        maxConcurrentPerRepo: 1,
      });

      incrementActiveJobs("otherorg/other-repo");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (webhooks as any).receive({
        id: "test-6",
        name: "issues",
        payload: labeledPayload,
      });

      expect(queue.add).toHaveBeenCalled();
    });
  });
});
