import app from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma, verifyDatabaseConnection } from './lib/prisma';

async function start() {
  try {
    await verifyDatabaseConnection();
    logger.info({ database: 'connected' }, 'Database connection successful');
  } catch (err) {
    logger.error({ err }, 'Database connection failed');
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        health: `http://localhost:${env.PORT}/healthz`,
        api: `http://localhost:${env.PORT}/api/v1`,
      },
      'Backend server started',
    );
  });

  function shutdown(signal: string) {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
