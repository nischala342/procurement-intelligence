import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'pi-api' },
  redact: ['req.headers.authorization', 'req.headers["x-api-key"]'],
  ...(env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }
    : {}),
});
