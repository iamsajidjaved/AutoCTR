const path = require('path');
const os = require('os');
// Always load .env from the project root so PM2 (which may spawn children with
// a different cwd) still picks it up.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Force the Node process to operate in Dubai time (Asia/Dubai, UTC+4, no DST).
// Set as early as possible — before any module reads `new Date()` for the first time.
const TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Dubai';
process.env.APP_TIMEZONE = TIMEZONE;

const NODE_ENV = process.env.NODE_ENV || 'development';

// Total in-flight traffic jobs across all PM2 workers. Defaults to the host's
// CPU core count: each PM2 worker is pinned to one in-flight job, so worker
// count == this value. Override with WORKER_CONCURRENCY for shared boxes or
// load-shaping experiments.
const parsedConcurrency = parseInt(process.env.WORKER_CONCURRENCY, 10);
const WORKER_CONCURRENCY = Number.isFinite(parsedConcurrency) && parsedConcurrency > 0
  ? parsedConcurrency
  : os.cpus().length;

const SHOPLIKE_API_KEYS = (process.env.SHOPLIKE_API_KEYS || '')
  .split(',').map(k => k.trim()).filter(Boolean);

const config = Object.freeze({
  // Prefer DATABASE_URL (Neon / 12-factor convention); fall back to legacy DB_URL.
  DATABASE_URL: process.env.DATABASE_URL || process.env.DB_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  PORT: process.env.PORT || 3000,
  NODE_ENV,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3001',
  TIMEZONE,
  WORKER_CONCURRENCY,
  // Shared pool of Shoplike API keys. Keys are no longer pinned 1:1 to workers;
  // a cooldown-aware pool in src/providers/shoplikeProxy.js claims a key per
  // job and respects the ~60s rotation window.
  SHOPLIKE_API_KEYS,
  REKTCAPTCHA_PATH: process.env.REKTCAPTCHA_PATH || './extensions/rektcaptcha',
});

if (!config.DATABASE_URL) {
  throw new Error('Missing required env var: DATABASE_URL (legacy DB_URL also accepted)');
}
if (!config.JWT_SECRET) {
  throw new Error('Missing required env var: JWT_SECRET');
}
if (config.SHOPLIKE_API_KEYS.length === 0) {
  throw new Error('SHOPLIKE_API_KEYS must contain at least one key.');
}

module.exports = config;
