import Fastify from "fastify";
import { logger } from "./utils/logger.js";
import { runAgent } from "./agent/index.js";
import type { AgentConfig, AgentRun } from "./agent/index.js";
import {
  enqueueResolveIssue,
  getQueueStats,
  getJobStatus,
  getRecentJobs,
  closeQueue,
  closeSharedConnection,
  type ResolveIssueJob,
} from "./queue/index.js";
import { createWebhookHandler } from "./github/app.js";
import { registry } from "./metrics/index.js";
import { WebhookQueueAdapter } from "./github/queue-adapter.js";
import { listRepos, getRepo } from "./github/repo-registry.js";
import { getRepoStats } from "./github/rate-limiter.js";

const app = Fastify({
  logger: false,
  bodyLimit: 1_048_576, // 1 MB for webhook payloads
});

/** In-flight runs by issue URL — prevents duplicate PRs for the same issue */
const activeRuns = new Map<string, Promise<AgentRun>>();

/** Completed run stats */
const stats = {
  totalRuns: 0,
  successfulRuns: 0,
  failedRuns: 0,
  totalCostUsd: 0,
};

app.get("/api/health", async () => ({
  status: "ok",
  version: "0.1.0",
  uptime: process.uptime(),
}));

app.get("/metrics", async (_request, reply) => {
  reply.header("Content-Type", registry.contentType);
  return registry.metrics();
});

app.get("/api/stats", async () => ({
  ...stats,
  activeRuns: activeRuns.size,
}));

app.post<{ Body: { issueUrl: string } }>(
  "/api/resolve",
  async (request, reply) => {
    const { issueUrl } = request.body ?? {};

    if (!issueUrl || typeof issueUrl !== "string") {
      return reply.status(400).send({ error: "issueUrl is required" });
    }

    // Idempotency: if already running for this issue, return the existing run
    const existing = activeRuns.get(issueUrl);
    if (existing) {
      logger.info({ issueUrl }, "Run already in progress for this issue");
      return reply
        .status(409)
        .send({ error: "Run already in progress for this issue" });
    }

    // NOTE: In production, config would be built from environment + injected dependencies.
    // This placeholder ensures the route handler compiles. The actual config is built
    // by the BullMQ worker or by the caller providing dependencies.
    const config = undefined as unknown as AgentConfig;

    if (!config) {
      return reply.status(503).send({
        error: "Agent not configured. Use webhook or BullMQ worker instead.",
      });
    }

    const runPromise = runAgent(issueUrl, config);
    activeRuns.set(issueUrl, runPromise);

    try {
      const result = await runPromise;

      stats.totalRuns++;
      if (result.result.success) {
        stats.successfulRuns++;
      } else {
        stats.failedRuns++;
      }
      stats.totalCostUsd += result.result.totalCostUsd;

      return result;
    } finally {
      activeRuns.delete(issueUrl);
    }
  },
);

// --- Webhook route ---

const WEBHOOK_SECRET = process.env["GITHUB_WEBHOOK_SECRET"] ?? "";

/** Capture raw body for webhook signature verification */
app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (_request, body, done) => {
    done(null, body);
  },
);

const webhookQueue = new WebhookQueueAdapter();
const webhooks = WEBHOOK_SECRET
  ? createWebhookHandler({ webhookSecret: WEBHOOK_SECRET, queue: webhookQueue })
  : null;

app.post("/webhook", async (request, reply) => {
  if (!webhooks) {
    logger.warn("Webhook received but GITHUB_WEBHOOK_SECRET is not configured");
    return reply.status(503).send({ error: "Webhook secret not configured" });
  }

  const id = request.headers["x-github-delivery"] as string | undefined;
  const name = request.headers["x-github-event"] as string | undefined;
  const signature = request.headers["x-hub-signature-256"] as
    | string
    | undefined;
  const payload = request.body as string;

  if (!id || !name || !signature) {
    logger.warn(
      { hasId: !!id, hasName: !!name, hasSignature: !!signature },
      "Missing required webhook headers",
    );
    return reply.status(400).send({ error: "Missing required headers" });
  }

  try {
    await webhooks.verifyAndReceive({ id, name, signature, payload });
    return reply.status(200).send({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, "Webhook verification or processing failed");
    return reply
      .status(401)
      .send({ error: "Webhook signature verification failed" });
  }
});

// --- Queue API routes ---

app.post<{ Body: ResolveIssueJob }>(
  "/api/queue/enqueue",
  async (request, reply) => {
    const result = await enqueueResolveIssue(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }
    return reply.status(202).send({ jobId: result.jobId });
  },
);

app.get("/api/queue/stats", async () => {
  return getQueueStats();
});

app.get<{ Params: { id: string } }>(
  "/api/queue/jobs/:id",
  async (request, reply) => {
    const result = await getJobStatus(request.params.id);
    if (!result.success) {
      return reply.status(404).send({ error: result.error });
    }
    return result.job;
  },
);

app.get<{ Querystring: { limit?: string } }>(
  "/api/queue/jobs",
  async (request) => {
    const limit = Number(request.query.limit ?? 20);
    return getRecentJobs(limit);
  },
);

// --- Repo management routes ---

app.get("/api/repos", async () => {
  const repos = listRepos();
  return repos.map((r) => ({
    owner: r.owner,
    repo: r.repo,
    installationId: r.installationId,
    config: r.config,
    lastIndexedAt: r.lastIndexedAt ?? null,
    stats: getRepoStats(r.owner, r.repo),
  }));
});

app.get<{ Params: { owner: string; repo: string } }>(
  "/api/repos/:owner/:repo",
  async (request, reply) => {
    const { owner, repo } = request.params;
    const info = getRepo(owner, repo);

    if (!info) {
      return reply
        .status(404)
        .send({ error: `Repo ${owner}/${repo} not found` });
    }

    return {
      owner: info.owner,
      repo: info.repo,
      installationId: info.installationId,
      config: info.config,
      lastIndexedAt: info.lastIndexedAt ?? null,
      stats: getRepoStats(owner, repo),
    };
  },
);

const PORT = Number(process.env["PORT"] ?? 3000);

async function start(): Promise<void> {
  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
    logger.info({ port: PORT }, "CodePilot agent started");
  } catch (err) {
    logger.error(err, "Failed to start server");
    process.exit(1);
  }
}

function gracefulShutdown(signal: string): void {
  logger.info({ signal }, "Received shutdown signal");

  const timeout = setTimeout(() => {
    logger.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 30_000);

  app
    .close()
    .then(() => closeQueue())
    .then(() => closeSharedConnection())
    .then(() => {
      clearTimeout(timeout);
      logger.info("Server closed gracefully");
      process.exit(0);
    })
    .catch((err) => {
      clearTimeout(timeout);
      logger.error(err, "Error during graceful shutdown");
      process.exit(1);
    });
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

start();

export { app };
