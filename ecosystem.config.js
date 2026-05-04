// PM2 config — LOCAL WORKER MACHINES ONLY.
// The dashboard + API run on Vercel (see /dashboard); this file orchestrates
// only the headless traffic execution workers. There is no `ctr-api` process
// anymore — the Express server has been migrated to Next.js Route Handlers
// under /dashboard/app/api.
//
// Each PM2 worker claims exactly one traffic job at a time, so total in-flight
// impressions == instance count. Override the default (= host CPU cores) with
// WORKER_CONCURRENCY for shared boxes or load-shaping experiments.
//
// IMPORTANT: Do NOT set the `TZ` env var here — Vercel reserves it. We use
// APP_TIMEZONE for app-level wall-clock logic instead. The Node process clock
// stays at the OS default; all bucketing/scheduling is timezone-aware via
// Intl APIs (see src/utils/scheduler.js).
const path = require('path');
const os = require('os');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const SHOPLIKE_KEY_COUNT = (process.env.SHOPLIKE_API_KEYS || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean)
  .length;

if (SHOPLIKE_KEY_COUNT === 0) {
  throw new Error('SHOPLIKE_API_KEYS must contain at least one key — workers cannot start.');
}

const parsedConcurrency = parseInt(process.env.WORKER_CONCURRENCY, 10);
const WORKER_CONCURRENCY = Number.isFinite(parsedConcurrency) && parsedConcurrency > 0
  ? parsedConcurrency
  : os.cpus().length;

// Forward selected env vars from the launching shell into PM2-managed children.
// PM2 daemon-spawned children only inherit the env block defined here, so we
// must explicitly propagate everything they need at runtime.
const SHARED_ENV = {
  DATABASE_URL: process.env.DATABASE_URL || process.env.DB_URL || '',
  // JWT_SECRET is needed because shared modules under src/ (loaded via
  // src/config) still validate it at import time. Workers never sign or
  // verify tokens themselves.
  JWT_SECRET: process.env.JWT_SECRET || '',
  SHOPLIKE_API_KEYS: process.env.SHOPLIKE_API_KEYS || '',
  REKTCAPTCHA_PATH: process.env.REKTCAPTCHA_PATH || './extensions/rektcaptcha',
  APP_TIMEZONE: process.env.APP_TIMEZONE || 'Asia/Dubai',
  WORKER_CONCURRENCY: String(WORKER_CONCURRENCY),
};

const COMMON = {
  cwd: __dirname,
  autorestart: true,
  max_restarts: 10,
  restart_delay: 5000,
  merge_logs: true,
  time: true,
};

module.exports = {
  apps: [
    {
      ...COMMON,
      name: 'ctr-worker',
      script: './src/workers/trafficWorker.js',
      instances: WORKER_CONCURRENCY,
      exec_mode: 'cluster',
      // Worker has a 30s in-flight drain on SIGTERM (see trafficWorker.js).
      // PM2's default 1.6s kill_timeout would terminate jobs mid-execution.
      kill_timeout: 35000,
      out_file: './logs/ctr-worker-out.log',
      error_file: './logs/ctr-worker-err.log',
      env: { ...SHARED_ENV, NODE_ENV: 'production' },
    },
  ],
};
