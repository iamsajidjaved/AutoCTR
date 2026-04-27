require('dotenv').config();

// Force the Node process to operate in Dubai time (Asia/Dubai, UTC+4, no DST).
// Set as early as possible — before any module reads `new Date()` for the first time.
const TIMEZONE = process.env.TZ || 'Asia/Dubai';
process.env.TZ = TIMEZONE;

const config = Object.freeze({
  DATABASE_URL: process.env.POSTGRES_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3001',
  TIMEZONE,
  // Comma-separated list of Shoplike API keys for round-robin rotation
  SHOPLIKE_API_KEYS: (process.env.SHOPLIKE_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean),
  REKTCAPTCHA_PATH: process.env.REKTCAPTCHA_PATH || './extensions/rektcaptcha',
});

if (!config.DATABASE_URL) {
  throw new Error('Missing required env var: POSTGRES_URL');
}
if (!config.JWT_SECRET) {
  throw new Error('Missing required env var: JWT_SECRET');
}

module.exports = config;
