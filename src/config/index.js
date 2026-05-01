const path = require('path');
// Always load .env from the project root so PM2 (which may spawn children with
// a different cwd) still picks it up.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Force the Node process to operate in Dubai time (Asia/Dubai, UTC+4, no DST).
// Set as early as possible — before any module reads `new Date()` for the first time.
const TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Dubai';
process.env.APP_TIMEZONE = TIMEZONE;

const NODE_ENV = process.env.NODE_ENV || 'development';

// HEADLESS flag — Puppeteer cannot attach to a foreground display when PM2 is
// running as a detached daemon, so we default to headless in production. Dev
// mode keeps the visible browser for debugging. Override with HEADLESS=true|false.
function parseHeadless() {
  const raw = process.env.HEADLESS;
  if (raw === undefined || raw === '') return NODE_ENV === 'production';
  return /^(1|true|yes|on)$/i.test(raw);
}

const config = Object.freeze({
  // Prefer DATABASE_URL (Neon / 12-factor convention); fall back to legacy DB_URL.
  DATABASE_URL: process.env.DATABASE_URL || process.env.DB_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  PORT: process.env.PORT || 3000,
  NODE_ENV,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3001',
  TIMEZONE,
  HEADLESS: parseHeadless(),
  // Comma-separated list of Shoplike API keys for round-robin rotation
  SHOPLIKE_API_KEYS: (process.env.SHOPLIKE_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean),
  REKTCAPTCHA_PATH: process.env.REKTCAPTCHA_PATH || './extensions/rektcaptcha',
});

if (!config.DATABASE_URL) {
  throw new Error('Missing required env var: DATABASE_URL (legacy DB_URL also accepted)');
}
if (!config.JWT_SECRET) {
  throw new Error('Missing required env var: JWT_SECRET');
}

module.exports = config;
