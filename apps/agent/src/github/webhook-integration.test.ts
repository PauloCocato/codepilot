import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWebhookHandler } from "./app.js";
import type { JobQueue, WebhookJob } from "./app.js";
import { Webhooks } from "@octokit/webhooks";

vi.mock("../utils/logger.js", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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

const WEBHOOK_SECRET = "test-webhook-secret";

const validPayload = JSON.stringify({
  action: "labeled",
  issue: {
    number: 42,
    title: "Test issue",
    body: "Test body",
    labels: [{ name: "codepilot" }],
  },
  label: { name: "codepilot" },
  repository: {
    id: 123456,
    name: "my-app",
    full_name: "testorg/my-app",
    owner: { login: "testorg" },
  },
  installation: { id: 12345 },
  sender: { login: "maintainer", id: 99999 },
});

async function signPayload(
  secret: string,
  payload: string,
): Promise<string> {
  const webhooks = new Webhooks({ secret });
  return await webhooks.sign(payload);
}

describe("webhook integration", () => {
  let queue: JobQueue & { jobs: WebhookJob[] };

  beforeEach(() => {
    queue = createMockQueue();
  });

  it("should process a valid signed payload", async () => {
    const webhooks = createWebhookHandler({
      webhookSecret: WEBHOOK_SECRET,
      queue,
    });

    const signature = await signPayload(WEBHOOK_SECRET, validPayload);

    await webhooks.verifyAndReceive({
      id: "delivery-1",
      name: "issues",
      signature,
      payload: validPayload,
    });

    expect(queue.add).toHaveBeenCalledWith("process-issue", {
      owner: "testorg",
      repo: "my-app",
      issueNumber: 42,
      trigger: "issue_labeled",
      installationId: 12345,
    });
  });

  it("should reject an invalid signature", async () => {
    const webhooks = createWebhookHandler({
      webhookSecret: WEBHOOK_SECRET,
      queue,
    });

    await expect(
      webhooks.verifyAndReceive({
        id: "delivery-2",
        name: "issues",
        signature: "sha256=invalid_signature_value",
        payload: validPayload,
      }),
    ).rejects.toThrow();

    expect(queue.add).not.toHaveBeenCalled();
  });

  it("should reject a payload signed with wrong secret", async () => {
    const webhooks = createWebhookHandler({
      webhookSecret: WEBHOOK_SECRET,
      queue,
    });

    const wrongSignature = await signPayload("wrong-secret", validPayload);

    await expect(
      webhooks.verifyAndReceive({
        id: "delivery-3",
        name: "issues",
        signature: wrongSignature,
        payload: validPayload,
      }),
    ).rejects.toThrow();

    expect(queue.add).not.toHaveBeenCalled();
  });

  it("should reject a tampered payload", async () => {
    const webhooks = createWebhookHandler({
      webhookSecret: WEBHOOK_SECRET,
      queue,
    });

    const signature = await signPayload(WEBHOOK_SECRET, validPayload);
    const tamperedPayload = validPayload.replace("42", "999");

    await expect(
      webhooks.verifyAndReceive({
        id: "delivery-4",
        name: "issues",
        signature,
        payload: tamperedPayload,
      }),
    ).rejects.toThrow();

    expect(queue.add).not.toHaveBeenCalled();
  });

  it("should handle empty signature gracefully", async () => {
    const webhooks = createWebhookHandler({
      webhookSecret: WEBHOOK_SECRET,
      queue,
    });

    await expect(
      webhooks.verifyAndReceive({
        id: "delivery-5",
        name: "issues",
        signature: "",
        payload: validPayload,
      }),
    ).rejects.toThrow();

    expect(queue.add).not.toHaveBeenCalled();
  });

  it("should process comment event with valid signature", async () => {
    const webhooks = createWebhookHandler({
      webhookSecret: WEBHOOK_SECRET,
      queue,
    });

    const commentPayload = JSON.stringify({
      action: "created",
      issue: { number: 10, title: "Fix bug" },
      comment: {
        body: "/codepilot please help",
        user: { login: "dev" },
      },
      repository: {
        id: 789,
        name: "backend",
        full_name: "org/backend",
        owner: { login: "org" },
      },
      installation: { id: 67890 },
      sender: { login: "dev", id: 111 },
    });

    const signature = await signPayload(WEBHOOK_SECRET, commentPayload);

    await webhooks.verifyAndReceive({
      id: "delivery-6",
      name: "issue_comment",
      signature,
      payload: commentPayload,
    });

    expect(queue.add).toHaveBeenCalledWith("process-issue", {
      owner: "org",
      repo: "backend",
      issueNumber: 10,
      trigger: "issue_comment",
      installationId: 67890,
    });
  });
});
