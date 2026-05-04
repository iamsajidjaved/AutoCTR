// PM2 worker count is sized to host CPU cores (or WORKER_CONCURRENCY env
// override). Each PM2 worker claims exactly one traffic job at a time, so
// total in-flight impressions == instance count. Shoplike API keys are pooled
// inside each worker (see src/providers/shoplikeProxy.js), no longer pinned
// 1:1 to PM2 instances.
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
  JWT_SECRET: process.env.JWT_SECRET || '',
  SHOPLIKE_API_KEYS: process.env.SHOPLIKE_API_KEYS || '',
  REKTCAPTCHA_PATH: process.env.REKTCAPTCHA_PATH || './extensions/rektcaptcha',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3001',
  TZ: process.env.TZ || 'Asia/Dubai',
  PORT: process.env.PORT || '3000',
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
      name: 'ctr-api',
      script: './src/server.js',
      instances: 1,
      exec_mode: 'fork',
      out_file: './logs/ctr-api-out.log',
      error_file: './logs/ctr-api-err.log',
      env: { ...SHARED_ENV, NODE_ENV: 'production' },
    },
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
