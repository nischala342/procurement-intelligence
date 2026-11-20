import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Root .env is shared by API, seeders and Vite. Real env vars take precedence.
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MONGO_URI: z
    .string()
    .min(1)
    .default('mongodb://localhost:27017/procurement_intelligence?directConnection=true'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(100).default(10),
  JWT_SECRET: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v : undefined)),
  // Session cookie `Secure` flag. Default: on in production. Set false only when serving over plain HTTP (e.g. a local
  // Docker stack on http://localhost); keep true behind HTTPS.
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  JWT_EXPIRES_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(50),
  // Optional LLM narration of advisory insights. Without a key, grounded templates are used (no external calls).
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined)),
  ADVISORY_MODEL: z.string().default('claude-haiku-5-5'),
  ADVISORY_LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(20_000),
  ADVISORY_LLM_MAX_PER_RUN: z.coerce.number().int().min(0).max(100).default(15),
  API_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v : undefined)),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Logger is not available yet (it depends on env); fail fast with a readable message.
  console.error('Invalid environment configuration:', JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

const isProd = parsed.data.NODE_ENV === 'production';
if (parsed.data.JWT_SECRET && parsed.data.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters.');
  process.exit(1);
}
if (isProd && !parsed.data.JWT_SECRET) {
  console.error('JWT_SECRET (>= 32 chars) is required when NODE_ENV=production.');
  process.exit(1);
}
if (!parsed.data.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET not set: using an insecure development secret. Set JWT_SECRET in .env.');
}

export const env = {
  ...parsed.data,
  jwtSecret: parsed.data.JWT_SECRET ?? 'dev-only-insecure-jwt-secret-do-not-use-in-production',
  corsOrigins: parsed.data.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
  isProd,
  cookieSecure: parsed.data.COOKIE_SECURE ? parsed.data.COOKIE_SECURE === 'true' : isProd,
};

export type Env = typeof env;
