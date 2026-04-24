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
      instances: 'max',
      exec_mode: 'cluster',
      env: { NODE_ENV: 'production' }
    }
  ]
};
