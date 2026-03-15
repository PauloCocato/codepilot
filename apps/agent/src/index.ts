import Fastify from 'fastify';
import { logger } from './utils/logger.js';
import { runAgent } from './agent/index.js';
import type { AgentConfig, AgentRun } from './agent/index.js';

const app = Fastify({ logger: false });

/** In-flight runs by issue URL — prevents duplicate PRs for the same issue */
const activeRuns = new Map<string, Promise<AgentRun>>();

/** Completed run stats */
const stats = {
  totalRuns: 0,
  successfulRuns: 0,
  failedRuns: 0,
  totalCostUsd: 0,
};

app.get('/api/health', async () => ({
  status: 'ok',
  version: '0.1.0',
  uptime: process.uptime(),
}));

app.get('/api/stats', async () => ({
  ...stats,
  activeRuns: activeRuns.size,
}));

app.post<{ Body: { issueUrl: string } }>('/api/resolve', async (request, reply) => {
  const { issueUrl } = request.body ?? {};

  if (!issueUrl || typeof issueUrl !== 'string') {
    return reply.status(400).send({ error: 'issueUrl is required' });
  }

  // Idempotency: if already running for this issue, return the existing run
  const existing = activeRuns.get(issueUrl);
  if (existing) {
    logger.info({ issueUrl }, 'Run already in progress for this issue');
    return reply.status(409).send({ error: 'Run already in progress for this issue' });
  }

  // NOTE: In production, config would be built from environment + injected dependencies.
  // This placeholder ensures the route handler compiles. The actual config is built
  // by the BullMQ worker or by the caller providing dependencies.
  const config = undefined as unknown as AgentConfig;

  if (!config) {
    return reply.status(503).send({ error: 'Agent not configured. Use webhook or BullMQ worker instead.' });
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
});

app.post('/webhook', async (request, reply) => {
  // Webhook handling is done via createWebhookHandler in the github module.
  // This route is a placeholder for Fastify integration.
  logger.info('Webhook received');
  return reply.status(200).send({ received: true });
});

const PORT = Number(process.env['PORT'] ?? 3000);

async function start(): Promise<void> {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    logger.info({ port: PORT }, 'CodePilot agent started');
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

function gracefulShutdown(signal: string): void {
  logger.info({ signal }, 'Received shutdown signal');

  const timeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 30_000);

  app.close()
    .then(() => {
      clearTimeout(timeout);
      logger.info('Server closed gracefully');
      process.exit(0);
    })
    .catch((err) => {
      clearTimeout(timeout);
      logger.error(err, 'Error during graceful shutdown');
      process.exit(1);
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

start();

export { app };
