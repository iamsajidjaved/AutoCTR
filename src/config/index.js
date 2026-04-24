require('dotenv').config();

const config = Object.freeze({
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3001',
  // Comma-separated list of Shoplike API keys for round-robin rotation
  SHOPLIKE_API_KEYS: (process.env.SHOPLIKE_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean),
  REKTCAPTCHA_PATH: process.env.REKTCAPTCHA_PATH || './extensions/rektcaptcha',
});

if (!config.DATABASE_URL) {
  throw new Error('Missing required env var: DATABASE_URL');
}
if (!config.JWT_SECRET) {
  throw new Error('Missing required env var: JWT_SECRET');
}

module.exports = config;
