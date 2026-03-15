import Fastify from 'fastify';
import { logger } from './utils/logger.js';

const app = Fastify({ logger: false });

app.get('/api/health', async () => ({
  status: 'ok',
  version: '0.1.0',
  uptime: process.uptime(),
}));

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

start();

export { app };
