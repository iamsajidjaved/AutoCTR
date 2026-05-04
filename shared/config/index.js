const path = require('path');
const os = require('os');

// Load .env from the worker project for *local* runtime (workers, dev scripts).
// On Vercel, env vars are injected by the platform and no `.env` file exists —
// `dotenv` silently no-ops in that case, which is the desired behavior.
//
// IMPORTANT: Do NOT set or rely on the `TZ` environment variable. Vercel
// reserves `TZ` and forces it to `UTC` for serverless functions. We use
// `APP_TIMEZONE` exclusively for application-level wall-clock logic.
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../worker/.env') });
} catch {
  // dotenv not installed in this environment (e.g. trimmed Vercel bundle) — ignore.
}

const TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Dubai';

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

// Lazy validation. We DO NOT throw at module-load time because:
//  * Next.js imports route modules during "Collecting page data" at build time
//    (e.g. on Vercel's build step) where runtime env vars may not yet be
//    available. A throw at import time would fail the whole build.
//  * Workers and dev runs always have the env populated by the time the first
//    db / auth call happens, so deferring is functionally equivalent.
function require_(name, val) {
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

const config = {
  // Prefer DATABASE_URL (Neon / 12-factor convention); fall back to legacy DB_URL.
  get DATABASE_URL() {
    return require_('DATABASE_URL (legacy DB_URL also accepted)',
      process.env.DATABASE_URL || process.env.DB_URL);
  },
  get JWT_SECRET() {
    return require_('JWT_SECRET', process.env.JWT_SECRET);
  },
  NODE_ENV,
  TIMEZONE,
  WORKER_CONCURRENCY,
  // Worker-only fields. Consumers (src/providers/shoplikeProxy.js,
  // src/services/puppeteerService.js) validate on first use so the
  // Vercel-deployed dashboard does not need these vars set.
  SHOPLIKE_API_KEYS,
  REKTCAPTCHA_PATH: process.env.REKTCAPTCHA_PATH || './extensions/rektcaptcha',
};

module.exports = config;
