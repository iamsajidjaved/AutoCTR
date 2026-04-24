// Pin one PM2 worker per Shoplike API key. Each key is an independent rotating
// IP slot, and the provider in src/providers/shoplikeProxy.js refuses to start
// if a worker's NODE_APP_INSTANCE index has no corresponding key. Adding more
// keys to .env automatically scales the worker pool one-to-one on next start.
require('dotenv').config();

const SHOPLIKE_KEY_COUNT = (process.env.SHOPLIKE_API_KEYS || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean)
  .length;

if (SHOPLIKE_KEY_COUNT === 0) {
  throw new Error('SHOPLIKE_API_KEYS must contain at least one key — workers cannot start.');
}

module.exports = {
  apps: [
    {
      name: 'ctr-api',
      script: './src/server.js',
      instances: 1,
      env: { NODE_ENV: 'development' }
    },
    {
      name: 'ctr-worker',
      script: './src/workers/trafficWorker.js',
      instances: SHOPLIKE_KEY_COUNT,
      exec_mode: 'cluster',
      env: { NODE_ENV: 'production' }
    }
  ]
};
