import type { Server } from 'node:http';
import { createApp } from './app';
import { connectDb, disconnectDb } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';

let server: Server | undefined;
let shuttingDown = false;

async function shutdown(signal: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down gracefully');
  const force = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
  force.unref();
  try {
    if (server) await new Promise<void>((resolve, reject) => server!.close((e) => (e ? reject(e) : resolve())));
    await disconnectDb();
    logger.info('Shutdown complete');
    process.exit(exitCode);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

async function main() {
  await connectDb();
  server = createApp().listen(env.PORT, () => logger.info(`API listening on http://localhost:${env.PORT}`));
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  void shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  void shutdown('uncaughtException', 1);
});

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start API');
  process.exit(1);
});
